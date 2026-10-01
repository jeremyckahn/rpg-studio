import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import MapIcon from '@mui/icons-material/Map';
import PersonIcon from '@mui/icons-material/Person';
import GridOnIcon from '@mui/icons-material/GridOn';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';
import type { Tilemap } from '@rpgstudio/core';

export interface AssetBrowserProps {
  readonly maps: Readonly<Record<string, Tilemap>>;
  readonly activeMapId: string | number | null;
  readonly onSelectMap: (mapId: string | number) => void;
  readonly onSelectAsset?: (type: string, name: string) => void;
}

export const AssetBrowser: React.FC<AssetBrowserProps> = ({
  maps,
  activeMapId,
  onSelectMap,
}) => {
  const mapList = Object.values(maps);

  return (
    <Box sx={{ width: 240, borderRight: 1, borderColor: 'divider', bgcolor: 'background.paper', height: '100%', overflowY: 'auto' }}>
      <Box sx={{ p: 1.5, pb: 0.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.75rem' }}>
          Maps (/maps)
        </Typography>
      </Box>

      <List dense>
        {mapList.length === 0 ? (
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="caption" color="text.secondary">
              No maps loaded
            </Typography>
          </Box>
        ) : (
          mapList.map((m) => (
            <ListItemButton
              key={String(m.id)}
              selected={String(m.id) === String(activeMapId)}
              onClick={() => onSelectMap(m.id)}
            >
              <ListItemIcon sx={{ minWidth: 28 }}>
                <MapIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={m.name} secondary={`${m.width}x${m.height}`} />
            </ListItemButton>
          ))
        )}
      </List>

      <Divider sx={{ my: 1 }} />

      <Box sx={{ p: 1.5, pb: 0.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.75rem' }}>
          Assets (/img & /audio)
        </Typography>
      </Box>

      <List dense>
        <ListItemButton>
          <ListItemIcon sx={{ minWidth: 28 }}>
            <PersonIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Characters" secondary="Actor1.png, NPC1.png" />
        </ListItemButton>
        <ListItemButton>
          <ListItemIcon sx={{ minWidth: 28 }}>
            <GridOnIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Tilesets" secondary="Overworld.png" />
        </ListItemButton>
        <ListItemButton>
          <ListItemIcon sx={{ minWidth: 28 }}>
            <AudiotrackIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Audio" secondary="BGM, SE" />
        </ListItemButton>
      </List>
    </Box>
  );
};
