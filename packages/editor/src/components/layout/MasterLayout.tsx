import React from 'react';
import { Box } from '@mui/material';
import { MenuBar } from './MenuBar.js';
import { AssetBrowser } from './AssetBrowser.js';
import { ToolPanel } from './ToolPanel.js';
import { DatabaseEditor } from '../database/DatabaseEditor.js';
import type { Tilemap, Actor, Item, Skill, Enemy } from '@rpgstudio/core';
import type { MapEditorTool } from '../../store/slices/editorUi.js';

export interface MasterLayoutProps {
  readonly title: string;
  readonly activeTab: 'map' | 'database' | 'piskel';
  readonly onSelectTab: (tab: 'map' | 'database' | 'piskel') => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onExport: () => void;

  readonly maps: Readonly<Record<string, Tilemap>>;
  readonly activeMapId: string | number | null;
  readonly onSelectMap: (id: string | number) => void;

  readonly selectedTool: MapEditorTool;
  readonly onSelectTool: (tool: MapEditorTool) => void;
  readonly selectedLayerIndex: number;
  readonly onSelectLayer: (layerIdx: number) => void;
  readonly selectedTileId: number;
  readonly onSelectTileId: (tileId: number) => void;

  readonly actors: readonly Actor[];
  readonly items: readonly Item[];
  readonly skills: readonly Skill[];
  readonly enemies: readonly Enemy[];
  readonly onUpsertActor: (actor: Actor) => void;
  readonly onDeleteActor: (id: string | number) => void;
  readonly onUpsertItem: (item: Item) => void;
  readonly onDeleteItem: (id: string | number) => void;

  readonly children?: React.ReactNode;
}

export const MasterLayout: React.FC<MasterLayoutProps> = (props) => {
  const currentMap = props.activeMapId ? props.maps[String(props.activeMapId)] : null;
  const layers = currentMap ? currentMap.layers : [{ name: 'Default Layer' }];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <MenuBar
        title={props.title}
        activeTab={props.activeTab}
        onSelectTab={props.onSelectTab}
        canUndo={props.canUndo}
        canRedo={props.canRedo}
        onUndo={props.onUndo}
        onRedo={props.onRedo}
        onExport={props.onExport}
      />

      <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
        <AssetBrowser
          maps={props.maps}
          activeMapId={props.activeMapId}
          onSelectMap={props.onSelectMap}
        />

        <Box sx={{ flexGrow: 1, height: '100%', overflow: 'hidden', bgcolor: '#1e1e1e', position: 'relative' }}>
          {props.activeTab === 'database' ? (
            <DatabaseEditor
              actors={props.actors}
              items={props.items}
              skills={props.skills}
              enemies={props.enemies}
              onUpsertActor={props.onUpsertActor}
              onDeleteActor={props.onDeleteActor}
              onUpsertItem={props.onUpsertItem}
              onDeleteItem={props.onDeleteItem}
            />
          ) : (
            props.children
          )}
        </Box>

        {props.activeTab === 'map' && (
          <ToolPanel
            selectedTool={props.selectedTool}
            onSelectTool={props.onSelectTool}
            layers={layers}
            selectedLayerIndex={props.selectedLayerIndex}
            onSelectLayer={props.onSelectLayer}
            selectedTileId={props.selectedTileId}
            onSelectTileId={props.onSelectTileId}
          />
        )}
      </Box>
    </Box>
  );
};
