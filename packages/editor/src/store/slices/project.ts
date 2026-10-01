import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Actor, Item, Skill, Enemy, Tilemap } from '@rpgstudio/core';

export interface ProjectState {
  title: string;
  actors: Actor[];
  items: Item[];
  skills: Skill[];
  enemies: Enemy[];
  activeMapId: string | number | null;
  maps: Record<string, Tilemap>;
}

export const initialProjectState: ProjectState = {
  title: 'New RPG Project',
  actors: [],
  items: [],
  skills: [],
  enemies: [],
  activeMapId: null,
  maps: {},
};

const projectSlice = createSlice({
  name: 'project',
  initialState: initialProjectState,
  reducers: {
    setProjectTitle: (state, action: PayloadAction<string>): ProjectState => ({
      ...state,
      title: action.payload,
    }),
    setActors: (state, action: PayloadAction<readonly Actor[]>): ProjectState => ({
      ...state,
      actors: [...action.payload],
    }),
    upsertActor: (state, action: PayloadAction<Actor>): ProjectState => {
      const exists = state.actors.some((a) => a.id === action.payload.id);
      const nextActors = exists
        ? state.actors.map((a) => (a.id === action.payload.id ? action.payload : a))
        : [...state.actors, action.payload];
      return {
        ...state,
        actors: nextActors,
      };
    },
    deleteActor: (state, action: PayloadAction<string | number>): ProjectState => ({
      ...state,
      actors: state.actors.filter((a) => a.id !== action.payload),
    }),
    upsertItem: (state, action: PayloadAction<Item>): ProjectState => {
      const exists = state.items.some((i) => i.id === action.payload.id);
      const nextItems = exists
        ? state.items.map((i) => (i.id === action.payload.id ? action.payload : i))
        : [...state.items, action.payload];
      return {
        ...state,
        items: nextItems,
      };
    },
    deleteItem: (state, action: PayloadAction<string | number>): ProjectState => ({
      ...state,
      items: state.items.filter((i) => i.id !== action.payload),
    }),
    upsertSkill: (state, action: PayloadAction<Skill>): ProjectState => {
      const exists = state.skills.some((s) => s.id === action.payload.id);
      const nextSkills = exists
        ? state.skills.map((s) => (s.id === action.payload.id ? action.payload : s))
        : [...state.skills, action.payload];
      return {
        ...state,
        skills: nextSkills,
      };
    },
    upsertEnemy: (state, action: PayloadAction<Enemy>): ProjectState => {
      const exists = state.enemies.some((e) => e.id === action.payload.id);
      const nextEnemies = exists
        ? state.enemies.map((e) => (e.id === action.payload.id ? action.payload : e))
        : [...state.enemies, action.payload];
      return {
        ...state,
        enemies: nextEnemies,
      };
    },
    setActiveMapId: (state, action: PayloadAction<string | number | null>): ProjectState => ({
      ...state,
      activeMapId: action.payload,
    }),
    setMap: (state, action: PayloadAction<Tilemap>): ProjectState => ({
      ...state,
      maps: {
        ...state.maps,
        [String(action.payload.id)]: action.payload,
      },
    }),
    setTile: (
      state,
      action: PayloadAction<{
        mapId: string | number;
        layerIndex: number;
        tileX: number;
        tileY: number;
        tileId: number;
      }>
    ): ProjectState => {
      const { mapId, layerIndex, tileX, tileY, tileId } = action.payload;
      const mapKey = String(mapId);
      const map = state.maps[mapKey];
      if (!map) return state;

      const layer = map.layers[layerIndex];
      if (!layer) return state;

      const index = tileY * map.width + tileX;
      if (index < 0 || index >= layer.data.length) return state;

      const nextData = layer.data.map((t, idx) => (idx === index ? tileId : t));

      const nextLayers = map.layers.map((l, idx) =>
        idx === layerIndex ? { ...l, data: nextData } : l
      );

      const nextMap: Tilemap = {
        ...map,
        layers: nextLayers,
      };

      return {
        ...state,
        maps: {
          ...state.maps,
          [mapKey]: nextMap,
        },
      };
    },
  },
});

export const {
  setProjectTitle,
  setActors,
  upsertActor,
  deleteActor,
  upsertItem,
  deleteItem,
  upsertSkill,
  upsertEnemy,
  setActiveMapId,
  setMap,
  setTile,
} = projectSlice.actions;

export const projectReducer = projectSlice.reducer;
