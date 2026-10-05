import { z } from 'zod'

import { type PixelMatrix, type RgbaImage, composeSpriteSheet, matrixToRgba } from './matrix.ts'
import { dataUrlToPng, decodePng, encodePng, pngToDataUrl } from './png.ts'

/**
 * Piskel project files (`.piskel`) are JSON whose layers are JSON-encoded
 * strings. Frames are stored as one PNG strip per layer; `layout` lists, for
 * each column of the strip, the frame indices stacked in it.
 */
const PiskelLayerSchema = z.object({
  name: z.string(),
  opacity: z.number().default(1),
  frameCount: z.int().min(1),
  chunks: z
    .array(z.object({ layout: z.array(z.array(z.int().min(0))), base64PNG: z.string() }))
    .min(1),
})

export const PiskelFileSchema = z.object({
  modelVersion: z.number(),
  piskel: z.object({
    name: z.string(),
    description: z.string().default(''),
    fps: z.number().default(12),
    height: z.int().min(1),
    width: z.int().min(1),
    layers: z.array(z.string()).min(1),
  }),
})
export type PiskelFile = z.infer<typeof PiskelFileSchema>

export interface PiskelDocument {
  readonly name: string
  readonly fps: number
  readonly width: number
  readonly height: number
  readonly frames: readonly RgbaImage[]
}

const frameSlice = (
  image: RgbaImage,
  column: number,
  row: number,
  width: number,
  height: number,
): RgbaImage => ({
  width,
  height,
  data: Uint8Array.from(
    { length: width * height * 4 },
    (_, i) =>
      image.data[
        ((row * height + Math.floor(i / (width * 4))) * image.width + column * width) * 4 +
          (i % (width * 4))
      ] ?? 0,
  ),
})

/** Serialises frames to the `.piskel` JSON text Piskel itself opens. */
export const serializePiskel = (document: PiskelDocument): string => {
  const { frames, width, height } = document
  if (frames.length === 0) throw new RangeError('A Piskel document needs at least one frame')
  const strip = composeSpriteSheet(frames, frames.length)
  const layer = {
    name: 'Layer 1',
    opacity: 1,
    frameCount: frames.length,
    chunks: [
      {
        layout: frames.map((_, index) => [index]),
        base64PNG: pngToDataUrl(encodePng(strip)),
      },
    ],
  }
  const file: PiskelFile = {
    modelVersion: 2,
    piskel: {
      name: document.name,
      description: '',
      fps: document.fps,
      height,
      width,
      layers: [JSON.stringify(layer)],
    },
  }
  return JSON.stringify(file)
}

/** Reads the first layer of a `.piskel` file back into RGBA frames. */
export const parsePiskel = (text: string): PiskelDocument => {
  const file = PiskelFileSchema.parse(JSON.parse(text))
  const { width, height } = file.piskel
  const layer = PiskelLayerSchema.parse(JSON.parse(file.piskel.layers[0] as string))
  const frames = layer.chunks.flatMap((chunk) => {
    const image = decodePng(dataUrlToPng(chunk.base64PNG))
    return chunk.layout
      .flatMap((column, x) => column.map((_, y) => ({ index: column[y] as number, x, y })))
      .map(({ index, x, y }) => ({ index, image: frameSlice(image, x, y, width, height) }))
  })
  return {
    name: file.piskel.name,
    fps: file.piskel.fps,
    width,
    height,
    frames: frames.toSorted((a, b) => a.index - b.index).map(({ image }) => image),
  }
}

/** Converts AI pixel matrices (one per frame) into a `.piskel` project. */
export const matricesToPiskel = (
  name: string,
  frames: readonly PixelMatrix[],
  fps = 12,
): string => {
  const first = frames[0]
  if (!first) throw new RangeError('A Piskel document needs at least one frame')
  return serializePiskel({
    name,
    fps,
    width: first.width,
    height: first.height,
    frames: frames.map(matrixToRgba),
  })
}

/** Converts AI pixel matrices (one per frame) into a PNG sprite sheet. */
export const matricesToPng = (frames: readonly PixelMatrix[], columns?: number): Uint8Array =>
  encodePng(composeSpriteSheet(frames.map(matrixToRgba), columns))
