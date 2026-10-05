import { type Unsubscribe } from '@rpgstudio/core'
import { type ComponentType } from 'react'

export type PanelLocation = 'workspace' | 'left' | 'right' | 'bottom'

export interface PanelDefinition {
  /** Unique id; also what `editorUi.workspacePanel` selects for workspace panels. */
  readonly id: string
  readonly title: string
  readonly location: PanelLocation
  /** Lower values appear first. */
  readonly order?: number
  /** Only show this docked panel while the workspace panel with this id is in front. */
  readonly when?: string
  readonly component: ComponentType
}

/**
 * Where plugins put their UI. The layout renders whatever is registered, which
 * is how the map editor, database and sprite editor are themselves plugins.
 */
export interface PanelRegistry {
  /** Adds a panel; the returned function removes it. Ids must be unique. */
  register: (panel: PanelDefinition) => Unsubscribe
  /** A stable array that only changes identity when panels are added or removed. */
  list: () => readonly PanelDefinition[]
  subscribe: (listener: () => void) => Unsubscribe
}

export const createPanelRegistry = (): PanelRegistry => {
  let panels: readonly PanelDefinition[] = []
  let listeners: readonly (() => void)[] = []
  const notify = (): void => {
    listeners.forEach((listener) => {
      listener()
    })
  }

  return {
    register: (panel) => {
      if (panels.some((existing) => existing.id === panel.id)) {
        throw new Error(`A panel with id "${panel.id}" is already registered`)
      }
      panels = [...panels, panel].toSorted((a, b) => (a.order ?? 100) - (b.order ?? 100))
      notify()
      return () => {
        panels = panels.filter((candidate) => candidate !== panel)
        notify()
      }
    },
    list: () => panels,
    subscribe: (listener) => {
      listeners = [...listeners, listener]
      return () => {
        listeners = listeners.filter((candidate) => candidate !== listener)
      }
    },
  }
}
