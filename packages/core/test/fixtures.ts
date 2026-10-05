import { type Project } from '../src'
import { CollisionFlags } from '../src'

export const stats = {
  maxHp: 100,
  maxMp: 20,
  attack: 10,
  defense: 8,
  magic: 5,
  speed: 7,
  luck: 3,
}

export const growth = { maxHp: 12, maxMp: 3, attack: 2, defense: 2, magic: 1, speed: 1, luck: 0.5 }

export const emptyLayerData = (cells: number): number[] => Array.from({ length: cells }, () => 0)

export const validMap = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'Village',
  width: 4,
  height: 3,
  tileSize: 16,
  tileset: 'img/tilesets/basic.png',
  layers: [{ name: 'Ground', visible: true, data: emptyLayerData(12) }],
  collision: Array.from({ length: 12 }, () => CollisionFlags.PASSABLE),
  events: [],
  ...overrides,
})

export const validProject = (): unknown => ({
  meta: {
    format: 'rpgstudio-project',
    formatVersion: 1,
    name: 'Test Quest',
    startMapId: 1,
    startX: 1,
    startY: 1,
  },
  database: {
    actors: [{ id: 1, name: 'Hero', classId: 1 }],
    classes: [
      { id: 1, name: 'Warrior', baseStats: stats, growth, learnings: [{ level: 2, skillId: 1 }] },
    ],
    items: [
      { id: 1, name: 'Potion', kind: 'consumable', effects: [{ type: 'recoverHp', value: 50 }] },
    ],
    skills: [{ id: 1, name: 'Slash', target: 'enemy' }],
    enemies: [{ id: 1, name: 'Slime', stats, drops: [{ itemId: 1, chance: 0.5 }] }],
  },
  maps: [validMap()],
})

export type ParsedProject = Project
