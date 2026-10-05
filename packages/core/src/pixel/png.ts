/* eslint-disable functional/immutable-data --
   Binary codecs fill freshly allocated byte buffers; nothing is shared or
   observable until the function returns. */
import { unzlibSync, zlibSync } from 'fflate'

import { type RgbaImage } from './matrix.ts'

const SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) =>
  Array.from({ length: 8 }).reduce<number>((c) => (c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1), n),
)

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** Encodes 8-bit RGBA as a PNG. Works identically in browsers and Node. */
export const encodePng = ({ width, height, data }: RgbaImage): Uint8Array => {
  if (data.length !== width * height * 4) {
    throw new RangeError(`Expected ${width * height * 4} RGBA bytes, got ${data.length}`)
  }
  const stride = width * 4
  const raw = new Uint8Array((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    // Filter type 0 (None) for every scanline.
    raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header.set([8, 6, 0, 0, 0], 8) // 8-bit, RGBA, deflate, adaptive filtering, no interlace
  const parts = [
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', zlibSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]
  const png = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  parts.reduce((offset, part) => {
    png.set(part, offset)
    return offset + part.length
  }, 0)
  return png
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/**
 * Decodes non-interlaced 8-bit RGB/RGBA PNGs, which covers everything this
 * project and browser canvases produce. Throws on anything else.
 */
export const decodePng = (png: Uint8Array): RgbaImage => {
  if (png.length < 8 || SIGNATURE.some((byte, i) => png[i] !== byte)) {
    throw new Error('Not a PNG file')
  }
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  let width = 0
  let height = 0
  let colorType = -1
  let idat: Uint8Array[] = []
  for (let offset = 8; offset + 8 <= png.length;) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8))
    const body = png.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8)
      height = view.getUint32(offset + 12)
      const bitDepth = body[8]
      colorType = body[9] ?? -1
      if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2) || body[12] !== 0) {
        throw new Error('Only non-interlaced 8-bit RGB and RGBA PNGs are supported')
      }
    } else if (type === 'IDAT') {
      idat = [...idat, body]
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }
  if (width === 0 || height === 0) throw new Error('PNG has no IHDR chunk')

  const compressed = new Uint8Array(idat.reduce((total, part) => total + part.length, 0))
  idat.reduce((offset, part) => {
    compressed.set(part, offset)
    return offset + part.length
  }, 0)
  const raw = unzlibSync(compressed)

  const bpp = colorType === 6 ? 4 : 3
  const stride = width * bpp
  if (raw.length !== (stride + 1) * height) throw new Error('PNG pixel data has the wrong length')
  const pixels = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] as number
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x] as number
      const left = x >= bpp ? (pixels[y * stride + x - bpp] as number) : 0
      const up = y > 0 ? (pixels[(y - 1) * stride + x] as number) : 0
      const upLeft = y > 0 && x >= bpp ? (pixels[(y - 1) * stride + x - bpp] as number) : 0
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? (left + up) >> 1
                : paeth(left, up, upLeft)
      if (filter > 4) throw new Error(`Unknown PNG filter type ${filter}`)
      pixels[y * stride + x] = (value + predictor) & 0xff
    }
  }
  if (bpp === 4) return { width, height, data: pixels }
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    rgba.set(pixels.subarray(i * 3, i * 3 + 3), i * 4)
    rgba[i * 4 + 3] = 255
  }
  return { width, height, data: rgba }
}

export const pngToDataUrl = (png: Uint8Array): string =>
  `data:image/png;base64,${btoa(Array.from(png, (byte) => String.fromCharCode(byte)).join(''))}`

export const dataUrlToPng = (dataUrl: string): Uint8Array => {
  const prefix = 'data:image/png;base64,'
  if (!dataUrl.startsWith(prefix)) throw new Error('Expected a data:image/png;base64 URL')
  return Uint8Array.from(atob(dataUrl.slice(prefix.length)), (char) => char.charCodeAt(0))
}
