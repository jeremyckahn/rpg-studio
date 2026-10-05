import { z } from 'zod'

import { HexColorSchema } from '../schemas/common.ts'
import { type ValidationIssue, issuesCheck } from '../schemas/refine.ts'

/**
 * The AI-friendly sprite format: an indexed palette plus a flat pixel array.
 *
 * ```json
 * { "palette": ["#00000000", "#ff0044"], "width": 2, "height": 1, "pixels": [0, 1] }
 * ```
 */
const PixelMatrixShapeSchema = z.strictObject({
  palette: z.array(HexColorSchema).min(1).max(256),
  width: z.int().min(1).max(512),
  height: z.int().min(1).max(512),
  /** Row-major palette indices, `width * height` entries. */
  pixels: z.array(z.int().min(0).max(255)),
})
type PixelMatrixShape = z.infer<typeof PixelMatrixShapeSchema>

const validatePixelMatrix = (matrix: PixelMatrixShape): ValidationIssue[] => [
  ...(matrix.pixels.length === matrix.width * matrix.height
    ? []
    : [
        {
          path: ['pixels'],
          message: `Expected ${matrix.width * matrix.height} pixels (${matrix.width}x${matrix.height}) but got ${matrix.pixels.length}`,
        },
      ]),
  ...matrix.pixels.flatMap((index, position) =>
    index < matrix.palette.length
      ? []
      : [
          {
            path: ['pixels', position],
            message: `Palette index ${index} is out of range for a ${matrix.palette.length}-colour palette`,
          },
        ],
  ),
]

export const PixelMatrixSchema = PixelMatrixShapeSchema.check(issuesCheck(validatePixelMatrix))
export type PixelMatrix = z.infer<typeof PixelMatrixSchema>

export interface RgbaImage {
  readonly width: number
  readonly height: number
  /** `width * height * 4` bytes, RGBA order. */
  readonly data: Uint8Array
}

/** Parses `#rrggbb` or `#rrggbbaa` into `[r, g, b, a]`. */
export const parseHexColor = (hex: string): readonly [number, number, number, number] => {
  const digits = hex.slice(1)
  const byte = (offset: number): number => Number.parseInt(digits.slice(offset, offset + 2), 16)
  return [byte(0), byte(2), byte(4), digits.length === 8 ? byte(6) : 255]
}

export const matrixToRgba = (matrix: PixelMatrix): RgbaImage => {
  const colors = matrix.palette.map(parseHexColor)
  return {
    width: matrix.width,
    height: matrix.height,
    data: Uint8Array.from(matrix.pixels.flatMap((index) => colors[index] ?? [0, 0, 0, 0])),
  }
}

/** Lays frames out left to right, wrapping after `columns` frames. */
export const composeSpriteSheet = (
  frames: readonly RgbaImage[],
  columns = frames.length,
): RgbaImage => {
  const first = frames[0]
  if (!first) throw new RangeError('A sprite sheet needs at least one frame')
  const mismatched = frames.find((f) => f.width !== first.width || f.height !== first.height)
  if (mismatched) throw new RangeError('All frames in a sprite sheet must share the same size')
  const cols = Math.max(1, Math.min(columns, frames.length))
  const rows = Math.ceil(frames.length / cols)
  const width = cols * first.width
  const height = rows * first.height
  const data = new Uint8Array(width * height * 4)
  frames.forEach((frame, index) => {
    const originX = (index % cols) * first.width
    const originY = Math.floor(index / cols) * first.height
    for (let y = 0; y < frame.height; y++) {
      const source = y * frame.width * 4
      data.set(
        frame.data.subarray(source, source + frame.width * 4),
        ((originY + y) * width + originX) * 4,
      )
    }
  })
  return { width, height, data }
}
