import { type PluginManager } from '@rpgstudio/core'

import { DatabaseEditor } from '../components/database/DatabaseEditor.tsx'
import { MapEditorWorkspace } from '../components/MapEditorWorkspace.tsx'
import { MapToolPanel } from '../components/MapToolPanel.tsx'
import { PropertiesPanel } from '../components/PropertiesPanel.tsx'
import { createPiskelEditorPanel } from '../piskel/PiskelEditorPanel.tsx'
import { PreviewDebugPanel } from '../preview/PreviewDebugPanel.tsx'
import { createPreviewPanel } from '../preview/PreviewWorkspace.tsx'
import { PREVIEW_PANEL_ID } from '../store/slices/editorUi.ts'
import { type EditorCapabilities } from './editorHost.ts'

/** Panel ids of the first-party plugins, shared with `editorUi.workspacePanel`. */
export const PANEL_IDS = {
  map: 'rpgstudio.map-editor',
  database: 'rpgstudio.database',
  pixel: 'rpgstudio.pixel-editor',
  preview: PREVIEW_PANEL_ID,
} as const

/**
 * The map editor, database editor and sprite editor are ordinary plugins that
 * register their panels through the same `ui` capability third parties use.
 * They are bundled with the editor rather than loaded from Blob URLs, but the
 * manager treats them identically: declared capabilities, lifecycle, teardown.
 */
export const registerCorePlugins = (manager: PluginManager<EditorCapabilities>): void => {
  manager.register({
    manifest: {
      id: PANEL_IDS.map,
      name: 'Map Editor',
      version: '1.0.0',
      description: 'Tile painting, layers, collision and map properties.',
      capabilities: ['ui'],
      entries: { editor: 'editor.js' },
    },
    module: {
      initialize: (ctx) => {
        ctx.ui.registerPanel({
          id: PANEL_IDS.map,
          title: 'Map',
          location: 'workspace',
          order: 10,
          component: MapEditorWorkspace,
        })
        ctx.ui.registerPanel({
          id: `${PANEL_IDS.map}.tools`,
          title: 'Tools',
          location: 'left',
          when: PANEL_IDS.map,
          component: MapToolPanel,
        })
        ctx.ui.registerPanel({
          id: `${PANEL_IDS.map}.properties`,
          title: 'Properties',
          location: 'right',
          when: PANEL_IDS.map,
          component: PropertiesPanel,
        })
      },
    },
  })

  manager.register({
    manifest: {
      id: PANEL_IDS.preview,
      name: 'Live Preview',
      version: '1.0.0',
      description: 'Plays the game inside the editor, reloading as the project changes.',
      capabilities: ['ui', 'files:read'],
      entries: { editor: 'editor.js' },
    },
    module: {
      initialize: (ctx) => {
        ctx.ui.registerPanel({
          id: PANEL_IDS.preview,
          title: 'Play',
          location: 'workspace',
          order: 15,
          component: createPreviewPanel({ read: ctx.readFiles }),
        })
        ctx.ui.registerPanel({
          id: `${PANEL_IDS.preview}.debug`,
          title: 'Debug',
          location: 'right',
          when: PANEL_IDS.preview,
          component: PreviewDebugPanel,
        })
      },
    },
  })

  manager.register({
    manifest: {
      id: PANEL_IDS.database,
      name: 'Database Editor',
      version: '1.0.0',
      description: 'Actors, classes, items, skills and enemies as schema-driven tables.',
      capabilities: ['ui'],
      entries: { editor: 'editor.js' },
    },
    module: {
      initialize: (ctx) => {
        ctx.ui.registerPanel({
          id: PANEL_IDS.database,
          title: 'Database',
          location: 'workspace',
          order: 20,
          component: DatabaseEditor,
        })
      },
    },
  })

  manager.register({
    manifest: {
      id: PANEL_IDS.pixel,
      name: 'Pixel Editor',
      version: '1.0.0',
      description: 'Embedded Piskel sprite editor with live texture hot-reloading.',
      capabilities: ['ui', 'files:read', 'files:write'],
      entries: { editor: 'editor.js' },
    },
    module: {
      initialize: (ctx) => {
        ctx.ui.registerPanel({
          id: PANEL_IDS.pixel,
          title: 'Sprite Editor',
          location: 'workspace',
          order: 30,
          component: createPiskelEditorPanel({ read: ctx.readFiles, write: ctx.writeFiles }),
        })
      },
    },
  })
}
