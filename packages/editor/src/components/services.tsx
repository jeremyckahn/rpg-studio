import { type TextureProvider } from '@rpgstudio/engine/renderer'
import { type ReactNode, createContext, use } from 'react'
import { type TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux'

import { type CompanionClient } from '../bridge/companionClient.ts'
import { type PanelRegistry } from '../plugins/panelRegistry.ts'
// A whole-statement type import is erased entirely; `{ type X }` would keep an import of the
// module, and its `virtual:pwa-register` import only resolves in the real app build.
import type { AppUpdater } from '../pwa/register.ts'
import { type PreviewHub } from '../preview/previewHub.ts'
import { type ProjectSession } from '../project/session.ts'
import { type AppDispatch, type RootState } from '../store/index.ts'

/** Everything the components need besides the store, supplied once at the root. */
export interface EditorServices {
  readonly session: ProjectSession
  readonly panels: PanelRegistry
  readonly textures: TextureProvider
  readonly companion: CompanionClient
  readonly updater: AppUpdater
  /** The open Play tab, if any, for the Debug panel and `GET_PREVIEW_STATE`. */
  readonly preview: PreviewHub
}

const ServicesContext = createContext<EditorServices | null>(null)

export const ServicesProvider = ({
  services,
  children,
}: {
  services: EditorServices
  children: ReactNode
}) => <ServicesContext value={services}>{children}</ServicesContext>

export const useServices = (): EditorServices => {
  const services = use(ServicesContext)
  if (!services) throw new Error('useServices must be used inside <ServicesProvider>')
  return services
}

export const useAppDispatch: () => AppDispatch = useDispatch
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector
