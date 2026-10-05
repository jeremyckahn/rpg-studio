import { type TextureProvider } from '@rpgstudio/engine/renderer'
import { type ReactNode, createContext, use } from 'react'
import { type TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux'

import { type CompanionClient } from '../bridge/companionClient.ts'
import { type PanelRegistry } from '../plugins/panelRegistry.ts'
import { type ProjectSession } from '../project/session.ts'
import { type AppDispatch, type RootState } from '../store/index.ts'

/** Everything the components need besides the store, supplied once at the root. */
export interface EditorServices {
  readonly session: ProjectSession
  readonly panels: PanelRegistry
  readonly textures: TextureProvider
  readonly companion: CompanionClient
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
