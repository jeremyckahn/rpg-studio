import { Alert, Box, Snackbar, Tab, Tabs } from '@mui/material'
import { useEffect, useSyncExternalStore } from 'react'

import { type PanelDefinition } from '../plugins/panelRegistry.ts'
import { redo, undo } from '../store/index.ts'
import { editorUiSlice } from '../store/slices/editorUi.ts'
import { AssetBrowser } from './AssetBrowser.tsx'
import { MenuBar } from './MenuBar.tsx'
import { useAppDispatch, useAppSelector, useServices } from './services.tsx'

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/** Undo, redo and save from the keyboard, unless the user is typing in a field. */
const useShortcuts = (): void => {
  const dispatch = useAppDispatch()
  const { session } = useServices()
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 's') {
        event.preventDefault()
        void session.save()
      } else if (isTyping(event.target)) {
        return
      } else if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        dispatch(undo())
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault()
        dispatch(redo())
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [dispatch, session])
}

const Dock = ({
  panels,
  side,
  width,
}: {
  panels: readonly PanelDefinition[]
  side: 'left' | 'right'
  width: number
}) => {
  if (panels.length === 0) return null
  return (
    <Box
      component="aside"
      aria-label={`${side} panels`}
      sx={{
        width,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        borderLeft: side === 'right' ? 1 : 0,
        borderRight: side === 'left' ? 1 : 0,
        borderColor: 'divider',
        overflow: 'hidden',
      }}
    >
      {panels.map(({ id, component: Component }) => (
        <Box key={id} sx={{ flex: 1, minHeight: 0, borderBottom: 1, borderColor: 'divider' }}>
          <Component />
        </Box>
      ))}
    </Box>
  )
}

const StatusSnackbar = () => {
  const dispatch = useAppDispatch()
  const status = useAppSelector((state) => state.editorUi.status)
  return (
    <Snackbar
      open={status !== null}
      autoHideDuration={status?.severity === 'error' ? 10_000 : 4_000}
      onClose={(_event, reason) => {
        if (reason !== 'clickaway') dispatch(editorUiSlice.actions.statusDismissed())
      }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
    >
      <Alert
        severity={status?.severity ?? 'info'}
        variant="filled"
        onClose={() => dispatch(editorUiSlice.actions.statusDismissed())}
        sx={{ maxWidth: 560 }}
      >
        {status?.text}
      </Alert>
    </Snackbar>
  )
}

/**
 * The master layout: menu bar on top, the asset browser and plugin-supplied
 * panels docked left and right, and the active workspace panel in the middle.
 * Everything except the menu bar and asset browser is whatever plugins registered.
 */
export const MasterLayout = () => {
  const dispatch = useAppDispatch()
  const { panels } = useServices()
  const registered = useSyncExternalStore(panels.subscribe, panels.list)
  const active = useAppSelector((state) => state.editorUi.workspacePanel)
  useShortcuts()

  const workspace = registered.filter((panel) => panel.location === 'workspace')
  const shown = (location: PanelDefinition['location']): readonly PanelDefinition[] =>
    registered.filter(
      (panel) => panel.location === location && (panel.when === undefined || panel.when === active),
    )
  const current = workspace.find((panel) => panel.id === active) ?? workspace[0]
  const Current = current?.component

  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
      }}
    >
      <MenuBar />
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Box
          component="aside"
          aria-label="Asset browser"
          sx={{
            width: 240,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            borderRight: 1,
            borderColor: 'divider',
          }}
        >
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <AssetBrowser />
          </Box>
          {shown('left').map(({ id, component: Component }) => (
            <Box key={id} sx={{ flex: 2, minHeight: 0, borderTop: 1, borderColor: 'divider' }}>
              <Component />
            </Box>
          ))}
        </Box>
        <Box
          component="main"
          sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}
        >
          <Tabs
            value={current?.id ?? false}
            onChange={(_event, id: string) =>
              dispatch(editorUiSlice.actions.workspacePanelSelected(id))
            }
            sx={{ minHeight: 40, borderBottom: 1, borderColor: 'divider' }}
          >
            {workspace.map((panel) => (
              <Tab key={panel.id} value={panel.id} label={panel.title} sx={{ minHeight: 40 }} />
            ))}
          </Tabs>
          <Box sx={{ flex: 1, minHeight: 0 }}>{Current ? <Current key={current?.id} /> : null}</Box>
        </Box>
        <Dock panels={shown('right')} side="right" width={320} />
      </Box>
      <StatusSnackbar />
    </Box>
  )
}
