import type { Action, Reducer } from '@reduxjs/toolkit';

export interface UndoableState<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
}

export const UNDO_ACTION_TYPE = 'history/undo';
export const REDO_ACTION_TYPE = 'history/redo';

export const undo = (): Action<typeof UNDO_ACTION_TYPE> => ({
  type: UNDO_ACTION_TYPE,
});

export const redo = (): Action<typeof REDO_ACTION_TYPE> => ({
  type: REDO_ACTION_TYPE,
});

export const createUndoableReducer = <T>(
  reducer: Reducer<T>,
  initialPresent: T,
  maxHistory = 50
): Reducer<UndoableState<T>> => {
  const initialState: UndoableState<T> = {
    past: [],
    present: initialPresent,
    future: [],
  };

  return (state: UndoableState<T> = initialState, action: Action): UndoableState<T> => {
    switch (action.type) {
      case UNDO_ACTION_TYPE: {
        if (state.past.length === 0) {
          return state;
        }
        const previous = state.past[state.past.length - 1];
        if (previous === undefined) return state;

        const newPast = state.past.slice(0, -1);
        return {
          past: newPast,
          present: previous,
          future: [state.present, ...state.future],
        };
      }

      case REDO_ACTION_TYPE: {
        if (state.future.length === 0) {
          return state;
        }
        const next = state.future[0];
        if (next === undefined) return state;

        const newFuture = state.future.slice(1);
        return {
          past: [...state.past, state.present],
          present: next,
          future: newFuture,
        };
      }

      default: {
        const newPresent = reducer(state.present, action);
        if (newPresent === state.present) {
          return state;
        }
        const newPast = [...state.past, state.present].slice(-maxHistory);
        return {
          past: newPast,
          present: newPresent,
          future: [],
        };
      }
    }
  };
};
