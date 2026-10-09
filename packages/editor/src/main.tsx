import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.tsx'
import { createCompanionClient } from './bridge/companionClient.ts'
import { createCompanionHandler } from './bridge/handler.ts'
import { createRPGStudioApi, installRPGStudioGlobal } from './bridge/global.ts'
import { editorUiSlice } from './store/slices/editorUi.ts'
import { createPanelRegistry } from './plugins/panelRegistry.ts'
import { registerCorePlugins } from './plugins/corePlugins.ts'
import { createEditorPluginHost } from './plugins/editorHost.ts'
import { createPreviewHub } from './preview/previewHub.ts'
import { createAssetStore } from './project/assetStore.ts'
import { createProjectSession } from './project/session.ts'
import { createEditorTextureProvider } from './project/textures.ts'
import { createAppUpdater } from './pwa/register.ts'
import { createEditorStore } from './store/index.ts'

const boot = async (): Promise<void> => {
  const handle = createEditorStore()
  const assets = createAssetStore()
  const panels = createPanelRegistry()
  // Order matters: both subscribe to the asset store, in this order. The texture provider must
  // drop its cache first, or the canvas (woken by the session's mirror) reloads the old image.
  const textures = createEditorTextureProvider(assets)
  const session = createProjectSession({ handle, assets })
  session.newProject()

  // The companion bridge: the editor dials out to a local server, and also answers
  // `RPGStudio.query(...)` from the page itself. Both go through the same validating handler.
  const preview = createPreviewHub()
  const handler = createCompanionHandler({ handle, assets, preview })
  const companion = createCompanionClient({ handler })
  companion.onStatus((status, error) => {
    handle.store.dispatch(editorUiSlice.actions.companionStatusChanged({ status, error }))
  })
  installRPGStudioGlobal(window, createRPGStudioApi({ handle, assets, preview }, handler))

  const host = createEditorPluginHost({
    handle,
    assets,
    panels,
    logSink: (entry) => {
      console[entry.level](`[${entry.pluginId}] ${entry.message}`, entry.data ?? '')
    },
  })
  registerCorePlugins(host.manager)
  await host.manager.initialize()

  const updater = createAppUpdater({
    onUpdateReady: () => handle.store.dispatch(editorUiSlice.actions.updateReady()),
    onOfflineReady: () =>
      handle.store.dispatch(
        editorUiSlice.actions.statusShown({
          severity: 'success',
          text: 'RPG Studio is ready to work offline.',
        }),
      ),
  })

  const root = document.getElementById('root')
  if (!root) throw new Error('Missing #root element')
  createRoot(root).render(
    <StrictMode>
      <App
        store={handle.store}
        services={{ session, panels, textures, companion, updater, preview }}
      />
    </StrictMode>,
  )
  void updater.register()
}

void boot()
