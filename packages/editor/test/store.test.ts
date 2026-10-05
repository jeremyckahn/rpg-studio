import { createSlice } from '@reduxjs/toolkit'
import { ActorSchema } from '@rpgstudio/core'
import { describe, expect, it } from 'vitest'

import {
  assetsSlice,
  createEditorStore,
  editorUiSlice,
  projectActions,
  redo,
  selectCanRedo,
  selectCanUndo,
  selectCurrentMap,
  selectIsDirty,
  undo,
} from '../src/store'
import { HISTORY_LIMIT } from '../src/store/slices/history'
import { sampleProject } from './helpers'

const newStore = () => createEditorStore({ project: sampleProject() })

const paint = (handle: ReturnType<typeof newStore>, x: number, tile: number, group?: string) =>
  handle.store.dispatch(
    projectActions.setTiles({ mapId: 1, layer: 0, cells: [{ x, y: 0, tile }] }, group),
  )

const tileAt = (handle: ReturnType<typeof newStore>, x: number): number | undefined =>
  handle.store.getState().project.data.maps[0]?.layers[0]?.data[x]

describe('project actions', () => {
  it('applies accepted actions and bumps the revision', () => {
    const handle = newStore()
    paint(handle, 2, 9)
    expect(tileAt(handle, 2)).toBe(9)
    expect(handle.store.getState().project.revision).toBe(1)
  })

  it('leaves state untouched, by reference, when an action is refused', () => {
    const handle = newStore()
    const before = handle.store.getState().project
    handle.store.dispatch(projectActions.deleteMap({ mapId: 1 })) // the start map
    handle.store.dispatch(
      projectActions.setTiles({ mapId: 1, layer: 0, cells: [{ x: 99, y: 0, tile: 1 }] }),
    )
    expect(handle.store.getState().project).toBe(before)
  })

  it('creates serialisable actions carrying the history group in meta', () => {
    const action = projectActions.setTiles(
      { mapId: 1, layer: 0, cells: [{ x: 0, y: 0, tile: 1 }] },
      'stroke',
    )
    expect(action).toEqual({
      type: 'project/setTiles',
      payload: { mapId: 1, layer: 0, cells: [{ x: 0, y: 0, tile: 1 }] },
      meta: { historyGroup: 'stroke' },
    })
    expect(JSON.parse(JSON.stringify(action))).toEqual(action)
  })

  it('shares unchanged structure between consecutive states', () => {
    const handle = newStore()
    const before = handle.store.getState().project.data
    paint(handle, 1, 5)
    const after = handle.store.getState().project.data
    expect(after.database).toBe(before.database)
    expect(after.maps[1]).toBe(before.maps[1])
    expect(after.maps[0]).not.toBe(before.maps[0])
  })
})

describe('undo and redo', () => {
  it('undoes and redoes a change', () => {
    const handle = newStore()
    paint(handle, 2, 9)
    handle.store.dispatch(undo())
    expect(tileAt(handle, 2)).toBe(1)
    handle.store.dispatch(redo())
    expect(tileAt(handle, 2)).toBe(9)
  })

  it('walks back through several changes in order', () => {
    const handle = newStore()
    ;[3, 4, 5].forEach((tile) => paint(handle, 0, tile))
    expect(tileAt(handle, 0)).toBe(5)
    handle.store.dispatch(undo())
    expect(tileAt(handle, 0)).toBe(4)
    handle.store.dispatch(undo())
    expect(tileAt(handle, 0)).toBe(3)
    handle.store.dispatch(undo())
    expect(tileAt(handle, 0)).toBe(1)
    handle.store.dispatch(undo()) // nothing left: a harmless no-op
    expect(tileAt(handle, 0)).toBe(1)
    expect(selectCanUndo(handle.store.getState())).toBe(false)
  })

  it('reports availability of undo and redo', () => {
    const handle = newStore()
    expect(selectCanUndo(handle.store.getState())).toBe(false)
    expect(selectCanRedo(handle.store.getState())).toBe(false)
    paint(handle, 0, 3)
    expect(selectCanUndo(handle.store.getState())).toBe(true)
    handle.store.dispatch(undo())
    expect(selectCanUndo(handle.store.getState())).toBe(false)
    expect(selectCanRedo(handle.store.getState())).toBe(true)
  })

  it('discards the redo stack when a new change is made after an undo', () => {
    const handle = newStore()
    paint(handle, 0, 3)
    paint(handle, 0, 4)
    handle.store.dispatch(undo())
    paint(handle, 0, 7)
    expect(selectCanRedo(handle.store.getState())).toBe(false)
    handle.store.dispatch(redo()) // no-op
    expect(tileAt(handle, 0)).toBe(7)
  })

  it('treats a stroke of grouped actions as one undo step', () => {
    const handle = newStore()
    ;[0, 1, 2, 3].forEach((x) => paint(handle, x, 8, 'stroke-1'))
    paint(handle, 4, 8, 'stroke-2')
    expect([0, 1, 2, 3, 4].map((x) => tileAt(handle, x))).toEqual([8, 8, 8, 8, 8])
    handle.store.dispatch(undo())
    expect([0, 1, 2, 3, 4].map((x) => tileAt(handle, x))).toEqual([8, 8, 8, 8, 1])
    handle.store.dispatch(undo())
    expect([0, 1, 2, 3, 4].map((x) => tileAt(handle, x))).toEqual([1, 1, 1, 1, 1])
    expect(selectCanUndo(handle.store.getState())).toBe(false)
  })

  it('keeps groups separate once something else happens in between', () => {
    const handle = newStore()
    paint(handle, 0, 8, 'same')
    paint(handle, 1, 8) // ungrouped breaks the run
    paint(handle, 2, 8, 'same')
    handle.store.dispatch(undo())
    expect([0, 1, 2].map((x) => tileAt(handle, x))).toEqual([8, 8, 1])
    handle.store.dispatch(undo())
    expect([0, 1, 2].map((x) => tileAt(handle, x))).toEqual([8, 1, 1])
  })

  it('does not record refused actions', () => {
    const handle = newStore()
    handle.store.dispatch(projectActions.deleteMap({ mapId: 1 }))
    expect(selectCanUndo(handle.store.getState())).toBe(false)
  })

  it('does not record UI or asset actions', () => {
    const handle = newStore()
    handle.store.dispatch(editorUiSlice.actions.toolSelected('fill'))
    handle.store.dispatch(assetsSlice.actions.assetChanged('img/a.png'))
    expect(selectCanUndo(handle.store.getState())).toBe(false)
  })

  it('undoes database and map-management changes too', () => {
    const handle = newStore()
    handle.store.dispatch(projectActions.createMap({ name: 'Extra', width: 3, height: 3 }))
    handle.store.dispatch(
      projectActions.upsertRecord({
        table: 'actors',
        record: ActorSchema.parse({ id: 2, name: 'Mage', classId: 1 }),
      }),
    )
    expect(handle.store.getState().project.data.maps).toHaveLength(3)
    handle.store.dispatch(undo())
    expect(handle.store.getState().project.data.database.actors).toHaveLength(1)
    handle.store.dispatch(undo())
    expect(handle.store.getState().project.data.maps).toHaveLength(2)
  })

  it('caps how many steps are remembered', () => {
    const handle = newStore()
    Array.from({ length: HISTORY_LIMIT + 25 }).forEach((_, i) => paint(handle, 0, (i % 50) + 2))
    expect(handle.store.getState().history.past).toHaveLength(HISTORY_LIMIT)
  })

  it('clears history when a different project is loaded', () => {
    const handle = newStore()
    paint(handle, 0, 3)
    handle.store.dispatch(projectActions.projectLoaded(sampleProject()))
    expect(selectCanUndo(handle.store.getState())).toBe(false)
    expect(handle.store.getState().project.revision).toBe(0)
  })
})

describe('unsaved changes', () => {
  it('is dirty after an edit and clean after saving that revision', () => {
    const handle = newStore()
    expect(selectIsDirty(handle.store.getState())).toBe(false)
    paint(handle, 0, 3)
    expect(selectIsDirty(handle.store.getState())).toBe(true)
    handle.store.dispatch(
      editorUiSlice.actions.projectSaved({ revision: handle.store.getState().project.revision }),
    )
    expect(selectIsDirty(handle.store.getState())).toBe(false)
  })

  it('reads clean again when undo returns to the saved state', () => {
    const handle = newStore()
    paint(handle, 0, 3)
    handle.store.dispatch(
      editorUiSlice.actions.projectSaved({ revision: handle.store.getState().project.revision }),
    )
    paint(handle, 1, 4)
    expect(selectIsDirty(handle.store.getState())).toBe(true)
    handle.store.dispatch(undo())
    expect(selectIsDirty(handle.store.getState())).toBe(false)
  })
})

describe('dynamic reducer injection', () => {
  const counter = (name: string) =>
    createSlice({
      name,
      initialState: { count: 0 },
      reducers: { incremented: (state) => ({ count: state.count + 1 }) },
    })

  it('adds a reducer at runtime and routes its actions to it', () => {
    const handle = newStore()
    expect('quests' in handle.store.getState()).toBe(false)
    const quests = counter('quests')
    handle.injectReducer('quests', quests.reducer)
    expect((handle.store.getState() as Record<string, unknown>)['quests']).toEqual({ count: 0 })
    handle.store.dispatch(quests.actions.incremented())
    handle.store.dispatch(quests.actions.incremented())
    expect((handle.store.getState() as Record<string, unknown>)['quests']).toEqual({ count: 2 })
  })

  it('keeps core state intact when a reducer is injected', () => {
    const handle = newStore()
    paint(handle, 0, 3)
    const before = handle.store.getState().project
    handle.injectReducer('extra', counter('extra').reducer)
    expect(handle.store.getState().project).toBe(before)
    handle.store.dispatch(undo())
    expect(tileAt(handle, 0)).toBe(1)
  })

  it('supports several independent injected reducers', () => {
    const handle = newStore()
    const a = counter('a')
    const b = counter('b')
    handle.injectReducer('a', a.reducer)
    handle.injectReducer('b', b.reducer)
    handle.store.dispatch(a.actions.incremented())
    const state = handle.store.getState() as Record<string, unknown>
    expect([state['a'], state['b']]).toEqual([{ count: 1 }, { count: 0 }])
  })

  it('refuses to replace core slices or an existing injected reducer', () => {
    const handle = newStore()
    const slice = counter('x')
    ;['project', 'history', 'editorUi', 'assets'].forEach((key) => {
      expect(() => handle.injectReducer(key, slice.reducer)).toThrow(/reserved/)
    })
    handle.injectReducer('x', slice.reducer)
    expect(() => handle.injectReducer('x', slice.reducer)).toThrow(/already registered/)
  })

  it('does not share state between independent stores', () => {
    const first = newStore()
    const second = newStore()
    const slice = counter('only-first')
    first.injectReducer('onlyFirst', slice.reducer)
    first.store.dispatch(slice.actions.incremented())
    expect('onlyFirst' in second.store.getState()).toBe(false)
  })
})

describe('selectors and ui state', () => {
  it('selects the chosen map, falling back to the first', () => {
    const handle = newStore()
    expect(selectCurrentMap(handle.store.getState())?.id).toBe(1)
    handle.store.dispatch(editorUiSlice.actions.mapSelected(2))
    expect(selectCurrentMap(handle.store.getState())?.id).toBe(2)
    handle.store.dispatch(editorUiSlice.actions.mapSelected(99))
    expect(selectCurrentMap(handle.store.getState())?.id).toBe(1)
  })

  it('clamps zoom to the supported levels and resets the layer when changing maps', () => {
    const handle = newStore()
    Array.from({ length: 20 }).forEach(() =>
      handle.store.dispatch(editorUiSlice.actions.zoomStepped(1)),
    )
    expect(handle.store.getState().editorUi.zoomIndex).toBe(5)
    Array.from({ length: 20 }).forEach(() =>
      handle.store.dispatch(editorUiSlice.actions.zoomStepped(-1)),
    )
    expect(handle.store.getState().editorUi.zoomIndex).toBe(0)
    handle.store.dispatch(editorUiSlice.actions.layerSelected(2))
    handle.store.dispatch(editorUiSlice.actions.mapSelected(2))
    expect(handle.store.getState().editorUi.selectedLayer).toBe(0)
  })

  it('tracks asset paths and bumps a version when one changes', () => {
    const handle = newStore()
    handle.store.dispatch(assetsSlice.actions.assetsReset(['img/b.png', 'img/a.png']))
    expect(handle.store.getState().assets.paths).toEqual(['img/a.png', 'img/b.png'])
    handle.store.dispatch(assetsSlice.actions.assetChanged('img/a.png'))
    handle.store.dispatch(assetsSlice.actions.assetChanged('img/a.png'))
    handle.store.dispatch(assetsSlice.actions.assetChanged('img/c.png'))
    expect(handle.store.getState().assets.versions).toEqual({ 'img/a.png': 2, 'img/c.png': 1 })
    expect(handle.store.getState().assets.paths).toContain('img/c.png')
    handle.store.dispatch(assetsSlice.actions.assetRemoved('img/a.png'))
    expect(handle.store.getState().assets.paths).not.toContain('img/a.png')
    expect(handle.store.getState().assets.versions).toEqual({ 'img/c.png': 1 })
  })
})
