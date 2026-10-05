import { DEFAULT_TILESET_PATH } from '../pixel/defaultTileset.ts'
import { type Project, PROJECT_FORMAT, PROJECT_FORMAT_VERSION } from '../schemas/project.ts'
import { CollisionFlags, type Tilemap, type TileSize } from '../schemas/tilemap.ts'

export interface NewMapOptions {
  readonly id: number
  readonly name: string
  readonly width: number
  readonly height: number
  readonly tileSize?: TileSize
  readonly tileset?: string
  /** Tile id the ground layer is filled with. Defaults to 1. */
  readonly fill?: number
}

export const createEmptyMap = ({
  id,
  name,
  width,
  height,
  tileSize = 16,
  tileset = DEFAULT_TILESET_PATH,
  fill = 1,
}: NewMapOptions): Tilemap => {
  const cells = width * height
  return {
    id,
    name,
    width,
    height,
    tileSize,
    tileset,
    layers: [
      {
        name: 'Ground',
        visible: true,
        above: false,
        data: Array.from({ length: cells }, () => fill),
      },
      {
        name: 'Objects',
        visible: true,
        above: false,
        data: Array.from({ length: cells }, () => 0),
      },
      { name: 'Overlay', visible: true, above: true, data: Array.from({ length: cells }, () => 0) },
    ],
    collision: Array.from({ length: cells }, () => CollisionFlags.PASSABLE),
    events: [],
  }
}

/** A small valid project: one grass map, a starter class, actor, skill and item. */
export const createStarterProject = (name = 'My Game'): Project => ({
  meta: {
    format: PROJECT_FORMAT,
    formatVersion: PROJECT_FORMAT_VERSION,
    name,
    startMapId: 1,
    startX: 10,
    startY: 7,
    startDirection: 'down',
    startParty: [1],
    startGold: 0,
    plugins: [],
    switchNames: {},
    variableNames: {},
  },
  database: {
    actors: [
      {
        id: 1,
        name: 'Hero',
        nickname: '',
        classId: 1,
        initialLevel: 1,
        maxLevel: 99,
        description: '',
      },
    ],
    classes: [
      {
        id: 1,
        name: 'Warrior',
        description: '',
        baseStats: { maxHp: 120, maxMp: 20, attack: 12, defense: 9, magic: 4, speed: 8, luck: 5 },
        growth: { maxHp: 14, maxMp: 2, attack: 2.5, defense: 2, magic: 0.5, speed: 1, luck: 0.5 },
        learnings: [{ level: 2, skillId: 1 }],
      },
    ],
    items: [
      {
        id: 1,
        name: 'Potion',
        description: 'Restores 50 HP.',
        kind: 'consumable',
        price: 50,
        effects: [{ type: 'recoverHp', value: 50 }],
        statBonuses: {},
      },
    ],
    skills: [
      {
        id: 1,
        name: 'Power Strike',
        description: 'A heavy blow.',
        mpCost: 4,
        target: 'enemy',
        element: 'none',
        effects: [{ type: 'damageHp', value: 30 }],
      },
    ],
    enemies: [],
  },
  maps: [createEmptyMap({ id: 1, name: 'Map 1', width: 20, height: 15 })],
})
