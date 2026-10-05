import { ThemeProvider, createTheme } from '@mui/material'
import { type TextureProvider } from '@rpgstudio/engine/renderer'
import { render } from '@testing-library/react'
import { type ReactElement } from 'react'
import { Provider } from 'react-redux'
import { vi } from 'vitest'

import { type EditorServices, ServicesProvider } from '../src/components/services.tsx'
import { type PanelDefinition, createPanelRegistry } from '../src/plugins/panelRegistry.ts'
import { createCompanionClient } from '../src/bridge/companionClient.ts'
import { createCompanionHandler } from '../src/bridge/handler.ts'
import { createAssetStore } from '../src/project/assetStore.ts'
import { createProjectSession } from '../src/project/session.ts'
import { createEditorStore } from '../src/store/index.ts'
import { sampleProject } from './helpers.ts'

const textures: TextureProvider = {
  load: () => Promise.reject(new Error('no GPU in tests')),
  get: () => undefined,
  invalidate: () => undefined,
}

/** A real store, asset store and session wired the way the app wires them. */
export const createHarness = (panels: readonly PanelDefinition[] = []) => {
  const handle = createEditorStore({ project: sampleProject() })
  const assets = createAssetStore()
  const registry = createPanelRegistry()
  panels.forEach((panel) => registry.register(panel))
  const session = createProjectSession({ handle, assets, download: vi.fn(), baseUrl: '/' })
  const companion = createCompanionClient({
    handler: createCompanionHandler({ handle, assets }),
    createSocket: () => {
      throw new Error('no network in tests')
    },
  })
  const services: EditorServices = { session, panels: registry, textures, companion }
  return { handle, assets, session, services, registry }
}

export const renderInApp = (ui: ReactElement, harness = createHarness()) => ({
  ...harness,
  ...render(
    <Provider store={harness.handle.store}>
      <ServicesProvider services={harness.services}>
        <ThemeProvider theme={createTheme({ palette: { mode: 'dark' } })}>{ui}</ThemeProvider>
      </ServicesProvider>
    </Provider>,
  ),
})
