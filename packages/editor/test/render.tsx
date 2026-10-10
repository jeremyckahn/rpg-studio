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
import { createPreviewHub } from '../src/preview/previewHub.ts'
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
  const preview = createPreviewHub()
  panels.forEach((panel) => registry.register(panel))
  const session = createProjectSession({ handle, assets, download: vi.fn(), baseUrl: '/' })
  const companion = createCompanionClient({
    handler: createCompanionHandler({ handle, assets, preview }),
    createSocket: () => {
      throw new Error('no network in tests')
    },
  })
  const updater = {
    register: vi.fn(() => Promise.resolve()),
    apply: vi.fn(() => Promise.resolve()),
  }
  const services: EditorServices = {
    session,
    panels: registry,
    textures,
    companion,
    updater,
    preview,
  }
  return { handle, assets, session, services, registry, updater }
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

/**
 * Makes `window.matchMedia` answer as a screen of the given size would, for the width and
 * orientation queries the layout uses. Removed again after every test (see `setup.ts`).
 */
export const mockViewport = (width: number, height: number): void => {
  const evaluate = (query: string): boolean => {
    const max = /max-width:\s*([\d.]+)px/.exec(query)
    const min = /min-width:\s*([\d.]+)px/.exec(query)
    if (max && width > Number(max[1])) return false
    if (min && width < Number(min[1])) return false
    if (query.includes('orientation: portrait') && height < width) return false
    if (query.includes('orientation: landscape') && height >= width) return false
    return true
  }
  Reflect.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: evaluate(query),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      onchange: null,
      dispatchEvent: () => false,
    }),
  })
}
