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
import { createAssetStore } from './project/assetStore.ts'
import { createProjectSession } from './project/session.ts'
import { createEditorTextureProvider } from './project/textures.ts'
import { registerServiceWorker } from './pwa/register.ts'
import { createEditorStore } from './store/index.ts'

const boot = async (): Promise<void> => {
  const handle = createEditorStore()
  const assets = createAssetStore()
  const panels = createPanelRegistry()
  const session = createProjectSession({ handle, assets })
  const textures = createEditorTextureProvider(assets)
  session.newProject()

  // The companion bridge: the editor dials out to a local server, and also answers
  // `RPGStudio.query(...)` from the page itself. Both go through the same validating handler.
  const handler = createCompanionHandler({ handle, assets })
  const companion = createCompanionClient({ handler })
  companion.onStatus((status, error) => {
    handle.store.dispatch(editorUiSlice.actions.companionStatusChanged({ status, error }))
  })
  installRPGStudioGlobal(window, createRPGStudioApi({ handle, assets }, handler))

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

  const root = document.getElementById('root')
  if (!root) throw new Error('Missing #root element')
  createRoot(root).render(
    <StrictMode>
      <App store={handle.store} services={{ session, panels, textures, companion }} />
    </StrictMode>,
  )
  void registerServiceWorker()
}

void boot()
