import { crc32, deflateSync } from 'node:zlib'

const chunk = (type: string, data: Buffer): Buffer => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, checksum])
}

/** A valid PNG of one colour, for upload tests that need a real image. */
export const solidPng = (
  width: number,
  height: number,
  [red, green, blue, alpha]: readonly [number, number, number, number] = [200, 40, 40, 255],
): Buffer => {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.writeUInt8(8, 8) // bit depth
  header.writeUInt8(6, 9) // RGBA
  const row = Buffer.concat([
    Buffer.from([0]), // filter: none
    Buffer.from(Array.from({ length: width }, () => [red, green, blue, alpha]).flat()),
  ])
  const pixels = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** A few bytes that stand in for audio; the editor stores audio without decoding it. */
export const fakeAudio = (): Buffer => Buffer.from('OggS\0\u0002 fake audio for tests')
