import { type Project, inBounds } from '@rpgstudio/core'

/** Where "Play from here" begins. Held in the editor's UI state only, never in the project. */
export interface PreviewStart {
  readonly mapId: number
  readonly x: number
  readonly y: number
}

const find = (project: Project, start: PreviewStart) => {
  const map = project.maps.find((candidate) => candidate.id === start.mapId)
  return map && inBounds(map, start) ? map : undefined
}

/** A start that the project can no longer honour (map deleted or shrunk) is ignored, not an error. */
export const isValidStart = (project: Project, start: PreviewStart | null): start is PreviewStart =>
  start !== null && find(project, start) !== undefined

/**
 * The project to play: the real one, with its start position replaced when a valid "Play from
 * here" is set. Used only to build the game, so the saved project is never touched.
 */
export const applyStart = (project: Project, start: PreviewStart | null): Project =>
  isValidStart(project, start)
    ? {
        ...project,
        meta: { ...project.meta, startMapId: start.mapId, startX: start.x, startY: start.y },
      }
    : project

/** "Village (10, 7)", or null when `start` is unset or no longer valid. */
export const describeStart = (project: Project, start: PreviewStart | null): string | null => {
  if (!isValidStart(project, start)) return null
  const map = find(project, start)
  return `${map?.name ?? `Map ${start.mapId}`} (${start.x}, ${start.y})`
}
