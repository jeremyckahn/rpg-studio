import {
  ActorSchema,
  CollisionFlags,
  MapEventSchema,
  type Project,
  type ProjectAction,
  ProjectSchema,
  type Tilemap,
} from '@rpgstudio/core'
import { describe, expect, it } from 'vitest'

import { applyProjectAction } from '../src/store'
import { floodFillCells } from '../src/store/floodFill'
import { sampleProject } from './helpers'

const succeed = (project: Project, action: ProjectAction): Project => {
  const result = applyProjectAction(project, action)
  if (!result.success) throw new Error(`expected success but got: ${result.error}`)
  // Whatever an action does, the project must remain a valid project.
  expect(ProjectSchema.safeParse(result.data).success).toBe(true)
  return result.data
}

const reject = (project: Project, action: ProjectAction): string => {
  const result = applyProjectAction(project, action)
  if (result.success) throw new Error('expected the action to be refused')
  return result.error
}

const mapOf = (project: Project, id: number): Tilemap => {
  const map = project.maps.find((candidate) => candidate.id === id)
  if (!map) throw new Error(`no map ${id}`)
  return map
}

const tileAt = (project: Project, mapId: number, layer: number, x: number, y: number): number => {
  const map = mapOf(project, mapId)
  return map.layers[layer]?.data[y * map.width + x] ?? -1
}

describe('floodFillCells', () => {
  const size = { width: 4, height: 3 }
  const data = [1, 1, 2, 2, 1, 2, 2, 1, 1, 1, 1, 1]

  it('collects the 4-connected region of equal values', () => {
    expect(floodFillCells(size, data, { x: 0, y: 0 }).toSorted((a, b) => a - b)).toEqual([
      0, 1, 4, 7, 8, 9, 10, 11,
    ])
    expect(floodFillCells(size, data, { x: 2, y: 0 }).toSorted((a, b) => a - b)).toEqual([
      2, 3, 5, 6,
    ])
  })

  it('does not leak across diagonals', () => {
    const checker = [1, 0, 0, 1]
    expect(floodFillCells({ width: 2, height: 2 }, checker, { x: 0, y: 0 })).toEqual([0])
  })

  it('fills a uniform grid completely and handles a single cell', () => {
    expect(
      floodFillCells({ width: 3, height: 3 }, new Array<number>(9).fill(5), { x: 1, y: 1 }),
    ).toHaveLength(9)
    expect(floodFillCells({ width: 1, height: 1 }, [7], { x: 0, y: 0 })).toEqual([0])
  })

  it('returns nothing for a start outside the grid', () => {
    expect(floodFillCells(size, data, { x: 4, y: 0 })).toEqual([])
    expect(floodFillCells(size, data, { x: 0, y: -1 })).toEqual([])
  })
})

describe('tile editing', () => {
  const project = sampleProject()

  it('sets tiles without touching other cells, layers or maps', () => {
    const next = succeed(project, {
      type: 'project/setTiles',
      payload: {
        mapId: 1,
        layer: 1,
        cells: [
          { x: 2, y: 1, tile: 7 },
          { x: 0, y: 0, tile: 3 },
        ],
      },
    })
    expect(tileAt(next, 1, 1, 2, 1)).toBe(7)
    expect(tileAt(next, 1, 1, 0, 0)).toBe(3)
    expect(tileAt(next, 1, 1, 1, 1)).toBe(0)
    expect(next.maps[0]?.layers[0]).toBe(project.maps[0]?.layers[0]) // untouched layers are shared
    expect(next.maps[1]).toBe(project.maps[1])
    expect(tileAt(project, 1, 1, 2, 1)).toBe(0) // the input is never mutated
  })

  it('applies the last write when a cell appears twice', () => {
    const next = succeed(project, {
      type: 'project/setTiles',
      payload: {
        mapId: 1,
        layer: 0,
        cells: [
          { x: 1, y: 1, tile: 4 },
          { x: 1, y: 1, tile: 9 },
        ],
      },
    })
    expect(tileAt(next, 1, 0, 1, 1)).toBe(9)
  })

  it('refuses a whole action if any cell is outside the map, applying nothing', () => {
    const error = reject(project, {
      type: 'project/setTiles',
      payload: {
        mapId: 1,
        layer: 0,
        cells: [
          { x: 0, y: 0, tile: 5 },
          { x: 6, y: 0, tile: 5 },
        ],
      },
    })
    expect(error).toMatch(/\(6, 0\) is outside the 6x4 map/)
  })

  it('refuses missing maps and layers', () => {
    expect(
      reject(project, {
        type: 'project/setTiles',
        payload: { mapId: 9, layer: 0, cells: [{ x: 0, y: 0, tile: 1 }] },
      }),
    ).toMatch(/Map 9 does not exist/)
    expect(
      reject(project, {
        type: 'project/setTiles',
        payload: { mapId: 1, layer: 5, cells: [{ x: 0, y: 0, tile: 1 }] },
      }),
    ).toMatch(/no layer 5/)
  })

  it('fills a rectangle regardless of corner order', () => {
    const next = succeed(project, {
      type: 'project/fillArea',
      payload: { mapId: 1, layer: 1, tile: 6, startX: 3, startY: 2, endX: 1, endY: 1 },
    })
    const filled = [1, 2, 3].flatMap((x) => [1, 2].map((y) => tileAt(next, 1, 1, x, y)))
    expect(filled).toEqual([6, 6, 6, 6, 6, 6])
    expect(tileAt(next, 1, 1, 0, 1)).toBe(0)
    expect(tileAt(next, 1, 1, 4, 1)).toBe(0)
  })

  it('refuses a fill with a corner outside the map', () => {
    expect(
      reject(project, {
        type: 'project/fillArea',
        payload: { mapId: 1, layer: 0, tile: 1, startX: 0, startY: 0, endX: 10, endY: 0 },
      }),
    ).toMatch(/outside/)
  })

  it('flood fills the connected region on one layer only', () => {
    const walled = succeed(project, {
      type: 'project/fillArea',
      payload: { mapId: 1, layer: 0, tile: 5, startX: 2, startY: 0, endX: 2, endY: 3 },
    })
    const next = succeed(walled, {
      type: 'project/floodFill',
      payload: { mapId: 1, layer: 0, x: 0, y: 0, tile: 9 },
    })
    expect(tileAt(next, 1, 0, 0, 0)).toBe(9)
    expect(tileAt(next, 1, 0, 1, 3)).toBe(9)
    expect(tileAt(next, 1, 0, 2, 0)).toBe(5) // the wall stops the fill
    expect(tileAt(next, 1, 0, 3, 0)).toBe(1) // and the far side is untouched
    expect(tileAt(next, 1, 1, 0, 0)).toBe(0) // other layers are untouched
  })

  it('flood filling with the tile that is already there changes nothing visible', () => {
    const next = succeed(project, {
      type: 'project/floodFill',
      payload: { mapId: 1, layer: 0, x: 0, y: 0, tile: 1 },
    })
    expect(next.maps[0]?.layers[0]?.data).toEqual(project.maps[0]?.layers[0]?.data)
  })

  it('sets collision flags, including directional ones', () => {
    const next = succeed(project, {
      type: 'project/setCollision',
      payload: {
        mapId: 1,
        cells: [
          { x: 0, y: 0, flags: CollisionFlags.SOLID },
          { x: 1, y: 0, flags: CollisionFlags.BLOCK_UP | CollisionFlags.BLOCK_LEFT },
        ],
      },
    })
    expect(next.maps[0]?.collision.slice(0, 3)).toEqual([1, 10, 0])
    expect(
      reject(project, {
        type: 'project/setCollision',
        payload: { mapId: 1, cells: [{ x: 9, y: 9, flags: 1 }] },
      }),
    ).toMatch(/outside/)
  })
})

describe('map management', () => {
  const project = sampleProject()

  it('creates a map with the next free id, or a requested one', () => {
    const next = succeed(project, {
      type: 'project/createMap',
      payload: { name: 'Forest', width: 8, height: 6 },
    })
    expect(next.maps.map((m) => m.id)).toEqual([1, 2, 3])
    expect(mapOf(next, 3)).toMatchObject({ name: 'Forest', width: 8, height: 6, tileSize: 16 })
    const withId = succeed(project, {
      type: 'project/createMap',
      payload: { id: 10, name: 'Keep', width: 2, height: 2, tileSize: 32 },
    })
    expect(mapOf(withId, 10).tileSize).toBe(32)
    expect(
      reject(project, {
        type: 'project/createMap',
        payload: { id: 2, name: 'x', width: 2, height: 2 },
      }),
    ).toMatch(/already exists/)
  })

  it('renames maps', () => {
    const next = succeed(project, {
      type: 'project/renameMap',
      payload: { mapId: 2, name: 'Deep Cave' },
    })
    expect(mapOf(next, 2).name).toBe('Deep Cave')
  })

  it('grows a map keeping existing content and padding with empty cells', () => {
    const painted = succeed(project, {
      type: 'project/setTiles',
      payload: { mapId: 1, layer: 1, cells: [{ x: 5, y: 3, tile: 8 }] },
    })
    const next = succeed(painted, {
      type: 'project/resizeMap',
      payload: { mapId: 1, width: 8, height: 5 },
    })
    const map = mapOf(next, 1)
    expect(map).toMatchObject({ width: 8, height: 5 })
    expect(map.layers.every((layer) => layer.data.length === 40)).toBe(true)
    expect(map.collision).toHaveLength(40)
    expect(tileAt(next, 1, 1, 5, 3)).toBe(8)
    expect(tileAt(next, 1, 1, 7, 4)).toBe(0)
    expect(tileAt(next, 1, 0, 0, 0)).toBe(1)
  })

  it('shrinks a map, dropping events that fall outside it', () => {
    const next = succeed(project, {
      type: 'project/resizeMap',
      payload: { mapId: 1, width: 4, height: 4 },
    })
    expect(mapOf(next, 1).events).toEqual([])
  })

  it('keeps the start position inside a shrunken start map', () => {
    const moved = succeed(project, {
      type: 'project/updateMeta',
      payload: { changes: { startX: 5, startY: 3 } },
    })
    const next = succeed(moved, {
      type: 'project/resizeMap',
      payload: { mapId: 1, width: 3, height: 2 },
    })
    expect(next.meta).toMatchObject({ startX: 2, startY: 1 })
  })

  it('refuses to shrink a map below where transfers send the player', () => {
    expect(
      reject(project, { type: 'project/resizeMap', payload: { mapId: 2, width: 2, height: 2 } }),
    ).toMatch(/outside map 2/)
  })

  it('refuses to delete the start map or a map something transfers to', () => {
    expect(reject(project, { type: 'project/deleteMap', payload: { mapId: 1 } })).toMatch(
      /starts on/,
    )
    expect(reject(project, { type: 'project/deleteMap', payload: { mapId: 2 } })).toMatch(
      /destination of event 1 on map 1/,
    )
    expect(reject(project, { type: 'project/deleteMap', payload: { mapId: 7 } })).toMatch(
      /does not exist/,
    )
  })

  it('deletes an unreferenced map', () => {
    const withExtra = succeed(project, {
      type: 'project/createMap',
      payload: { name: 'Spare', width: 2, height: 2 },
    })
    const next = succeed(withExtra, { type: 'project/deleteMap', payload: { mapId: 3 } })
    expect(next.maps.map((m) => m.id)).toEqual([1, 2])
  })
})

describe('layers', () => {
  const project = sampleProject()

  it('adds an empty layer on top and removes layers', () => {
    const added = succeed(project, { type: 'project/addLayer', payload: { mapId: 2, name: 'Fog' } })
    const map = mapOf(added, 2)
    expect(map.layers).toHaveLength(4)
    expect(map.layers[3]).toMatchObject({ name: 'Fog', visible: true, above: false })
    expect(map.layers[3]?.data.every((t) => t === 0)).toBe(true)
    const removed = succeed(added, { type: 'project/removeLayer', payload: { mapId: 2, layer: 0 } })
    expect(mapOf(removed, 2).layers.map((l) => l.name)).toEqual(['Objects', 'Overlay', 'Fog'])
  })

  it('caps the layer count and keeps at least one layer', () => {
    const full = Array.from({ length: 5 }).reduce<Project>(
      (acc) => succeed(acc, { type: 'project/addLayer', payload: { mapId: 2, name: 'L' } }),
      project,
    )
    expect(mapOf(full, 2).layers).toHaveLength(8)
    expect(reject(full, { type: 'project/addLayer', payload: { mapId: 2, name: 'L' } })).toMatch(
      /at most 8/,
    )

    const single = [0, 0].reduce<Project>(
      (acc) => succeed(acc, { type: 'project/removeLayer', payload: { mapId: 2, layer: 0 } }),
      project,
    )
    expect(
      reject(single, { type: 'project/removeLayer', payload: { mapId: 2, layer: 0 } }),
    ).toMatch(/at least one layer/)
  })

  it('updates only the layer properties that are given', () => {
    const next = succeed(project, {
      type: 'project/setLayerProps',
      payload: { mapId: 1, layer: 1, visible: false, name: 'Props' },
    })
    expect(mapOf(next, 1).layers[1]).toMatchObject({ name: 'Props', visible: false, above: false })
    expect(mapOf(next, 1).layers[0]).toBe(mapOf(project, 1).layers[0])
  })
})

describe('database records', () => {
  const project = sampleProject()
  const actor = (id: number, name: string, classId = 1) => ActorSchema.parse({ id, name, classId })

  it('inserts new records and replaces existing ones by id', () => {
    const added = succeed(project, {
      type: 'project/upsertRecord',
      payload: { table: 'actors', record: actor(2, 'Mage') },
    })
    expect(added.database.actors.map((a) => a.name)).toEqual(['Hero', 'Mage'])
    const renamed = succeed(added, {
      type: 'project/upsertRecord',
      payload: { table: 'actors', record: actor(1, 'Aria') },
    })
    expect(renamed.database.actors.map((a) => a.name)).toEqual(['Aria', 'Mage'])
  })

  it('refuses a record that points at something that does not exist', () => {
    expect(
      reject(project, {
        type: 'project/upsertRecord',
        payload: { table: 'actors', record: actor(2, 'Ghost', 99) },
      }),
    ).toMatch(/missing class 99/)
  })

  it('refuses to delete a record other data depends on', () => {
    expect(
      reject(project, { type: 'project/deleteRecord', payload: { table: 'classes', id: 1 } }),
    ).toMatch(/missing class 1/)
    expect(
      reject(project, { type: 'project/deleteRecord', payload: { table: 'actors', id: 1 } }),
    ).toMatch(/not an actor/)
    expect(
      reject(project, { type: 'project/deleteRecord', payload: { table: 'items', id: 99 } }),
    ).toMatch(/No record 99 in items/)
  })

  it('deletes an unreferenced record', () => {
    const next = succeed(project, {
      type: 'project/deleteRecord',
      payload: { table: 'items', id: 1 },
    })
    expect(next.database.items).toEqual([])
  })
})

describe('map events and metadata', () => {
  const project = sampleProject()
  const event = (id: number, x: number, y: number, commands: unknown[] = []) =>
    MapEventSchema.parse({ id, x, y, pages: [{ commands }] })

  it('adds, replaces and removes map events', () => {
    const added = succeed(project, {
      type: 'project/upsertMapEvent',
      payload: { mapId: 2, event: event(1, 1, 1) },
    })
    expect(mapOf(added, 2).events).toHaveLength(1)
    const moved = succeed(added, {
      type: 'project/upsertMapEvent',
      payload: { mapId: 2, event: event(1, 3, 3) },
    })
    expect(mapOf(moved, 2).events).toMatchObject([{ id: 1, x: 3, y: 3 }])
    const removed = succeed(moved, {
      type: 'project/removeMapEvent',
      payload: { mapId: 2, eventId: 1 },
    })
    expect(mapOf(removed, 2).events).toEqual([])
    expect(
      reject(removed, { type: 'project/removeMapEvent', payload: { mapId: 2, eventId: 1 } }),
    ).toMatch(/no event 1/)
  })

  it('refuses events outside the map or transferring to nowhere', () => {
    expect(
      reject(project, {
        type: 'project/upsertMapEvent',
        payload: { mapId: 2, event: event(5, 9, 9) },
      }),
    ).toMatch(/outside/)
    expect(
      reject(project, {
        type: 'project/upsertMapEvent',
        payload: {
          mapId: 2,
          event: event(5, 0, 0, [{ command: 'TransferPlayer', mapId: 77, x: 0, y: 0 }]),
        },
      }),
    ).toMatch(/missing map 77/)
    expect(
      reject(project, {
        type: 'project/upsertMapEvent',
        payload: { mapId: 8, event: event(1, 0, 0) },
      }),
    ).toMatch(/Map 8 does not exist/)
  })

  it('updates project metadata and validates it as a whole', () => {
    const next = succeed(project, {
      type: 'project/updateMeta',
      payload: { changes: { name: 'Renamed', startMapId: 2, startX: 1, startY: 1, startGold: 50 } },
    })
    expect(next.meta).toMatchObject({ name: 'Renamed', startMapId: 2, startGold: 50 })
    expect(
      reject(project, { type: 'project/updateMeta', payload: { changes: { startMapId: 42 } } }),
    ).toMatch(/Start map 42 does not exist/)
    expect(
      reject(project, { type: 'project/updateMeta', payload: { changes: { startX: 100 } } }),
    ).toMatch(/outside map 1/)
    expect(
      reject(project, { type: 'project/updateMeta', payload: { changes: { startParty: [9] } } }),
    ).toMatch(/not an actor/)
  })

  it('ignores undefined fields in a partial update', () => {
    const next = succeed(project, {
      type: 'project/updateMeta',
      payload: { changes: { name: undefined, startGold: 5 } },
    })
    expect(next.meta.name).toBe('Sample')
  })
})
