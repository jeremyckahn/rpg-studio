import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { decodePng } from '@rpgstudio/core'
import { describe, expect, it, vi } from 'vitest'

import { createAppUpdater } from '../src/pwa/register'

const read = (path: string): Uint8Array => new Uint8Array(readFileSync(join(__dirname, '..', path)))

describe('PWA assets', () => {
  it.each([
    ['public/icons/icon-192.png', 192],
    ['public/icons/icon-512.png', 512],
    ['public/icons/icon-maskable-512.png', 512],
    ['public/icons/apple-touch-icon.png', 180],
  ])('%s is a valid %ipx square PNG', (path, size) => {
    const image = decodePng(read(path))
    expect(image).toMatchObject({ width: size, height: size })
  })

  it('maskable icons keep their artwork inside the safe zone', () => {
    const image = decodePng(read('public/icons/icon-maskable-512.png'))
    const background = [...image.data.subarray(0, 3)]
    // The outer 10% frame is a single flat background colour, so launchers can crop it freely.
    const margin = Math.floor(512 * 0.1)
    const edgePixels = Array.from({ length: 512 }, (_, i) => [
      i,
      margin - 1,
      margin - 1,
      i,
    ]).flatMap(([x, y, x2, y2]) => [
      [
        ...image.data.subarray(
          ((y ?? 0) * 512 + (x ?? 0)) * 4,
          ((y ?? 0) * 512 + (x ?? 0)) * 4 + 3,
        ),
      ],
      [
        ...image.data.subarray(
          ((y2 ?? 0) * 512 + (x2 ?? 0)) * 4,
          ((y2 ?? 0) * 512 + (x2 ?? 0)) * 4 + 3,
        ),
      ],
    ])
    expect(edgePixels.every((pixel) => pixel.join() === background.join())).toBe(true)
  })
})

describe('service worker registration', () => {
  it('does nothing outside production, so development is never served from a stale cache', async () => {
    const hooks = { onUpdateReady: vi.fn(), onOfflineReady: vi.fn() }
    const updater = createAppUpdater(hooks)
    await expect(updater.register()).resolves.toBeUndefined()
    await expect(updater.apply()).resolves.toBeUndefined()
    expect(hooks.onUpdateReady).not.toHaveBeenCalled()
  })
})
