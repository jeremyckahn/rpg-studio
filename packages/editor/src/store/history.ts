import { type Middleware, createAction, isAnyOf } from '@reduxjs/toolkit'
import { ProjectActionSchema } from '@rpgstudio/core'

import { historySlice } from './slices/history.ts'
import { type ProjectState, projectActions } from './slices/project.ts'

export const undo = createAction('history/undo')
export const redo = createAction('history/redo')

/** The state the history middleware needs; satisfied by the editor's root state. */
export interface HistoryHostState {
  readonly project: ProjectState
  readonly history: ReturnType<typeof historySlice.reducer>
}

const UNDOABLE: ReadonlySet<string> = new Set(
  ProjectActionSchema.options.map((option) => option.shape.type.value),
)

interface RecordedAction {
  readonly type: string
  readonly meta?: { readonly historyGroup?: string | undefined } | undefined
}

/**
 * Undo/redo for project edits. Before a project action runs, the middleware
 * remembers the project; if the action changed it, that snapshot is pushed on
 * the undo stack. Snapshots share structure with the live project (every edit
 * produces a new object only along the path it changed), so keeping hundreds
 * costs little. Actions carrying the same `meta.historyGroup` in a row (a brush
 * stroke) become a single step.
 */
export const historyMiddleware: Middleware<object, HistoryHostState> = (() => {
  const reset = isAnyOf(projectActions.projectLoaded)
  return (api) => (next) => (action) => {
    if (undo.match(action)) {
      const { past } = api.getState().history
      const previous = past.at(-1)
      if (!previous) return action
      const current = api.getState().project
      api.dispatch(projectActions.projectRestored(previous))
      api.dispatch(historySlice.actions.undone({ current }))
      return action
    }
    if (redo.match(action)) {
      const next_ = api.getState().history.future[0]
      if (!next_) return action
      const current = api.getState().project
      api.dispatch(projectActions.projectRestored(next_))
      api.dispatch(historySlice.actions.redone({ current }))
      return action
    }
    if (reset(action)) {
      const result: unknown = next(action)
      api.dispatch(historySlice.actions.cleared())
      return result
    }

    const recorded = action as RecordedAction
    if (typeof recorded.type !== 'string' || !UNDOABLE.has(recorded.type)) return next(action)

    const before = api.getState().project
    const result: unknown = next(action)
    if (api.getState().project !== before) {
      api.dispatch(
        historySlice.actions.recorded({
          before,
          group: recorded.meta?.historyGroup ?? null,
        }),
      )
    }
    return result
  }
})()
