import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
} from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import FileDownloadIcon from '@mui/icons-material/FileDownload';

export interface MenuBarProps {
  readonly title: string;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onExport: () => void;
  readonly onSelectTab: (tab: 'map' | 'database' | 'piskel') => void;
  readonly activeTab: 'map' | 'database' | 'piskel';
}

export const MenuBar: React.FC<MenuBarProps> = ({
  title,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onExport,
  onSelectTab,
  activeTab,
}) => {
  return (
    <AppBar position="static" color="default" elevation={1}>
      <Toolbar variant="dense" sx={{ gap: 2 }}>
        <Typography variant="h6" component="div" sx={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
          RPG Studio
        </Typography>

        <Typography variant="body2" sx={{ color: 'text.secondary', mr: 2 }}>
          {title}
        </Typography>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant={activeTab === 'map' ? 'contained' : 'text'}
            onClick={() => onSelectTab('map')}
          >
            Map Editor
          </Button>
          <Button
            size="small"
            variant={activeTab === 'database' ? 'contained' : 'text'}
            onClick={() => onSelectTab('database')}
          >
            Database
          </Button>
          <Button
            size="small"
            variant={activeTab === 'piskel' ? 'contained' : 'text'}
            onClick={() => onSelectTab('piskel')}
          >
            Pixel Art
          </Button>
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            startIcon={<UndoIcon />}
            onClick={onUndo}
            disabled={!canUndo}
          >
            Undo
          </Button>
          <Button
            size="small"
            startIcon={<RedoIcon />}
            onClick={onRedo}
            disabled={!canRedo}
          >
            Redo
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<FileDownloadIcon />}
            onClick={onExport}
          >
            Export Web (.zip)
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
};
