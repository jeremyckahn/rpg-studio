import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import VerticalAlignTop from '@mui/icons-material/VerticalAlignTop'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { SUPPORTED_TILE_SIZES, type TileSize } from '@rpgstudio/core'
import { useState } from 'react'

import { selectCurrentMap } from '../store/index.ts'
import { editorUiSlice } from '../store/slices/editorUi.ts'
import { projectActions } from '../store/slices/project.ts'
import { useAppDispatch, useAppSelector, useServices } from './services.tsx'
import { useAssetUrl } from './useAssetUrl.ts'

const Section = ({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) => (
  <Box sx={{ mb: 2 }}>
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', px: 1 }}>
      <Typography variant="overline" color="text.secondary">
        {title}
      </Typography>
      {action}
    </Stack>
    {children}
  </Box>
)

const NewMapDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const dispatch = useAppDispatch()
  const mapCount = useAppSelector((state) => state.project.data.maps.length)
  const [name, setName] = useState('')
  const [width, setWidth] = useState(20)
  const [height, setHeight] = useState(15)
  const [tileSize, setTileSize] = useState<TileSize>(16)

  const create = (): void => {
    dispatch(
      projectActions.createMap({
        name: name.trim() || `Map ${mapCount + 1}`,
        width: Math.min(512, Math.max(1, width)),
        height: Math.min(512, Math.max(1, height)),
        tileSize,
      }),
    )
    setName('')
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>New map</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
            }}
            placeholder={`Map ${mapCount + 1}`}
          />
          <Stack direction="row" spacing={2}>
            <TextField
              label="Width (tiles)"
              type="number"
              value={width}
              onChange={(e) => {
                setWidth(Number(e.target.value))
              }}
            />
            <TextField
              label="Height (tiles)"
              type="number"
              value={height}
              onChange={(e) => {
                setHeight(Number(e.target.value))
              }}
            />
          </Stack>
          <TextField
            select
            label="Tile size"
            value={tileSize}
            onChange={(e) => {
              setTileSize(Number(e.target.value) as TileSize)
            }}
          >
            {SUPPORTED_TILE_SIZES.map((size) => (
              <MenuItem key={size} value={size}>
                {size} × {size}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={create}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  )
}

const TilesetPalette = () => {
  const dispatch = useAppDispatch()
  const { session } = useServices()
  const map = useAppSelector(selectCurrentMap)
  const selected = useAppSelector((state) => state.editorUi.selectedTile)
  const version = useAppSelector((state) => state.assets.versions[map?.tileset ?? ''] ?? 0)
  const url = useAssetUrl(session.assets, map?.tileset ?? '', version)
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  if (!map) return null

  const scale = 2
  const size = map.tileSize
  const columns = natural ? Math.max(1, Math.floor(natural.width / size)) : 1

  return (
    <Box sx={{ overflow: 'auto', maxHeight: 260, px: 1 }}>
      {url ? (
        <Box
          sx={{
            position: 'relative',
            width: (natural?.width ?? 0) * scale,
            lineHeight: 0,
            cursor: 'pointer',
          }}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            const column = Math.floor((event.clientX - rect.left) / (size * scale))
            const row = Math.floor((event.clientY - rect.top) / (size * scale))
            dispatch(editorUiSlice.actions.tileSelected(row * columns + column + 1))
          }}
        >
          <img
            src={url}
            alt={`Tileset ${map.tileset}`}
            style={{ imageRendering: 'pixelated', width: (natural?.width ?? 0) * scale }}
            onLoad={(event) => {
              setNatural({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }}
          />
          {natural ? (
            <Box
              data-testid="selected-tile"
              sx={{
                position: 'absolute',
                left: ((selected - 1) % columns) * size * scale,
                top: Math.floor((selected - 1) / columns) * size * scale,
                width: size * scale,
                height: size * scale,
                border: '2px solid #ffeb3b',
                boxSizing: 'border-box',
                pointerEvents: 'none',
              }}
            />
          ) : null}
        </Box>
      ) : (
        <Typography variant="caption" color="warning.main">
          {map.tileset} is not in the project.
        </Typography>
      )}
    </Box>
  )
}

/** Maps, layers and the tileset: everything you pick from while painting. */
export const MapToolPanel = () => {
  const dispatch = useAppDispatch()
  const maps = useAppSelector((state) => state.project.data.maps)
  const startMapId = useAppSelector((state) => state.project.data.meta.startMapId)
  const current = useAppSelector(selectCurrentMap)
  const selectedLayer = useAppSelector((state) => state.editorUi.selectedLayer)
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <Box sx={{ overflow: 'auto', height: '100%', py: 1 }}>
      <Section
        title="Maps"
        action={
          <Tooltip title="New map">
            <IconButton
              size="small"
              aria-label="New map"
              onClick={() => {
                setDialogOpen(true)
              }}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        }
      >
        <List dense disablePadding>
          {maps.map((map) => (
            <ListItem
              key={map.id}
              disablePadding
              secondaryAction={
                <Tooltip title={map.id === startMapId ? 'The game starts here' : 'Delete map'}>
                  <span>
                    <IconButton
                      edge="end"
                      size="small"
                      aria-label={`Delete ${map.name}`}
                      disabled={map.id === startMapId}
                      onClick={() => dispatch(projectActions.deleteMap({ mapId: map.id }))}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              }
            >
              <ListItemButton
                selected={map.id === current?.id}
                onClick={() => dispatch(editorUiSlice.actions.mapSelected(map.id))}
              >
                <ListItemText
                  primary={`${map.id}. ${map.name}`}
                  secondary={`${map.width}×${map.height}${map.id === startMapId ? ' · start' : ''}`}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Section>

      {current ? (
        <Section
          title="Layers"
          action={
            <Tooltip title="Add layer">
              <IconButton
                size="small"
                aria-label="Add layer"
                onClick={() =>
                  dispatch(
                    projectActions.addLayer({
                      mapId: current.id,
                      name: `Layer ${current.layers.length + 1}`,
                    }),
                  )
                }
              >
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          }
        >
          <List dense disablePadding>
            {current.layers
              .map((layer, index) => ({ layer, index }))
              .toReversed()
              .map(({ layer, index }) => (
                <ListItemButton
                  key={index}
                  selected={index === selectedLayer}
                  onClick={() => dispatch(editorUiSlice.actions.layerSelected(index))}
                >
                  <Tooltip title={layer.visible ? 'Hide layer' : 'Show layer'}>
                    <IconButton
                      size="small"
                      aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        dispatch(
                          projectActions.setLayerProps({
                            mapId: current.id,
                            layer: index,
                            visible: !layer.visible,
                          }),
                        )
                      }}
                    >
                      {layer.visible ? (
                        <Visibility fontSize="small" />
                      ) : (
                        <VisibilityOff fontSize="small" />
                      )}
                    </IconButton>
                  </Tooltip>
                  <ListItemText
                    primary={layer.name}
                    secondary={layer.above ? 'drawn above characters' : undefined}
                  />
                  <Tooltip title={layer.above ? 'Drawn above characters' : 'Draw above characters'}>
                    <IconButton
                      size="small"
                      aria-label={`Toggle ${layer.name} above characters`}
                      color={layer.above ? 'primary' : 'default'}
                      onClick={(event) => {
                        event.stopPropagation()
                        dispatch(
                          projectActions.setLayerProps({
                            mapId: current.id,
                            layer: index,
                            above: !layer.above,
                          }),
                        )
                      }}
                    >
                      <VerticalAlignTop fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete layer">
                    <span>
                      <IconButton
                        size="small"
                        aria-label={`Delete ${layer.name}`}
                        disabled={current.layers.length === 1}
                        onClick={(event) => {
                          event.stopPropagation()
                          dispatch(projectActions.removeLayer({ mapId: current.id, layer: index }))
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </ListItemButton>
              ))}
          </List>
        </Section>
      ) : null}

      <Section title="Tileset">
        <TilesetPalette />
      </Section>
      <NewMapDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false)
        }}
      />
    </Box>
  )
}
