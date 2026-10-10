import { type Direction } from '@rpgstudio/core'
import { Container, Rectangle, Sprite, Texture } from 'pixi.js'

import { type Entity } from '../ecs/entity.ts'
import { type Game } from '../game/game.ts'
import { visualTile, walkFrameIndex } from './characters.ts'
import { type TextureProvider } from './textures.ts'

const PLACEHOLDER_TINT = 0xff3366

export interface CharacterLayer {
  readonly container: Container
  /** Creates, moves and removes sprites so they mirror the world. */
  sync: () => void
  /** Resolves when every sprite sheet requested so far has finished loading (or failed). */
  settled: () => Promise<void>
  destroy: () => void
}

/**
 * Draws every entity that has a sprite component (and a marker for a player
 * without one). Sprites are bottom-centre anchored on their tile and sorted by
 * their feet so characters further down the map overlap those above.
 */
export const createCharacterLayer = (game: Game, textures: TextureProvider): CharacterLayer => {
  const container = new Container({ sortableChildren: true })
  let sprites: ReadonlyMap<Entity, Sprite> = new Map()
  let frameTextures: ReadonlyMap<string, Texture> = new Map()
  let pendingSheets: ReadonlyMap<string, Promise<unknown>> = new Map()
  let lastSheets: ReadonlyMap<string, Texture> = new Map()

  const requestSheet = (path: string): void => {
    if (pendingSheets.has(path)) return
    const request = textures.load(path).finally(() => {
      pendingSheets = new Map([...pendingSheets].filter(([pending]) => pending !== path))
    })
    pendingSheets = new Map(pendingSheets).set(path, request)
    void request
  }

  const frameTexture = (entity: Entity): Texture | undefined => {
    const data = entity.sprite
    if (!data) return Texture.WHITE
    const sheet = textures.get(data.sheet)
    if (!sheet) {
      requestSheet(data.sheet)
      return undefined
    }
    // Reloaded sheets are new objects; cached frames of the old one are stale.
    if (lastSheets.get(data.sheet) !== sheet) {
      lastSheets = new Map(lastSheets).set(data.sheet, sheet)
      frameTextures = new Map(
        [...frameTextures].filter(([key]) => !key.startsWith(`${data.sheet}|`)),
      )
    }
    const columns = Math.max(1, Math.floor(sheet.width / data.frameWidth))
    const rows = Math.max(1, Math.floor(sheet.height / data.frameHeight))
    const direction: Direction = entity.movement?.direction ?? 'down'
    const animated = data.frame === 0 && columns >= 3 && rows >= 4
    const frame = animated
      ? walkFrameIndex(
          direction,
          entity.movement?.target != null,
          entity.movement?.progress ?? 0,
          columns,
          rows,
        )
      : data.frame
    const key = `${data.sheet}|${data.frameWidth}x${data.frameHeight}|${frame}`
    const cached = frameTextures.get(key)
    if (cached) return cached
    const texture = new Texture({
      source: sheet.source,
      frame: new Rectangle(
        (frame % columns) * data.frameWidth,
        Math.floor(frame / columns) * data.frameHeight,
        data.frameWidth,
        data.frameHeight,
      ),
    })
    frameTextures = new Map(frameTextures).set(key, texture)
    return texture
  }

  const sync = (): void => {
    const tileSize = game.state.map.tileSize
    const live = new Set<Entity>()
    for (const entity of game.world.with('position')) {
      if (!entity.sprite && entity.kind !== 'player') continue
      const texture = frameTexture(entity)
      const at = visualTile(entity)
      if (!texture || !at) continue
      live.add(entity)

      const existing = sprites.get(entity)
      const sprite = existing ?? new Sprite(texture)
      if (!existing) {
        sprites = new Map(sprites).set(entity, sprite)
        container.addChild(sprite)
      }
      sprite.texture = texture
      if (entity.sprite) {
        sprite.anchor.set(0.5, 1)
        sprite.tint = 0xffffff
      } else {
        // Placeholder marker for a player with no sprite sheet yet.
        sprite.anchor.set(0.5, 1)
        sprite.tint = PLACEHOLDER_TINT
        sprite.width = tileSize * 0.75
        sprite.height = tileSize * 0.75
      }
      sprite.x = Math.round(at.x * tileSize + tileSize / 2)
      sprite.y = Math.round((at.y + 1) * tileSize)
      sprite.zIndex = sprite.y
    }

    for (const [entity, sprite] of sprites) {
      if (live.has(entity)) continue
      container.removeChild(sprite)
      sprite.destroy()
    }
    sprites = new Map([...sprites].filter(([entity]) => live.has(entity)))
  }

  return {
    container,
    sync,
    settled: async () => {
      await Promise.allSettled(pendingSheets.values())
    },
    destroy: () => {
      container.destroy({ children: true })
      sprites = new Map()
    },
  }
}
