import {
  type ActionCreatorWithPayload,
  type ActionCreatorWithoutPayload,
  type PayloadAction,
  createSlice,
} from '@reduxjs/toolkit'

import { type ProjectState } from './project.ts'

/** How many undo steps are kept. */
export const HISTORY_LIMIT = 200

export interface HistoryState {
  readonly past: readonly ProjectState[]
  readonly future: readonly ProjectState[]
  /** Group of the most recent recorded step, so a stroke of many actions is one step. */
  readonly lastGroup: string | null
}

const initialState: HistoryState = { past: [], future: [], lastGroup: null }

const historySlice = createSlice({
  name: 'history',
  initialState,
  reducers: {
    /** A project action was applied; `before` is the state it replaced. */
    recorded: (
      state,
      action: PayloadAction<{ before: ProjectState; group: string | null }>,
    ): HistoryState => {
      const { before, group } = action.payload
      if (group !== null && group === state.lastGroup) {
        return { ...state, future: [] } // joins the step already on the stack
      }
      return {
        past: [...state.past, before].slice(-HISTORY_LIMIT),
        future: [],
        lastGroup: group,
      }
    },
    /** Moves the newest past step to the future; `current` is what undo replaced. */
    undone: (state, action: PayloadAction<{ current: ProjectState }>): HistoryState => ({
      past: state.past.slice(0, -1),
      future: [action.payload.current, ...state.future],
      lastGroup: null,
    }),
    redone: (state, action: PayloadAction<{ current: ProjectState }>): HistoryState => ({
      past: [...state.past, action.payload.current],
      future: state.future.slice(1),
      lastGroup: null,
    }),
    cleared: (): HistoryState => initialState,
  },
})

/** Typed explicitly so the emitted declarations do not expose Immer's internal draft types. */
export interface HistoryActionCreators {
  readonly recorded: ActionCreatorWithPayload<
    { before: ProjectState; group: string | null },
    'history/recorded'
  >
  readonly undone: ActionCreatorWithPayload<{ current: ProjectState }, 'history/undone'>
  readonly redone: ActionCreatorWithPayload<{ current: ProjectState }, 'history/redone'>
  readonly cleared: ActionCreatorWithoutPayload<'history/cleared'>
}

export const historyActions: HistoryActionCreators = historySlice.actions
export const historyReducer = historySlice.reducer
