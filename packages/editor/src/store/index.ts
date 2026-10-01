import {
  combineReducers,
  configureStore,
  type EnhancedStore,
  type Reducer,
  type ReducersMapObject,
} from '@reduxjs/toolkit';
import { projectReducer, initialProjectState, type ProjectState } from './slices/project.js';
import { editorUiReducer, type EditorUiState } from './slices/editorUi.js';
import { createUndoableReducer, type UndoableState } from './history.js';

export interface RootState {
  project: UndoableState<ProjectState>;
  editorUi: EditorUiState;
  [key: string]: unknown;
}

export interface DynamicStore extends EnhancedStore<RootState> {
  injectReducer(key: string, asyncReducer: Reducer): void;
  getAsyncReducers(): Readonly<Record<string, Reducer>>;
}

export const createEditorStore = (preloadedState?: Partial<RootState>): DynamicStore => {
  const staticReducers: ReducersMapObject = {
    project: createUndoableReducer(projectReducer, initialProjectState),
    editorUi: editorUiReducer,
  };

  const asyncReducers: Record<string, Reducer> = {};

  const createRootReducer = (): Reducer =>
    combineReducers({
      ...staticReducers,
      ...asyncReducers,
    });

  const store = configureStore({
    reducer: createRootReducer(),
    preloadedState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
      }),
  }) as DynamicStore;

  store.injectReducer = (key: string, asyncReducer: Reducer): void => {
    if (asyncReducers[key]) {
      return;
    }
    asyncReducers[key] = asyncReducer;
    store.replaceReducer(createRootReducer());
  };

  store.getAsyncReducers = (): Readonly<Record<string, Reducer>> => Object.freeze({ ...asyncReducers });

  return store;
};

export * from './slices/project.js';
export * from './slices/editorUi.js';
export * from './history.js';
