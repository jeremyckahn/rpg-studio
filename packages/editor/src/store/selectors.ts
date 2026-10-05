import { type Project, type Tilemap } from '@rpgstudio/core'

import { type RootState } from './index.ts'

export const selectProject = (state: RootState): Project => state.project.data

export const selectMaps = (state: RootState): readonly Tilemap[] => state.project.data.maps

/** The selected map, falling back to the project's first map. */
export const selectCurrentMap = (state: RootState): Tilemap | undefined => {
  const { maps } = state.project.data
  return maps.find((map) => map.id === state.editorUi.selectedMapId) ?? maps[0]
}

export const selectIsDirty = (state: RootState): boolean =>
  state.project.revision !== state.editorUi.savedRevision

export const selectCanUndo = (state: RootState): boolean => state.history.past.length > 0

export const selectCanRedo = (state: RootState): boolean => state.history.future.length > 0
