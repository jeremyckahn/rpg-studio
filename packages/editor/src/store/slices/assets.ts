import { type PayloadAction, createSlice } from '@reduxjs/toolkit'

/**
 * The paths of files in the project's asset store and a version per path. The
 * bytes live outside Redux (they are not serialisable); this is what lets the UI
 * list assets and refresh anything showing one when it changes.
 */
export interface AssetsState {
  readonly paths: readonly string[]
  readonly versions: Readonly<Record<string, number>>
  /** Files were added, replaced or removed since the project was last saved. */
  readonly unsaved: boolean
}

const initialState: AssetsState = { paths: [], versions: {}, unsaved: false }

export const assetsSlice = createSlice({
  name: 'assets',
  initialState,
  reducers: {
    assetsReset: (_state, action: PayloadAction<readonly string[]>): AssetsState => ({
      paths: action.payload.toSorted(),
      versions: {},
      unsaved: false,
    }),
    assetChanged: (state, action: PayloadAction<string>): AssetsState => ({
      paths: state.paths.includes(action.payload)
        ? state.paths
        : [...state.paths, action.payload].toSorted(),
      versions: { ...state.versions, [action.payload]: (state.versions[action.payload] ?? 0) + 1 },
      unsaved: true,
    }),
    assetRemoved: (state, action: PayloadAction<string>): AssetsState => ({
      paths: state.paths.filter((path) => path !== action.payload),
      versions: Object.fromEntries(
        Object.entries(state.versions).filter(([path]) => path !== action.payload),
      ),
      unsaved: true,
    }),
    /** The files on disk now match the asset store. */
    assetsSaved: (state): AssetsState => ({ ...state, unsaved: false }),
  },
})
