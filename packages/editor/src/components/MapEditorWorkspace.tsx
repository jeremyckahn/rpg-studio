import BorderStyle from '@mui/icons-material/BorderStyle'
import Brush from '@mui/icons-material/Brush'
import FormatColorFill from '@mui/icons-material/FormatColorFill'
import GridOn from '@mui/icons-material/GridOn'
import Layers from '@mui/icons-material/Layers'
import Block from '@mui/icons-material/Block'
import ZoomIn from '@mui/icons-material/ZoomIn'
import ZoomOut from '@mui/icons-material/ZoomOut'
import AutoFixNormal from '@mui/icons-material/AutoFixNormal'
import {
  Box,
  Divider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'

import { selectCurrentMap } from '../store/index.ts'
import { type MapTool, ZOOM_LEVELS, editorUiSlice } from '../store/slices/editorUi.ts'
import { MapCanvas } from './MapCanvas.tsx'
import { useAppDispatch, useAppSelector } from './services.tsx'

const TOOLS: readonly { tool: MapTool; label: string; icon: React.ReactNode }[] = [
  { tool: 'pencil', label: 'Pencil (paint tiles)', icon: <Brush fontSize="small" /> },
  {
    tool: 'fill',
    label: 'Fill (flood fill the region)',
    icon: <FormatColorFill fontSize="small" />,
  },
  { tool: 'eraser', label: 'Eraser', icon: <AutoFixNormal fontSize="small" /> },
  { tool: 'collision', label: 'Collision (toggle solid cells)', icon: <Block fontSize="small" /> },
]

/** The map editor's main view: a toolbar above the PixiJS canvas. */
export const MapEditorWorkspace = () => {
  const dispatch = useAppDispatch()
  const map = useAppSelector(selectCurrentMap)
  const ui = useAppSelector((state) => state.editorUi)
  const zoom = ZOOM_LEVELS[ui.zoomIndex] ?? 1
  const layer = map?.layers[Math.min(ui.selectedLayer, (map?.layers.length ?? 1) - 1)]

  const overlays = [
    ui.showGrid ? 'grid' : null,
    ui.showCollision ? 'collision' : null,
    ui.dimInactiveLayers ? 'dim' : null,
  ].filter((value): value is string => value !== null)

  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          p: 0.5,
          alignItems: 'center',
          borderBottom: 1,
          borderColor: 'divider',
          flexWrap: 'wrap',
        }}
      >
        <ToggleButtonGroup
          size="small"
          exclusive
          value={ui.tool}
          onChange={(_event, next: MapTool | null) => {
            if (next) dispatch(editorUiSlice.actions.toolSelected(next))
          }}
          aria-label="Map tool"
        >
          {TOOLS.map(({ tool, label, icon }) => (
            <ToggleButton key={tool} value={tool} aria-label={label}>
              <Tooltip title={label}>
                <span style={{ display: 'flex' }}>{icon}</span>
              </Tooltip>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Divider orientation="vertical" flexItem />
        <ToggleButtonGroup
          size="small"
          value={overlays}
          aria-label="Overlays"
          onChange={(_event, next: string[]) => {
            const toggled = [
              ...next.filter((v) => !overlays.includes(v)),
              ...overlays.filter((v) => !next.includes(v)),
            ]
            toggled.forEach((name) => {
              if (name === 'grid') dispatch(editorUiSlice.actions.gridToggled())
              if (name === 'collision') dispatch(editorUiSlice.actions.collisionOverlayToggled())
              if (name === 'dim') dispatch(editorUiSlice.actions.dimInactiveLayersToggled())
            })
          }}
        >
          <ToggleButton value="grid" aria-label="Show grid">
            <Tooltip title="Grid">
              <GridOn fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="collision" aria-label="Show collision">
            <Tooltip title="Collision overlay">
              <BorderStyle fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="dim" aria-label="Dim other layers">
            <Tooltip title="Dim inactive layers">
              <Layers fontSize="small" />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
        <Divider orientation="vertical" flexItem />
        <Tooltip title="Zoom out">
          <span>
            <ToggleButton
              size="small"
              value="out"
              aria-label="Zoom out"
              disabled={ui.zoomIndex === 0}
              selected={false}
              onClick={() => dispatch(editorUiSlice.actions.zoomStepped(-1))}
            >
              <ZoomOut fontSize="small" />
            </ToggleButton>
          </span>
        </Tooltip>
        <Typography
          variant="body2"
          sx={{ minWidth: 36, textAlign: 'center' }}
          aria-label="Zoom level"
        >
          {zoom * 100}%
        </Typography>
        <Tooltip title="Zoom in">
          <span>
            <ToggleButton
              size="small"
              value="in"
              aria-label="Zoom in"
              disabled={ui.zoomIndex === ZOOM_LEVELS.length - 1}
              selected={false}
              onClick={() => dispatch(editorUiSlice.actions.zoomStepped(1))}
            >
              <ZoomIn fontSize="small" />
            </ToggleButton>
          </span>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">
          {map ? `${map.name} · layer “${layer?.name ?? ''}” · tile ${ui.selectedTile}` : 'No map'}
        </Typography>
      </Stack>
      <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <MapCanvas />
      </Box>
    </Stack>
  )
}
