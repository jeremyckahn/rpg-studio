import { type PayloadAction, createSlice } from '@reduxjs/toolkit'

/**
 * The paths of files in the project's asset store and a version per path. The
 * bytes live outside Redux (they are not serialisable); this is what lets the UI
 * list assets and refresh anything showing one when it changes.
 */
export interface AssetsState {
  readonly paths: readonly string[]
  readonly versions: Readonly<Record<string, number>>
}

const initialState: AssetsState = { paths: [], versions: {} }

export const assetsSlice = createSlice({
  name: 'assets',
  initialState,
  reducers: {
    assetsReset: (_state, action: PayloadAction<readonly string[]>): AssetsState => ({
      paths: action.payload.toSorted(),
      versions: {},
    }),
    assetChanged: (state, action: PayloadAction<string>): AssetsState => ({
      paths: state.paths.includes(action.payload)
        ? state.paths
        : [...state.paths, action.payload].toSorted(),
      versions: { ...state.versions, [action.payload]: (state.versions[action.payload] ?? 0) + 1 },
    }),
    assetRemoved: (state, action: PayloadAction<string>): AssetsState => ({
      paths: state.paths.filter((path) => path !== action.payload),
      versions: Object.fromEntries(
        Object.entries(state.versions).filter(([path]) => path !== action.payload),
      ),
    }),
  },
})
