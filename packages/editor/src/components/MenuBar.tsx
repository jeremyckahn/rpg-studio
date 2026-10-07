import HelpOutlined from '@mui/icons-material/HelpOutlined'
import Redo from '@mui/icons-material/Redo'
import Sensors from '@mui/icons-material/Sensors'
import Undo from '@mui/icons-material/Undo'
import {
  AppBar,
  Button,
  Divider,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material'
import { useRef, useState } from 'react'

import { CompanionDialog } from './CompanionDialog.tsx'
import { DiscardChangesDialog } from './DiscardChangesDialog.tsx'
import { useLayoutMode } from './useLayoutMode.ts'

import { USER_GUIDE_URL } from '../links.ts'
import { supportsDirectoryPicker } from '../project/fileSystem.ts'
import { redo, selectCanRedo, selectCanUndo, selectIsDirty, undo } from '../store/index.ts'
import { editorUiSlice } from '../store/slices/editorUi.ts'
import { useAppDispatch, useAppSelector, useServices } from './services.tsx'

type MenuName = 'file' | 'edit' | 'view'

const COMPANION_LABEL = {
  disconnected: 'Companion: off',
  connecting: 'Companion: connecting…',
  connected: 'Companion: connected',
} as const

/** The top bar: File, Edit and View menus, undo and redo, and the project's name. */
export const MenuBar = () => {
  const dispatch = useAppDispatch()
  const { session } = useServices()
  const { compact } = useLayoutMode()
  const [open, setOpen] = useState<{ name: MenuName; anchor: HTMLElement } | null>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const [importKey, setImportKey] = useState(0)
  const [companionOpen, setCompanionOpen] = useState(false)
  /** Something that would replace the project, waiting for the user to confirm discarding changes. */
  const [replacing, setReplacing] = useState<{ label: string; run: () => void } | null>(null)
  const companionStatus = useAppSelector((state) => state.editorUi.companion.status)

  const name = useAppSelector((state) => state.project.data.meta.name)
  const dirty = useAppSelector(selectIsDirty)
  const canUndo = useAppSelector(selectCanUndo)
  const canRedo = useAppSelector(selectCanRedo)
  const folderName = useAppSelector((state) => state.editorUi.folderName)
  const ui = useAppSelector((state) => state.editorUi)
  const folders = supportsDirectoryPicker()

  const close = (): void => {
    setOpen(null)
  }
  const run =
    (action: () => unknown): (() => void) =>
    () => {
      close()
      void action()
    }
  /** Runs `replace` at once, or after confirmation when it would throw away unsaved changes. */
  const confirmReplace =
    (label: string, replace: () => unknown): (() => void) =>
    () => {
      close()
      if (dirty) setReplacing({ label, run: () => void replace() })
      else void replace()
    }
  const trigger = (menu: MenuName) => (event: React.MouseEvent<HTMLElement>) => {
    setOpen({ name: menu, anchor: event.currentTarget })
  }

  return (
    <AppBar
      position="static"
      color="default"
      elevation={0}
      sx={{ borderBottom: 1, borderColor: 'divider' }}
    >
      <Toolbar variant="dense" sx={{ gap: 0.5 }}>
        {compact ? null : (
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mr: 1 }}>
            RPG Studio
          </Typography>
        )}
        <Button size="small" color="inherit" onClick={trigger('file')}>
          {/* The name does not fit on a phone, so the unsaved marker rides on File. */}
          File{compact && dirty ? ' •' : ''}
        </Button>
        <Button size="small" color="inherit" onClick={trigger('edit')}>
          Edit
        </Button>
        <Button size="small" color="inherit" onClick={trigger('view')}>
          View
        </Button>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Tooltip title="Undo (Ctrl+Z)">
          <span>
            <IconButton
              size="small"
              aria-label="Undo"
              disabled={!canUndo}
              onClick={() => dispatch(undo())}
            >
              <Undo fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Redo (Ctrl+Shift+Z)">
          <span>
            <IconButton
              size="small"
              aria-label="Redo"
              disabled={!canRedo}
              onClick={() => dispatch(redo())}
            >
              <Redo fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="User guide (opens the docs)">
          <IconButton
            size="small"
            component="a"
            href={USER_GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="User guide"
            sx={{ ml: 'auto' }}
          >
            <HelpOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
        {compact ? (
          <IconButton
            size="small"
            aria-label={COMPANION_LABEL[companionStatus]}
            color={companionStatus === 'connected' ? 'success' : 'default'}
            onClick={() => {
              setCompanionOpen(true)
            }}
          >
            <Sensors fontSize="small" />
          </IconButton>
        ) : (
          <Button
            size="small"
            color={companionStatus === 'connected' ? 'success' : 'inherit'}
            sx={{ textTransform: 'none' }}
            onClick={() => {
              setCompanionOpen(true)
            }}
          >
            {COMPANION_LABEL[companionStatus]}
          </Button>
        )}
        {compact ? null : (
          <Typography variant="body2" noWrap sx={{ ml: 2, minWidth: 0 }} aria-label="Project name">
            {name}
            {dirty ? ' •' : ''}
            {folderName ? ` — ${folderName}` : ''}
          </Typography>
        )}
      </Toolbar>

      <Menu anchorEl={open?.anchor} open={open?.name === 'file'} onClose={close}>
        <MenuItem
          onClick={confirmReplace('Creating a new project', () => {
            session.newProject()
          })}
        >
          <ListItemText>New project</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={!folders}
          onClick={confirmReplace('Opening a folder', () => session.openFolder())}
        >
          <ListItemText secondary={folders ? undefined : 'Not supported in this browser'}>
            Open folder…
          </ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            // Built inside the handler: the compiler does not allow reading a ref in a render-time closure.
            confirmReplace('Importing a project', () => importInput.current?.click())()
          }}
        >
          <ListItemText>Import project (.zip)…</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem disabled={!folders} onClick={run(() => session.save())}>
          <ListItemText secondary="Ctrl+S">Save</ListItemText>
        </MenuItem>
        <MenuItem disabled={!folders} onClick={run(() => session.saveAs())}>
          <ListItemText>Save to another folder…</ListItemText>
        </MenuItem>
        <MenuItem onClick={run(() => session.downloadProjectArchive())}>
          <ListItemText>Download project (.zip)</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={run(() => session.exportGame())}>
          <ListItemText secondary="A static web build for itch.io or any host">
            Export game (.zip)
          </ListItemText>
        </MenuItem>
      </Menu>

      <Menu anchorEl={open?.anchor} open={open?.name === 'edit'} onClose={close}>
        <MenuItem disabled={!canUndo} onClick={run(() => dispatch(undo()))}>
          <ListItemText secondary="Ctrl+Z">Undo</ListItemText>
        </MenuItem>
        <MenuItem disabled={!canRedo} onClick={run(() => dispatch(redo()))}>
          <ListItemText secondary="Ctrl+Shift+Z">Redo</ListItemText>
        </MenuItem>
      </Menu>

      <Menu anchorEl={open?.anchor} open={open?.name === 'view'} onClose={close}>
        <MenuItem onClick={run(() => dispatch(editorUiSlice.actions.gridToggled()))}>
          <ListItemText>{ui.showGrid ? 'Hide' : 'Show'} grid</ListItemText>
        </MenuItem>
        <MenuItem onClick={run(() => dispatch(editorUiSlice.actions.collisionOverlayToggled()))}>
          <ListItemText>{ui.showCollision ? 'Hide' : 'Show'} collision</ListItemText>
        </MenuItem>
        <MenuItem onClick={run(() => dispatch(editorUiSlice.actions.dimInactiveLayersToggled()))}>
          <ListItemText>{ui.dimInactiveLayers ? 'Stop dimming' : 'Dim'} other layers</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={run(() => dispatch(editorUiSlice.actions.zoomStepped(1)))}>
          <ListItemText>Zoom in</ListItemText>
        </MenuItem>
        <MenuItem onClick={run(() => dispatch(editorUiSlice.actions.zoomStepped(-1)))}>
          <ListItemText>Zoom out</ListItemText>
        </MenuItem>
      </Menu>

      <DiscardChangesDialog
        open={replacing !== null}
        action={replacing?.label ?? ''}
        canSave={folders}
        onCancel={() => {
          setReplacing(null)
        }}
        onDiscard={() => {
          replacing?.run()
          setReplacing(null)
        }}
        onSaveFirst={() => {
          const pending = replacing
          setReplacing(null)
          // Only carry on if the save went through (a cancelled folder picker returns false).
          void session.save().then((saved) => {
            if (saved) pending?.run()
          })
        }}
      />

      <CompanionDialog
        open={companionOpen}
        onClose={() => {
          setCompanionOpen(false)
        }}
      />

      <input
        key={importKey}
        ref={importInput}
        type="file"
        accept=".zip,application/zip"
        hidden
        aria-label="Import project archive"
        onChange={(event) => {
          const file = event.target.files?.[0]
          setImportKey((key) => key + 1)
          if (file)
            void file.arrayBuffer().then((buffer) => session.openArchive(new Uint8Array(buffer)))
        }}
      />
    </AppBar>
  )
}
