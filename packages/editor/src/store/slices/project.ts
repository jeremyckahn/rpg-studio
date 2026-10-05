import { type PayloadAction, createSlice } from '@reduxjs/toolkit'
import { type Project, type ProjectAction, createStarterProject } from '@rpgstudio/core'

import { applyProjectAction } from '../projectOps.ts'

/**
 * The project being edited. `revision` counts accepted changes; together with
 * the revision at the last save it tells whether there is unsaved work, and it
 * travels with undo snapshots so undoing back to the saved state reads clean.
 */
export interface ProjectState {
  readonly data: Project
  readonly revision: number
}

export interface ActionMeta {
  readonly historyGroup?: string | undefined
}

type OpName = ProjectAction['type'] extends `project/${infer Name}` ? Name : never
type PayloadOf<Name extends OpName> = Extract<ProjectAction, { type: `project/${Name}` }>['payload']

/**
 * One reducer per project action. A refused action leaves the state untouched;
 * an accepted one produces a new project and bumps the revision. No draft is
 * mutated: the pure operation returns the next project outright.
 */
const operation = <Name extends OpName>(name: Name) => ({
  reducer: (
    state: ProjectState,
    action: PayloadAction<PayloadOf<Name>, string, ActionMeta>,
  ): ProjectState => {
    const result = applyProjectAction(state.data, {
      type: `project/${name}`,
      payload: action.payload,
    } as ProjectAction)
    return result.success ? { data: result.data, revision: state.revision + 1 } : state
  },
  prepare: (payload: PayloadOf<Name>, historyGroup?: string) => ({
    payload,
    meta: { historyGroup } satisfies ActionMeta,
  }),
})

export const projectSlice = createSlice({
  name: 'project',
  // The real project is supplied as the store's preloaded state; this only
  // gives a freshly created store something valid to start from.
  initialState: (): ProjectState => ({ data: createStarterProject(), revision: 0 }),
  reducers: {
    setTiles: operation('setTiles'),
    fillArea: operation('fillArea'),
    floodFill: operation('floodFill'),
    setCollision: operation('setCollision'),
    createMap: operation('createMap'),
    resizeMap: operation('resizeMap'),
    renameMap: operation('renameMap'),
    deleteMap: operation('deleteMap'),
    addLayer: operation('addLayer'),
    removeLayer: operation('removeLayer'),
    setLayerProps: operation('setLayerProps'),
    upsertRecord: operation('upsertRecord'),
    deleteRecord: operation('deleteRecord'),
    upsertMapEvent: operation('upsertMapEvent'),
    removeMapEvent: operation('removeMapEvent'),
    updateMeta: operation('updateMeta'),

    /** Replaces the whole project (open, new). History is cleared by the history slice. */
    projectLoaded: (_state, action: PayloadAction<Project>): ProjectState => ({
      data: action.payload,
      revision: 0,
    }),
    /** Puts back a snapshot taken by the history middleware. */
    projectRestored: (_state, action: PayloadAction<ProjectState>): ProjectState => action.payload,
  },
})

export const projectActions = projectSlice.actions
