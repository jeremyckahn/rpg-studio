import { zlibSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_TILES,
  PixelMatrixSchema,
  composeSpriteSheet,
  createDefaultTilesetImage,
  createDefaultTilesetPng,
  dataUrlToPng,
  decodePng,
  encodePng,
  matricesToPiskel,
  matricesToPng,
  matrixToRgba,
  parseHexColor,
  parsePiskel,
  pngToDataUrl,
} from '../src'

const heart = {
  palette: ['#00000000', '#ff0044', '#ffffff80'],
  width: 3,
  height: 2,
  pixels: [0, 1, 2, 1, 0, 1],
}

describe('PixelMatrixSchema', () => {
  it('accepts the architecture document format', () => {
    expect(PixelMatrixSchema.safeParse(heart).success).toBe(true)
  })

  it('rejects wrong pixel counts, out-of-palette indices and bad colours', () => {
    expect(PixelMatrixSchema.safeParse({ ...heart, pixels: [0, 1] }).success).toBe(false)
    expect(PixelMatrixSchema.safeParse({ ...heart, pixels: [0, 1, 2, 1, 0, 3] }).success).toBe(
      false,
    )
    expect(PixelMatrixSchema.safeParse({ ...heart, palette: ['red'] }).success).toBe(false)
    expect(PixelMatrixSchema.safeParse({ ...heart, palette: [] }).success).toBe(false)
    expect(PixelMatrixSchema.safeParse({ ...heart, width: 0 }).success).toBe(false)
    expect(PixelMatrixSchema.safeParse({ ...heart, extra: 1 }).success).toBe(false)
  })
})

describe('colour and sheet helpers', () => {
  it('parses #rrggbb and #rrggbbaa', () => {
    expect(parseHexColor('#ff0044')).toEqual([255, 0, 68, 255])
    expect(parseHexColor('#00e43680')).toEqual([0, 228, 54, 128])
  })

  it('expands a matrix to RGBA through its palette', () => {
    const image = matrixToRgba(PixelMatrixSchema.parse(heart))
    expect(image).toMatchObject({ width: 3, height: 2 })
    expect([...image.data.subarray(0, 8)]).toEqual([0, 0, 0, 0, 255, 0, 68, 255])
  })

  it('composes frames into a wrapping sheet', () => {
    const frame = (value: number) => ({
      width: 2,
      height: 1,
      data: Uint8Array.from({ length: 8 }, () => value),
    })
    const sheet = composeSpriteSheet([frame(1), frame(2), frame(3)], 2)
    expect(sheet).toMatchObject({ width: 4, height: 2 })
    expect([...sheet.data.subarray(0, 8)]).toEqual([1, 1, 1, 1, 1, 1, 1, 1])
    expect([...sheet.data.subarray(8, 16)]).toEqual([2, 2, 2, 2, 2, 2, 2, 2])
    expect([...sheet.data.subarray(16, 24)]).toEqual([3, 3, 3, 3, 3, 3, 3, 3])
    expect([...sheet.data.subarray(24, 32)]).toEqual(Array.from({ length: 8 }, () => 0))
    expect(() => composeSpriteSheet([])).toThrow(RangeError)
    expect(() =>
      composeSpriteSheet([frame(1), { width: 1, height: 1, data: new Uint8Array(4) }]),
    ).toThrow(/same size/)
  })
})

describe('PNG codec', () => {
  it('writes a valid PNG signature, IHDR and IEND', () => {
    const png = encodePng({ width: 2, height: 1, data: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8) })
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(new TextDecoder().decode(png.subarray(12, 16))).toBe('IHDR')
    expect(new TextDecoder().decode(png.subarray(png.length - 8, png.length - 4))).toBe('IEND')
  })

  it('matches the CRC of a known reference chunk', () => {
    // The IEND chunk of every PNG has the fixed CRC 0xAE426082.
    const png = encodePng({ width: 1, height: 1, data: new Uint8Array(4) })
    expect([...png.subarray(png.length - 4)]).toEqual([0xae, 0x42, 0x60, 0x82])
  })

  it('round-trips arbitrary pixels exactly', () => {
    const data = Uint8Array.from({ length: 7 * 5 * 4 }, (_, i) => (i * 37 + 11) % 256)
    const decoded = decodePng(encodePng({ width: 7, height: 5, data }))
    expect(decoded.width).toBe(7)
    expect(decoded.height).toBe(5)
    expect([...decoded.data]).toEqual([...data])
  })

  it('rejects mis-sized buffers and non-PNG input', () => {
    expect(() => encodePng({ width: 2, height: 2, data: new Uint8Array(3) })).toThrow(RangeError)
    expect(() => decodePng(Uint8Array.of(1, 2, 3))).toThrow(/Not a PNG/)
  })

  it('decodes scanlines that use the Sub, Up, Average and Paeth filters', () => {
    // Build a 2x3 RGBA image where each row uses a different filter, by hand.
    const rows = [
      [10, 20, 30, 255, 40, 50, 60, 255],
      [15, 25, 35, 255, 45, 55, 65, 255],
      [20, 30, 40, 255, 50, 60, 70, 255],
    ]
    const bpp = 4
    const filterRow = (row: number[], previous: number[], filter: number): number[] =>
      row.map((value, x) => {
        const left = x >= bpp ? (row[x - bpp] as number) : 0
        const up = previous[x] ?? 0
        const upLeft = x >= bpp ? (previous[x - bpp] ?? 0) : 0
        const p = left + up - upLeft
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)] as const
        const paeth = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
        const predictor = [0, left, up, (left + up) >> 1, paeth][filter] as number
        return (value - predictor) & 0xff
      })
    const zero = [0, 0, 0, 0, 0, 0, 0, 0]
    const raw = Uint8Array.from([
      1,
      ...filterRow(rows[0] as number[], zero, 1),
      2,
      ...filterRow(rows[1] as number[], rows[0] as number[], 2),
      4,
      ...filterRow(rows[2] as number[], rows[1] as number[], 4),
    ])
    const reference = encodePng({ width: 2, height: 3, data: Uint8Array.from(rows.flat()) })
    // Reuse the reference PNG's chunks but swap in our filtered IDAT payload.
    const idatStart = reference.indexOf(0x49, 33) - 4
    const header = reference.subarray(0, idatStart)
    const payload = zlibSync(raw)
    const idat = new Uint8Array(12 + payload.length)
    new DataView(idat.buffer).setUint32(0, payload.length)
    idat.set(new TextEncoder().encode('IDAT'), 4)
    idat.set(payload, 8)
    const iend = reference.subarray(reference.length - 12)
    const png = new Uint8Array([...header, ...idat, ...iend])
    expect([...decodePng(png).data]).toEqual(rows.flat())
  })

  it('converts to and from data URLs', () => {
    const png = encodePng({ width: 1, height: 1, data: Uint8Array.of(9, 8, 7, 255) })
    expect(pngToDataUrl(png).startsWith('data:image/png;base64,')).toBe(true)
    expect([...dataUrlToPng(pngToDataUrl(png))]).toEqual([...png])
    expect(() => dataUrlToPng('data:text/plain;base64,AAAA')).toThrow()
  })
})

describe('Piskel files', () => {
  const frames = [heart, { ...heart, pixels: [1, 1, 1, 1, 1, 1] }] as never[]

  it('serialises to the documented Piskel structure', () => {
    const file = JSON.parse(matricesToPiskel('hero', frames, 8)) as {
      modelVersion: number
      piskel: { name: string; fps: number; width: number; height: number; layers: string[] }
    }
    expect(file).toMatchObject({
      modelVersion: 2,
      piskel: { name: 'hero', fps: 8, width: 3, height: 2 },
    })
    const layer = JSON.parse(file.piskel.layers[0] as string) as {
      frameCount: number
      chunks: { layout: number[][]; base64PNG: string }[]
    }
    expect(layer.frameCount).toBe(2)
    expect(layer.chunks[0]?.layout).toEqual([[0], [1]])
    expect(layer.chunks[0]?.base64PNG.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('round-trips frames pixel for pixel', () => {
    const parsed = parsePiskel(matricesToPiskel('hero', frames, 8))
    expect(parsed).toMatchObject({ name: 'hero', fps: 8, width: 3, height: 2 })
    expect(parsed.frames).toHaveLength(2)
    parsed.frames.forEach((frame, index) => {
      expect([...frame.data]).toEqual([...matrixToRgba(frames[index] as never).data])
    })
  })

  it('rejects malformed documents', () => {
    expect(() => parsePiskel('{}')).toThrow()
    expect(() => matricesToPiskel('x', [])).toThrow(RangeError)
  })

  it('builds sprite sheet PNGs from matrices', () => {
    const sheet = decodePng(matricesToPng(frames, 2))
    expect(sheet).toMatchObject({ width: 6, height: 2 })
  })
})

describe('default tileset', () => {
  it('is deterministic and decodes to the documented 8x2 grid of 16px tiles', () => {
    const first = createDefaultTilesetPng()
    expect([...createDefaultTilesetPng()]).toEqual([...first])
    const image = decodePng(first)
    expect(image).toMatchObject({ width: 128, height: 32 })
    expect(DEFAULT_TILES).toHaveLength(16)
  })

  it('draws opaque tiles in distinct colours', () => {
    const image = createDefaultTilesetImage()
    const alphaOk = Array.from(
      { length: image.width * image.height },
      (_, i) => image.data[i * 4 + 3],
    ).every((a) => a === 255)
    expect(alphaOk).toBe(true)
    const centre = (tile: number): string =>
      [0, 1, 2]
        .map(
          (c) =>
            image.data[
              ((Math.floor(tile / 8) * 16 + 4) * image.width + (tile % 8) * 16 + 4) * 4 + c
            ],
        )
        .join(',')
    expect(new Set([0, 1, 2, 3, 4].map(centre)).size).toBeGreaterThan(3)
  })
})
