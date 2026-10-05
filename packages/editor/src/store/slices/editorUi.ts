import { type PayloadAction, createSlice } from '@reduxjs/toolkit'
import { type DatabaseTableName } from '@rpgstudio/core'

export type MapTool = 'pencil' | 'fill' | 'eraser' | 'collision'

export const ZOOM_LEVELS = [1, 2, 3, 4, 6, 8] as const
export const DEFAULT_ZOOM_INDEX = 2

export interface StatusMessage {
  readonly severity: 'info' | 'success' | 'warning' | 'error'
  readonly text: string
}

export type CompanionConnectionStatus = 'disconnected' | 'connecting' | 'connected'

export interface EditorUiState {
  /** Id of the workspace panel in front. */
  readonly workspacePanel: string
  readonly selectedMapId: number | null
  readonly selectedLayer: number
  readonly tool: MapTool
  /** Tile id painted by the pencil and fill (1 is the first tileset cell). */
  readonly selectedTile: number
  readonly zoomIndex: number
  readonly showGrid: boolean
  readonly showCollision: boolean
  readonly dimInactiveLayers: boolean
  readonly databaseTable: DatabaseTableName
  /** Asset the sprite editor should show (a `.png` or `.piskel` path). */
  readonly openAssetPath: string | null
  /** Project revision at the last save; a different current revision means unsaved work. */
  readonly savedRevision: number
  /** Name of the folder on disk the project was opened from, if any. */
  readonly folderName: string | null
  readonly status: StatusMessage | null
  readonly companion: {
    readonly status: CompanionConnectionStatus
    /** Why the connection ended or is being retried; empty when all is well. */
    readonly error: string
  }
}

const initialState: EditorUiState = {
  workspacePanel: 'rpgstudio.map-editor',
  selectedMapId: null,
  selectedLayer: 0,
  tool: 'pencil',
  selectedTile: 1,
  zoomIndex: DEFAULT_ZOOM_INDEX,
  showGrid: true,
  showCollision: false,
  dimInactiveLayers: true,
  databaseTable: 'actors',
  openAssetPath: null,
  savedRevision: 0,
  folderName: null,
  status: null,
  companion: { status: 'disconnected', error: '' },
}

const clampZoom = (index: number): number => Math.min(ZOOM_LEVELS.length - 1, Math.max(0, index))

export const editorUiSlice = createSlice({
  name: 'editorUi',
  initialState,
  reducers: {
    workspacePanelSelected: (state, action: PayloadAction<string>): EditorUiState => ({
      ...state,
      workspacePanel: action.payload,
    }),
    mapSelected: (state, action: PayloadAction<number | null>): EditorUiState => ({
      ...state,
      selectedMapId: action.payload,
      selectedLayer: 0,
    }),
    layerSelected: (state, action: PayloadAction<number>): EditorUiState => ({
      ...state,
      selectedLayer: Math.max(0, action.payload),
    }),
    toolSelected: (state, action: PayloadAction<MapTool>): EditorUiState => ({
      ...state,
      tool: action.payload,
    }),
    tileSelected: (state, action: PayloadAction<number>): EditorUiState => ({
      ...state,
      selectedTile: Math.max(1, action.payload),
    }),
    zoomSet: (state, action: PayloadAction<number>): EditorUiState => ({
      ...state,
      zoomIndex: clampZoom(action.payload),
    }),
    zoomStepped: (state, action: PayloadAction<1 | -1>): EditorUiState => ({
      ...state,
      zoomIndex: clampZoom(state.zoomIndex + action.payload),
    }),
    gridToggled: (state): EditorUiState => ({ ...state, showGrid: !state.showGrid }),
    collisionOverlayToggled: (state): EditorUiState => ({
      ...state,
      showCollision: !state.showCollision,
    }),
    dimInactiveLayersToggled: (state): EditorUiState => ({
      ...state,
      dimInactiveLayers: !state.dimInactiveLayers,
    }),
    databaseTableSelected: (state, action: PayloadAction<DatabaseTableName>): EditorUiState => ({
      ...state,
      databaseTable: action.payload,
    }),
    /** Opens an image in the sprite editor and brings it to the front. */
    assetOpened: (state, action: PayloadAction<string>): EditorUiState => ({
      ...state,
      openAssetPath: action.payload,
      workspacePanel: 'rpgstudio.pixel-editor',
    }),
    projectSaved: (
      state,
      action: PayloadAction<{ revision: number; folderName?: string | null }>,
    ): EditorUiState => ({
      ...state,
      savedRevision: action.payload.revision,
      folderName:
        action.payload.folderName === undefined ? state.folderName : action.payload.folderName,
    }),
    /** A new or opened project: nothing is selected and nothing is unsaved. */
    projectOpened: (
      state,
      action: PayloadAction<{ folderName: string | null }>,
    ): EditorUiState => ({
      ...state,
      selectedMapId: null,
      selectedLayer: 0,
      openAssetPath: null,
      savedRevision: 0,
      folderName: action.payload.folderName,
    }),
    statusShown: (state, action: PayloadAction<StatusMessage>): EditorUiState => ({
      ...state,
      status: action.payload,
    }),
    companionStatusChanged: (
      state,
      action: PayloadAction<{ status: CompanionConnectionStatus; error: string }>,
    ): EditorUiState => ({ ...state, companion: action.payload }),
    statusDismissed: (state): EditorUiState => ({ ...state, status: null }),
  },
})
