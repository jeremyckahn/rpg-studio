import AudioFile from '@mui/icons-material/AudioFile'
import FolderOpen from '@mui/icons-material/FolderOpen'
import Image from '@mui/icons-material/Image'
import InsertDriveFile from '@mui/icons-material/InsertDriveFile'
import Palette from '@mui/icons-material/Palette'
import UploadFile from '@mui/icons-material/UploadFile'
import {
  Box,
  Button,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material'
import { useRef, useState } from 'react'

import { editorUiSlice } from '../store/slices/editorUi.ts'
import { useAppDispatch, useAppSelector, useServices } from './services.tsx'

interface UploadTarget {
  readonly label: string
  readonly folder: string
  readonly accept: string
}

const UPLOAD_TARGETS: readonly UploadTarget[] = [
  { label: 'Tileset image', folder: 'img/tilesets', accept: 'image/png,image/gif,image/webp' },
  { label: 'Character sheet', folder: 'img/characters', accept: 'image/png,image/gif,image/webp' },
  { label: 'Picture', folder: 'img/pictures', accept: 'image/png,image/jpeg,image/gif,image/webp' },
  { label: 'Music (BGM)', folder: 'audio/bgm', accept: 'audio/*' },
  { label: 'Ambience (BGS)', folder: 'audio/bgs', accept: 'audio/*' },
  { label: 'Jingle (ME)', folder: 'audio/me', accept: 'audio/*' },
  { label: 'Sound effect (SE)', folder: 'audio/se', accept: 'audio/*' },
]

const extensionOf = (path: string): string => path.slice(path.lastIndexOf('.') + 1).toLowerCase()

const iconFor = (path: string) => {
  const extension = extensionOf(path)
  if (extension === 'piskel') return <Palette fontSize="small" />
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension)) return <Image fontSize="small" />
  if (['ogg', 'mp3', 'm4a', 'wav'].includes(extension)) return <AudioFile fontSize="small" />
  return <InsertDriveFile fontSize="small" />
}

const OPENABLE = new Set(['png', 'piskel'])

/** Safe file name for something the user uploaded. */
const fileNameFor = (name: string): string =>
  // Only the file's own name counts; any folder part a browser reports is dropped.
  (name.split(/[\\/]/).at(-1) ?? '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '')

/** Lists the project's images, audio and plugins. Double-click an image to edit it. */
export const AssetBrowser = () => {
  const dispatch = useAppDispatch()
  const { session } = useServices()
  const paths = useAppSelector((state) => state.assets.paths)
  const openPath = useAppSelector((state) => state.editorUi.openAssetPath)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [target, setTarget] = useState<UploadTarget | null>(null)
  // Bumping the key remounts the file input, which clears its selection.
  const [inputKey, setInputKey] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const folders = Map.groupBy(paths, (path) => path.split('/').slice(0, -1).join('/') || '/')

  const upload = async (files: FileList | null): Promise<void> => {
    const destination = target
    if (!files || !destination) return
    for (const file of files) {
      const name = fileNameFor(file.name)
      if (name === '') continue
      session.assets.write(
        `${destination.folder}/${name}`,
        new Uint8Array(await file.arrayBuffer()),
      )
    }
  }

  return (
    <Box sx={{ overflow: 'auto', height: '100%', py: 1 }}>
      <Box sx={{ px: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="overline" color="text.secondary">
          Assets
        </Typography>
        <Button
          size="small"
          startIcon={<UploadFile />}
          onClick={(event) => {
            setMenuAnchor(event.currentTarget)
          }}
        >
          Add
        </Button>
      </Box>
      <Menu
        anchorEl={menuAnchor}
        open={menuAnchor !== null}
        onClose={() => {
          setMenuAnchor(null)
        }}
      >
        {UPLOAD_TARGETS.map((option) => (
          <MenuItem
            key={option.folder}
            onClick={() => {
              setTarget(option)
              setMenuAnchor(null)
              // The input re-renders with the new `accept` before the picker opens.
              window.setTimeout(() => input.current?.click(), 0)
            }}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>
      <input
        key={inputKey}
        ref={input}
        type="file"
        multiple
        hidden
        accept={target?.accept}
        aria-label="Upload assets"
        onChange={(event) => {
          void upload(event.target.files)
          setInputKey((key) => key + 1)
        }}
      />
      {paths.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
          No assets yet.
        </Typography>
      ) : null}
      {[...folders.entries()].map(([folder, files]) => (
        <List
          key={folder}
          dense
          disablePadding
          subheader={
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ px: 1, display: 'flex', gap: 0.5, alignItems: 'center' }}
            >
              <FolderOpen fontSize="inherit" /> {folder}
            </Typography>
          }
        >
          {files.map((path) => (
            <ListItemButton
              key={path}
              selected={path === openPath}
              onDoubleClick={() => {
                if (OPENABLE.has(extensionOf(path)))
                  dispatch(editorUiSlice.actions.assetOpened(path))
              }}
              title={OPENABLE.has(extensionOf(path)) ? 'Double-click to edit' : path}
            >
              <ListItemIcon sx={{ minWidth: 30 }}>{iconFor(path)}</ListItemIcon>
              <ListItemText primary={path.slice(path.lastIndexOf('/') + 1)} />
            </ListItemButton>
          ))}
        </List>
      ))}
    </Box>
  )
}
