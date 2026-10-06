import Brush from '@mui/icons-material/Brush'
import FolderOpen from '@mui/icons-material/FolderOpen'
import Tune from '@mui/icons-material/Tune'
import {
  Alert,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  Snackbar,
  Tab,
  Tabs,
} from '@mui/material'
import { type ReactNode, useEffect, useState, useSyncExternalStore } from 'react'

import { type PanelDefinition } from '../plugins/panelRegistry.ts'
import { redo, selectIsDirty, undo } from '../store/index.ts'
import { editorUiSlice } from '../store/slices/editorUi.ts'
import { AssetBrowser } from './AssetBrowser.tsx'
import { MenuBar } from './MenuBar.tsx'
import { useLayoutMode } from './useLayoutMode.ts'
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

/**
 * Asks the browser to confirm before the tab is closed or reloaded with unsaved changes.
 * Nothing autosaves, so leaving silently would lose the work. The message text is the
 * browser's own; pages cannot customise it.
 */
const useUnsavedChangesWarning = (): void => {
  const dirty = useAppSelector(selectIsDirty)
  useEffect(() => {
    if (!dirty) return undefined
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      // Older browsers only show the prompt when returnValue is set.
      Reflect.set(event, 'returnValue', '')
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [dirty])
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
  const { compact } = useLayoutMode()
  const status = useAppSelector((state) => state.editorUi.status)
  return (
    <Snackbar
      open={status !== null}
      autoHideDuration={status?.severity === 'error' ? 10_000 : 4_000}
      onClose={(_event, reason) => {
        if (reason !== 'clickaway') dispatch(editorUiSlice.actions.statusDismissed())
      }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      // Keep clear of the compact layout's bottom navigation bar.
      sx={compact ? { bottom: 'calc(64px + env(safe-area-inset-bottom))' } : undefined}
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
 * Offers the new version of the app once the service worker has downloaded it.
 * Applying it reloads the page, so unsaved work is called out before the user agrees.
 */
const UpdateNotice = () => {
  const dispatch = useAppDispatch()
  const { updater } = useServices()
  const available = useAppSelector((state) => state.editorUi.updateAvailable)
  const dirty = useAppSelector(selectIsDirty)
  return (
    <Snackbar
      open={available}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      sx={{ top: { xs: 8, sm: 16 } }}
    >
      <Alert
        severity={dirty ? 'warning' : 'info'}
        variant="filled"
        sx={{ maxWidth: 560, alignItems: 'center' }}
        action={
          <>
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                dispatch(editorUiSlice.actions.updateDismissed())
              }}
            >
              Later
            </Button>
            <Button
              color="inherit"
              size="small"
              sx={{ fontWeight: 700 }}
              onClick={() => void updater.apply()}
            >
              {dirty ? 'Reload anyway' : 'Reload'}
            </Button>
          </>
        }
      >
        {dirty
          ? 'A new version is ready, but you have unsaved changes. Save first, then reload.'
          : 'A new version of RPG Studio is ready.'}
      </Alert>
    </Snackbar>
  )
}

interface Section {
  readonly id: string
  readonly title: string
  readonly icon: ReactNode
  readonly content: ReactNode
}

/**
 * The compact layout: the active workspace fills the screen and every docked panel
 * becomes a section of a bottom sheet, chosen from a navigation bar. Tapping the
 * open section collapses the sheet to give the map the whole screen. The sheet sits
 * under the workspace in portrait and beside it in landscape.
 */
const CompactBody = ({
  workspace,
  left,
  right,
  portrait,
}: {
  workspace: ReactNode
  left: readonly PanelDefinition[]
  right: readonly PanelDefinition[]
  portrait: boolean
}) => {
  const [chosen, setChosen] = useState<string | null | undefined>(undefined)
  const sections: readonly Section[] = [
    { id: 'assets', title: 'Assets', icon: <FolderOpen />, content: <AssetBrowser /> },
    ...left.map(({ id, title, component: Component }) => ({
      id,
      title,
      icon: <Brush />,
      content: <Component />,
    })),
    ...right.map(({ id, title, component: Component }) => ({
      id,
      title,
      icon: <Tune />,
      content: <Component />,
    })),
  ]
  // Until the user picks something, open the first workspace tool (the tile palette for maps).
  const fallback = left[0]?.id ?? null
  const wanted = chosen === undefined ? fallback : chosen
  const open = sections.find((section) => section.id === wanted)

  return (
    <>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: portrait ? 'column' : 'row',
        }}
      >
        <Box
          component="main"
          sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}
        >
          {workspace}
        </Box>
        {open ? (
          <Box
            component="aside"
            aria-label={`${open.title} sheet`}
            sx={{
              flexShrink: 0,
              overflow: 'hidden',
              borderTop: portrait ? 1 : 0,
              borderLeft: portrait ? 0 : 1,
              borderColor: 'divider',
              ...(portrait
                ? { height: 'min(36dvh, 320px)' }
                : { width: 'min(45vw, 320px)', minHeight: 0 }),
            }}
          >
            {open.content}
          </Box>
        ) : null}
      </Box>
      <BottomNavigation
        showLabels
        value={open?.id ?? false}
        onChange={(_event, id: string) => {
          setChosen(id === open?.id ? null : id)
        }}
        sx={{
          flexShrink: 0,
          borderTop: 1,
          borderColor: 'divider',
          height: 'calc(56px + env(safe-area-inset-bottom))',
          pb: 'env(safe-area-inset-bottom)',
        }}
      >
        {sections.map((section) => (
          <BottomNavigationAction
            key={section.id}
            value={section.id}
            label={section.title}
            icon={section.icon}
            sx={{ minWidth: 64 }}
          />
        ))}
      </BottomNavigation>
    </>
  )
}

/**
 * The master layout: menu bar on top, the asset browser and plugin-supplied
 * panels docked left and right, and the active workspace panel in the middle.
 * Everything except the menu bar and asset browser is whatever plugins registered.
 * On small screens the docks fold into a bottom sheet (see `CompactBody`).
 */
export const MasterLayout = () => {
  const dispatch = useAppDispatch()
  const { panels } = useServices()
  const registered = useSyncExternalStore(panels.subscribe, panels.list)
  const active = useAppSelector((state) => state.editorUi.workspacePanel)
  const { compact, portrait } = useLayoutMode()
  useShortcuts()
  useUnsavedChangesWarning()

  const workspace = registered.filter((panel) => panel.location === 'workspace')
  const shown = (location: PanelDefinition['location']): readonly PanelDefinition[] =>
    registered.filter(
      (panel) => panel.location === location && (panel.when === undefined || panel.when === active),
    )
  const current = workspace.find((panel) => panel.id === active) ?? workspace[0]
  const Current = current?.component

  const tabs = (
    <Tabs
      value={current?.id ?? false}
      onChange={(_event, id: string) => dispatch(editorUiSlice.actions.workspacePanelSelected(id))}
      variant={compact ? 'scrollable' : 'standard'}
      scrollButtons={false}
      sx={{ minHeight: 40, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
    >
      {workspace.map((panel) => (
        <Tab key={panel.id} value={panel.id} label={panel.title} sx={{ minHeight: 40 }} />
      ))}
    </Tabs>
  )
  const surface = (
    <Box sx={{ flex: 1, minHeight: 0 }}>{Current ? <Current key={current?.id} /> : null}</Box>
  )

  return (
    <Box
      sx={{
        // dvh excludes the mobile browser's collapsing address bar; vh is the fallback.
        height: ['100vh', '100dvh'],
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
      }}
    >
      <MenuBar />
      {compact ? (
        <CompactBody
          portrait={portrait}
          left={shown('left')}
          right={shown('right')}
          workspace={
            <>
              {tabs}
              {surface}
            </>
          }
        />
      ) : (
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
            {tabs}
            {surface}
          </Box>
          <Dock panels={shown('right')} side="right" width={320} />
        </Box>
      )}
      <StatusSnackbar />
      <UpdateNotice />
    </Box>
  )
}
