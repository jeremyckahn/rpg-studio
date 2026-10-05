import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.tsx'
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
      <App store={handle.store} services={{ session, panels, textures }} />
    </StrictMode>,
  )
  void registerServiceWorker()
}

void boot()
