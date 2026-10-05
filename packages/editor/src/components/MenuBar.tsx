import Redo from '@mui/icons-material/Redo'
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

import { supportsDirectoryPicker } from '../project/fileSystem.ts'
import { redo, selectCanRedo, selectCanUndo, selectIsDirty, undo } from '../store/index.ts'
import { editorUiSlice } from '../store/slices/editorUi.ts'
import { useAppDispatch, useAppSelector, useServices } from './services.tsx'

type MenuName = 'file' | 'edit' | 'view'

/** The top bar: File, Edit and View menus, undo and redo, and the project's name. */
export const MenuBar = () => {
  const dispatch = useAppDispatch()
  const { session } = useServices()
  const [open, setOpen] = useState<{ name: MenuName; anchor: HTMLElement } | null>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const [importKey, setImportKey] = useState(0)

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
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mr: 1 }}>
          RPG Studio
        </Typography>
        <Button size="small" color="inherit" onClick={trigger('file')}>
          File
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
        <Typography variant="body2" sx={{ ml: 'auto' }} aria-label="Project name">
          {name}
          {dirty ? ' •' : ''}
          {folderName ? ` — ${folderName}` : ''}
        </Typography>
      </Toolbar>

      <Menu anchorEl={open?.anchor} open={open?.name === 'file'} onClose={close}>
        <MenuItem
          onClick={run(() => {
            session.newProject()
          })}
        >
          <ListItemText>New project</ListItemText>
        </MenuItem>
        <MenuItem disabled={!folders} onClick={run(() => session.openFolder())}>
          <ListItemText secondary={folders ? undefined : 'Not supported in this browser'}>
            Open folder…
          </ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            close()
            importInput.current?.click()
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
