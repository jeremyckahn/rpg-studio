/**
 * Draws the app icons with the project's own PNG encoder, so they are
 * reproducible and need no image tooling:
 *
 *   pnpm --filter @rpgstudio/editor icons
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { type RgbaImage, encodePng } from '@rpgstudio/core'

type Rgb = readonly [number, number, number]

const GRASS: Rgb = [74, 156, 70]
const DIRT: Rgb = [140, 98, 62]
const WATER: Rgb = [52, 110, 200]
const STONE: Rgb = [140, 140, 148]
const HERO: Rgb = [255, 51, 102]
const BACKGROUND: Rgb = [27, 29, 58]

/** A 4x4 map of tiles, each drawn 4px wide, with a red hero standing on it. */
const LAYOUT: readonly (readonly Rgb[])[] = [
  [GRASS, GRASS, GRASS, DIRT],
  [GRASS, WATER, WATER, DIRT],
  [GRASS, WATER, WATER, GRASS],
  [STONE, STONE, GRASS, GRASS],
]

const SOURCE_SIZE = 16

const shade = ([r, g, b]: Rgb, amount: number): Rgb => [
  Math.max(0, Math.round(r * amount)),
  Math.max(0, Math.round(g * amount)),
  Math.max(0, Math.round(b * amount)),
]

const pixelAt = (x: number, y: number): Rgb => {
  const tile = LAYOUT[Math.floor(y / 4)]?.[Math.floor(x / 4)] ?? GRASS
  const hero = x >= 6 && x <= 9 && y >= 5 && y <= 10
  if (hero) return y === 5 || y === 10 || x === 6 || x === 9 ? shade(HERO, 0.65) : HERO
  // A darker top and left edge on every tile gives the grid a pixel-art look.
  return x % 4 === 0 || y % 4 === 0 ? shade(tile, 0.8) : tile
}

/** The 16x16 artwork enlarged to `size` with nearest-neighbour sampling, inset by `margin` of the icon. */
const render = (size: number, margin: number): RgbaImage => {
  const inner = Math.round(size * (1 - margin * 2))
  const offset = Math.round(size * margin)
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const inside = x >= offset && y >= offset && x < offset + inner && y < offset + inner
      const [r, g, b] = inside
        ? pixelAt(
            Math.min(SOURCE_SIZE - 1, Math.floor(((x - offset) * SOURCE_SIZE) / inner)),
            Math.min(SOURCE_SIZE - 1, Math.floor(((y - offset) * SOURCE_SIZE) / inner)),
          )
        : BACKGROUND
      data.set([r, g, b, 255], (y * size + x) * 4)
    }
  }
  return { width: size, height: size, data }
}

const here = dirname(fileURLToPath(import.meta.url))
const output = join(here, '..', 'public', 'icons')
mkdirSync(output, { recursive: true })

const icons = [
  { name: 'icon-192.png', size: 192, margin: 0 },
  { name: 'icon-512.png', size: 512, margin: 0 },
  // Maskable icons keep the artwork inside the safe zone (the central 80%).
  { name: 'icon-maskable-512.png', size: 512, margin: 0.12 },
  { name: 'apple-touch-icon.png', size: 180, margin: 0 },
] as const

for (const { name, size, margin } of icons) {
  writeFileSync(join(output, name), encodePng(render(size, margin)))
  console.log(`wrote ${name}`)
}
