import { combineSlices, configureStore } from '@reduxjs/toolkit'
import { type Project } from '@rpgstudio/core'
import { type UnknownAction, type Reducer } from '@reduxjs/toolkit'

import { historyMiddleware } from './history.ts'
import { assetsSlice } from './slices/assets.ts'
import { editorUiSlice } from './slices/editorUi.ts'
import { historyReducer } from './slices/history.ts'
import { projectReducer } from './slices/project.ts'

/** Slice keys the core owns; plugins may not replace them. */
export const CORE_SLICE_KEYS = ['project', 'history', 'editorUi', 'assets'] as const

/** Slices that plugins add at runtime, keyed by reducer path. */
export interface LazyLoadedSlices {
  [reducerPath: string]: unknown
}

const buildRootReducer = () =>
  combineSlices(
    { project: projectReducer, history: historyReducer },
    editorUiSlice,
    assetsSlice,
  ).withLazyLoadedSlices<LazyLoadedSlices>()

export type RootReducer = ReturnType<typeof buildRootReducer>
export type RootState = ReturnType<RootReducer>

export interface EditorStoreOptions {
  /** The project to start with. Defaults to the starter project. */
  readonly project?: Project
}

export const createEditorStore = (options: EditorStoreOptions = {}) => {
  const rootReducer = buildRootReducer()
  const store = configureStore({
    reducer: rootReducer,
    ...(options.project
      ? { preloadedState: { project: { data: options.project, revision: 0 } } }
      : {}),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        // The project and every undo snapshot are plain JSON, but walking them
        // after each dispatch is wasteful; immutability is enforced by the
        // `functional/immutable-data` lint rule instead.
        immutableCheck: false,
        serializableCheck: { ignoredPaths: ['history'], warnAfter: 100 },
      }).concat(historyMiddleware),
  })

  /**
   * Adds a reducer under `reducerPath` while the editor is running, so plugins can
   * keep their own state in the same store. Core keys cannot be replaced.
   */
  const injectReducer = <State>(
    reducerPath: string,
    reducer: Reducer<State, UnknownAction>,
  ): void => {
    if ((CORE_SLICE_KEYS as readonly string[]).includes(reducerPath)) {
      throw new Error(`"${reducerPath}" is reserved for the editor core`)
    }
    if (reducerPath in store.getState()) {
      throw new Error(`A reducer is already registered at "${reducerPath}"`)
    }
    rootReducer.inject({ reducerPath, reducer } as never)
    // Run the new reducer once so its initial state appears in the store.
    store.dispatch({ type: '@@rpgstudio/reducerInjected', payload: reducerPath })
  }

  return { store, injectReducer }
}

export type EditorStore = ReturnType<typeof createEditorStore>['store']
export type AppDispatch = EditorStore['dispatch']
export type EditorStoreHandle = ReturnType<typeof createEditorStore>

export { assetsSlice } from './slices/assets.ts'
export { editorUiSlice } from './slices/editorUi.ts'
export { historyActions } from './slices/history.ts'
export { projectActions, projectReducer } from './slices/project.ts'
export { redo, undo } from './history.ts'
export { applyProjectAction } from './projectOps.ts'
export * from './selectors.ts'
