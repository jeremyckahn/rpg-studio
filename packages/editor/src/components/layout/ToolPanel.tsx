import React from 'react';
import {
  Box,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import FormatColorFillIcon from '@mui/icons-material/FormatColorFill';
import AutoFixNormalIcon from '@mui/icons-material/AutoFixNormal';
import type { MapEditorTool } from '../../store/slices/editorUi.js';

export interface ToolPanelProps {
  readonly selectedTool: MapEditorTool;
  readonly onSelectTool: (tool: MapEditorTool) => void;
  readonly layers: readonly { readonly name: string }[];
  readonly selectedLayerIndex: number;
  readonly onSelectLayer: (layerIdx: number) => void;
  readonly selectedTileId: number;
  readonly onSelectTileId: (tileId: number) => void;
}

export const ToolPanel: React.FC<ToolPanelProps> = ({
  selectedTool,
  onSelectTool,
  layers,
  selectedLayerIndex,
  onSelectLayer,
  selectedTileId,
  onSelectTileId,
}) => {
  return (
    <Box sx={{ width: 220, borderLeft: 1, borderColor: 'divider', bgcolor: 'background.paper', p: 1.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, textTransform: 'uppercase', fontSize: '0.75rem' }}>
          Tools
        </Typography>
        <ToggleButtonGroup
          value={selectedTool}
          exclusive
          size="small"
          onChange={(_, val) => {
            if (val) onSelectTool(val);
          }}
          fullWidth
        >
          <ToggleButton value="pencil" aria-label="pencil">
            <EditIcon fontSize="small" sx={{ mr: 0.5 }} />
            Pencil
          </ToggleButton>
          <ToggleButton value="fill" aria-label="fill">
            <FormatColorFillIcon fontSize="small" sx={{ mr: 0.5 }} />
            Fill
          </ToggleButton>
          <ToggleButton value="eraser" aria-label="eraser">
            <AutoFixNormalIcon fontSize="small" sx={{ mr: 0.5 }} />
            Eraser
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Divider />

      <Box>
        <FormControl fullWidth size="small">
          <InputLabel id="layer-select-label">Active Layer</InputLabel>
          <Select
            labelId="layer-select-label"
            value={selectedLayerIndex}
            label="Active Layer"
            onChange={(e) => onSelectLayer(Number(e.target.value))}
          >
            {layers.map((l, idx) => (
              <MenuItem key={idx} value={idx}>
                {l.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Divider />

      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, textTransform: 'uppercase', fontSize: '0.75rem' }}>
          Palette Tile (ID: {selectedTileId})
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.5 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((id) => (
            <Box
              key={id}
              onClick={() => onSelectTileId(id)}
              sx={{
                width: 40,
                height: 40,
                border: 2,
                borderColor: selectedTileId === id ? 'primary.main' : 'divider',
                bgcolor: id === 1 ? '#4caf50' : id === 2 ? '#2196f3' : id === 3 ? '#ff9800' : '#795548',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                borderRadius: 1,
                fontSize: '0.75rem',
                color: 'white',
                fontWeight: 'bold',
              }}
            >
              #{id}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
};
