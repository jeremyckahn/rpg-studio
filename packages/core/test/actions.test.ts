import { describe, expect, it } from 'vitest'

import { ProjectActionSchema } from '../src'
import { stats, growth } from './fixtures'

const valid = [
  { type: 'project/setTiles', payload: { mapId: 1, layer: 0, cells: [{ x: 1, y: 2, tile: 5 }] } },
  {
    type: 'project/fillArea',
    payload: { mapId: 1, layer: 0, tile: 3, startX: 0, startY: 0, endX: 4, endY: 4 },
  },
  { type: 'project/floodFill', payload: { mapId: 1, layer: 0, x: 2, y: 2, tile: 4 } },
  { type: 'project/setCollision', payload: { mapId: 1, cells: [{ x: 0, y: 0, flags: 1 }] } },
  { type: 'project/createMap', payload: { name: 'Cave', width: 20, height: 15 } },
  { type: 'project/resizeMap', payload: { mapId: 1, width: 30, height: 30 } },
  { type: 'project/renameMap', payload: { mapId: 1, name: 'Town' } },
  { type: 'project/deleteMap', payload: { mapId: 2 } },
  { type: 'project/addLayer', payload: { mapId: 1, name: 'Fog' } },
  { type: 'project/removeLayer', payload: { mapId: 1, layer: 2 } },
  { type: 'project/setLayerProps', payload: { mapId: 1, layer: 0, visible: false, above: true } },
  {
    type: 'project/upsertRecord',
    payload: { table: 'actors', record: { id: 2, name: 'Mage', classId: 1 } },
  },
  {
    type: 'project/upsertRecord',
    payload: {
      table: 'classes',
      record: { id: 2, name: 'Mage', baseStats: stats, growth },
    },
  },
  { type: 'project/deleteRecord', payload: { table: 'items', id: 1 } },
  {
    type: 'project/upsertMapEvent',
    payload: { mapId: 1, event: { id: 1, x: 0, y: 0, pages: [{}] } },
  },
  { type: 'project/removeMapEvent', payload: { mapId: 1, eventId: 1 } },
  { type: 'project/updateMeta', payload: { changes: { name: 'Renamed', startX: 3 } } },
] as const

describe('ProjectActionSchema', () => {
  it.each(valid)('accepts a valid $type action', (action) => {
    expect(ProjectActionSchema.safeParse(action).success).toBe(true)
  })

  it('covers every action type exactly once in the examples', () => {
    const types = ProjectActionSchema.options.map((option) => option.shape.type.value)
    expect(new Set(valid.map((v) => v.type))).toEqual(new Set(types))
    expect(types).toHaveLength(16)
  })

  it('accepts a history group so a series of actions undoes as one step', () => {
    const grouped = { ...valid[0], meta: { historyGroup: 'stroke-1' } }
    expect(ProjectActionSchema.safeParse(grouped).success).toBe(true)
    expect(ProjectActionSchema.safeParse({ ...valid[0], meta: { other: 1 } }).success).toBe(false)
  })

  it('rejects unknown action types, including reducers an agent should not reach', () => {
    ;[
      'project/projectLoaded',
      'project/restored',
      'history/undo',
      'editorUi/setZoom',
      'eval',
    ].forEach((type) => {
      expect(ProjectActionSchema.safeParse({ type, payload: {} }).success, type).toBe(false)
    })
  })

  it('rejects hallucinated payload fields and out-of-range values', () => {
    const [setTiles] = valid
    expect(
      ProjectActionSchema.safeParse({ ...setTiles, payload: { ...setTiles.payload, evil: 1 } })
        .success,
    ).toBe(false)
    expect(
      ProjectActionSchema.safeParse({ ...setTiles, payload: { ...setTiles.payload, layer: 99 } })
        .success,
    ).toBe(false)
    expect(
      ProjectActionSchema.safeParse({ ...setTiles, payload: { ...setTiles.payload, cells: [] } })
        .success,
    ).toBe(false)
    expect(
      ProjectActionSchema.safeParse({
        ...setTiles,
        payload: { ...setTiles.payload, cells: [{ x: -1, y: 0, tile: 1 }] },
      }).success,
    ).toBe(false)
    expect(
      ProjectActionSchema.safeParse({
        ...setTiles,
        payload: { ...setTiles.payload, cells: [{ x: 0, y: 0, tile: 1.5 }] },
      }).success,
    ).toBe(false)
    expect(ProjectActionSchema.safeParse({ type: 'project/setTiles' }).success).toBe(false)
  })

  it('validates a database record against the schema of its own table', () => {
    const wrong = {
      type: 'project/upsertRecord',
      payload: { table: 'actors', record: { id: 1, name: 'Potion', kind: 'consumable' } },
    }
    expect(ProjectActionSchema.safeParse(wrong).success).toBe(false)
    const hallucinated = {
      type: 'project/upsertRecord',
      payload: { table: 'actors', record: { id: 1, name: 'Hero', classId: 1, godMode: true } },
    }
    expect(ProjectActionSchema.safeParse(hallucinated).success).toBe(false)
    const badTable = {
      type: 'project/upsertRecord',
      payload: { table: 'weapons', record: { id: 1, name: 'x' } },
    }
    expect(ProjectActionSchema.safeParse(badTable).success).toBe(false)
  })

  it('does not allow changing the project format marker through updateMeta', () => {
    const action = { type: 'project/updateMeta', payload: { changes: { format: 'x' } } }
    expect(ProjectActionSchema.safeParse(action).success).toBe(false)
  })

  it('rejects unsafe tileset paths when creating maps', () => {
    const create = (tileset: string) => ({
      type: 'project/createMap',
      payload: { name: 'x', width: 4, height: 4, tileset },
    })
    expect(ProjectActionSchema.safeParse(create('../../etc/passwd')).success).toBe(false)
    expect(ProjectActionSchema.safeParse(create('img/tilesets/basic.png')).success).toBe(true)
  })
})
