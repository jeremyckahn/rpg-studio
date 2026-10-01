import React, { useEffect, useMemo, useState } from 'react';
import { Provider, useSelector, useDispatch } from 'react-redux';
import { ThemeProvider, createTheme, CssBaseline, Box } from '@mui/material';
import type { Tilemap, Actor, Item } from '@rpgstudio/core';
import { createEditorStore, type RootState, type DynamicStore } from './store/index.js';
import {
  setActiveTab,
  setSelectedTool,
  setSelectedLayerIndex,
  setSelectedTileId,
} from './store/slices/editorUi.js';
import {
  setActiveMapId,
  setTile,
  upsertActor,
  deleteActor,
  upsertItem,
  deleteItem,
} from './store/slices/project.js';
import { undo, redo } from './store/history.js';
import { MasterLayout } from './components/layout/MasterLayout.js';
import { MapCanvas } from './canvas/MapCanvas.js';
import { PiskelEditorPanel } from './piskel/PiskelEditorPanel.js';
import { exportProjectToZip, triggerZipDownload } from './export/packager.js';
import { registerServiceWorker } from './pwa/index.js';
import { EditorCompanionBridge } from './bridge/companionClient.js';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#1976d2',
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
  },
});

const defaultMapWidth = 20;
const defaultMapHeight = 15;
const defaultTileCount = defaultMapWidth * defaultMapHeight;

const defaultGroundLayer = {
  id: 'layer_ground',
  name: 'Ground',
  visible: true,
  opacity: 1,
  data: Array.from({ length: defaultTileCount }, (_, idx) => {
    const x = idx % defaultMapWidth;
    const y = Math.floor(idx / defaultMapWidth);
    // Draw a decorative path/border pattern
    if (x === 0 || y === 0 || x === defaultMapWidth - 1 || y === defaultMapHeight - 1) {
      return 2; // Stone border
    }
    return 1; // Grass
  }),
};

const initialMap: Tilemap = {
  id: '1',
  name: 'Starting Village',
  width: defaultMapWidth,
  height: defaultMapHeight,
  tileSize: 32,
  tilesetId: 'tileset_overworld',
  layers: [defaultGroundLayer],
  collision: [],
  events: [],
};

const initialHero: Actor = {
  id: 'actor_1',
  name: 'Alex',
  classId: 'class_warrior',
  level: 1,
  maxLevel: 99,
  exp: 0,
  sprite: {
    characterSheet: 'Actor1.png',
    characterIndex: 0,
  },
  equips: {},
  stats: {
    hp: 450,
    maxHp: 450,
    mp: 100,
    maxMp: 100,
    attack: 55,
    defense: 40,
    mAttack: 20,
    mDefense: 30,
    agility: 45,
    luck: 25,
  },
};

const initialPotion: Item = {
  id: 'item_potion',
  name: 'Potion',
  description: 'Restores 100 HP to one ally.',
  itemType: 'consumable',
  price: 50,
  consumable: true,
  iconIndex: 0,
  effects: [
    {
      code: 'recover_hp',
      value1: 100,
    },
  ],
};

const EditorWorkspace: React.FC<{ readonly store: DynamicStore }> = ({ store }) => {
  const dispatch = useDispatch();
  const project = useSelector((state: RootState) => state.project.present);
  const editorUi = useSelector((state: RootState) => state.editorUi);
  const canUndo = useSelector((state: RootState) => state.project.past.length > 0);
  const canRedo = useSelector((state: RootState) => state.project.future.length > 0);
  const [activeSpriteId, setActiveSpriteId] = useState<string>('hero_walk');

  // Background companion bridge connection for AI agent automation
  useEffect(() => {
    const bridge = new EditorCompanionBridge({
      url: 'ws://localhost:8080',
      store,
    });
    bridge.connect();

    return () => {
      bridge.disconnect();
    };
  }, [store]);

  const activeMap = project.activeMapId ? project.maps[String(project.activeMapId)] ?? null : null;

  const handleExport = async () => {
    const zipBytes = await exportProjectToZip({
      title: project.title,
      actors: project.actors,
      items: project.items,
      skills: project.skills,
      enemies: project.enemies,
      maps: project.maps,
    });
    triggerZipDownload(zipBytes, `${project.title.toLowerCase().replace(/\s+/g, '_')}.zip`);
  };

  const handleSetTile = (tileX: number, tileY: number, tileId: number) => {
    if (!project.activeMapId) return;
    dispatch(
      setTile({
        mapId: project.activeMapId,
        layerIndex: editorUi.selectedLayerIndex,
        tileX,
        tileY,
        tileId,
      })
    );
  };

  return (
    <MasterLayout
      title={project.title}
      activeTab={editorUi.activeTab}
      onSelectTab={(tab) => dispatch(setActiveTab(tab))}
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={() => dispatch(undo())}
      onRedo={() => dispatch(redo())}
      onExport={handleExport}
      maps={project.maps}
      activeMapId={project.activeMapId}
      onSelectMap={(id) => dispatch(setActiveMapId(id))}
      selectedTool={editorUi.selectedTool}
      onSelectTool={(tool) => dispatch(setSelectedTool(tool))}
      selectedLayerIndex={editorUi.selectedLayerIndex}
      onSelectLayer={(idx) => dispatch(setSelectedLayerIndex(idx))}
      selectedTileId={editorUi.selectedTileId}
      onSelectTileId={(tileId) => dispatch(setSelectedTileId(tileId))}
      actors={project.actors}
      items={project.items}
      skills={project.skills}
      enemies={project.enemies}
      onUpsertActor={(actor) => dispatch(upsertActor(actor))}
      onDeleteActor={(id) => dispatch(deleteActor(id))}
      onUpsertItem={(item) => dispatch(upsertItem(item))}
      onDeleteItem={(id) => dispatch(deleteItem(id))}
    >
      {editorUi.activeTab === 'map' && (
        <MapCanvas
          map={activeMap}
          selectedLayerIndex={editorUi.selectedLayerIndex}
          selectedTileId={editorUi.selectedTileId}
          selectedTool={editorUi.selectedTool}
          onSetTile={handleSetTile}
        />
      )}
      {editorUi.activeTab === 'piskel' && (
        <PiskelEditorPanel
          activeSpriteId={activeSpriteId}
          onSaveSprite={(spriteId) => setActiveSpriteId(spriteId)}
        />
      )}
    </MasterLayout>
  );
};

export const App: React.FC = () => {
  const store = useMemo(() => {
    return createEditorStore({
      project: {
        past: [],
        present: {
          title: 'RPG Studio Project',
          actors: [initialHero],
          items: [initialPotion],
          skills: [],
          enemies: [],
          activeMapId: '1',
          maps: {
            '1': initialMap,
          },
        },
        future: [],
      },
    });
  }, []);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <Provider store={store}>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <Box sx={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
          <EditorWorkspace store={store} />
        </Box>
      </ThemeProvider>
    </Provider>
  );
};
