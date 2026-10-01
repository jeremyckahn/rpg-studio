import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type EditorTab = 'map' | 'database' | 'piskel';
export type MapEditorTool = 'pencil' | 'fill' | 'eraser';

export interface EditorUiState {
  readonly activeTab: EditorTab;
  readonly selectedLayerIndex: number;
  readonly selectedTileId: number;
  readonly selectedTool: MapEditorTool;
  readonly zoom: number;
  readonly pan: { readonly x: number; readonly y: number };
}

const initialEditorUiState: EditorUiState = {
  activeTab: 'map',
  selectedLayerIndex: 0,
  selectedTileId: 1,
  selectedTool: 'pencil',
  zoom: 1.0,
  pan: { x: 0, y: 0 },
};

export const editorUiSlice = createSlice({
  name: 'editorUi',
  initialState: initialEditorUiState,
  reducers: {
    setActiveTab: (state, action: PayloadAction<EditorTab>): EditorUiState => ({
      ...state,
      activeTab: action.payload,
    }),
    setSelectedLayerIndex: (state, action: PayloadAction<number>): EditorUiState => ({
      ...state,
      selectedLayerIndex: action.payload,
    }),
    setSelectedTileId: (state, action: PayloadAction<number>): EditorUiState => ({
      ...state,
      selectedTileId: action.payload,
    }),
    setSelectedTool: (state, action: PayloadAction<MapEditorTool>): EditorUiState => ({
      ...state,
      selectedTool: action.payload,
    }),
    setZoom: (state, action: PayloadAction<number>): EditorUiState => ({
      ...state,
      zoom: action.payload,
    }),
    setPan: (state, action: PayloadAction<{ readonly x: number; readonly y: number }>): EditorUiState => ({
      ...state,
      pan: action.payload,
    }),
  },
});

export const {
  setActiveTab,
  setSelectedLayerIndex,
  setSelectedTileId,
  setSelectedTool,
  setZoom,
  setPan,
} = editorUiSlice.actions;

export const editorUiReducer = editorUiSlice.reducer;
