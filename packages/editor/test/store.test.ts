import { describe, expect, it } from 'vitest';
import {
  createEditorStore,
  setProjectTitle,
  upsertActor,
  undo,
  redo,
  setActiveTab,
  type RootState,
} from '../src/index.js';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

describe('Editor Redux Store & Command Pattern', () => {
  it('dispatches core actions and updates project state', () => {
    const store = createEditorStore();

    store.dispatch(setProjectTitle('Dragon Quest Remake'));
    expect(store.getState().project.present.title).toBe('Dragon Quest Remake');

    const actor = {
      id: 'alex',
      name: 'Alex',
      classId: 1,
      level: 1,
      maxLevel: 99,
      exp: 0,
      stats: {
        hp: 100,
        maxHp: 100,
        mp: 20,
        maxMp: 20,
        attack: 15,
        defense: 10,
        mAttack: 8,
        mDefense: 8,
        agility: 12,
        luck: 10,
      },
      equips: {},
      sprite: { characterSheet: 'Actor1.png', characterIndex: 0 },
    };

    store.dispatch(upsertActor(actor));
    expect(store.getState().project.present.actors).toHaveLength(1);
    expect(store.getState().project.present.actors[0]?.name).toBe('Alex');

    store.dispatch(setActiveTab('database'));
    expect(store.getState().editorUi.activeTab).toBe('database');
  });

  it('verifies undo and redo stack behavior', () => {
    const store = createEditorStore();

    store.dispatch(setProjectTitle('Step 1'));
    store.dispatch(setProjectTitle('Step 2'));
    store.dispatch(setProjectTitle('Step 3'));

    expect(store.getState().project.present.title).toBe('Step 3');

    // Undo -> Step 2
    store.dispatch(undo());
    expect(store.getState().project.present.title).toBe('Step 2');

    // Undo -> Step 1
    store.dispatch(undo());
    expect(store.getState().project.present.title).toBe('Step 1');

    // Redo -> Step 2
    store.dispatch(redo());
    expect(store.getState().project.present.title).toBe('Step 2');

    // Redo -> Step 3
    store.dispatch(redo());
    expect(store.getState().project.present.title).toBe('Step 3');
  });

  it('enables dynamic slice injection for plugins at runtime', () => {
    const store = createEditorStore();

    // Plugin defines a custom Redux slice
    interface QuestPluginState {
      readonly activeQuestCount: number;
    }

    const questSlice = createSlice({
      name: 'questPlugin',
      initialState: { activeQuestCount: 0 } as QuestPluginState,
      reducers: {
        incrementQuests: (state, action: PayloadAction<number>) => ({
          ...state,
          activeQuestCount: state.activeQuestCount + action.payload,
        }),
      },
    });

    // Inject slice dynamically
    store.injectReducer('questPlugin', questSlice.reducer);

    // Verify injected slice exists and responds to actions
    store.dispatch(questSlice.actions.incrementQuests(5));
    const state = store.getState() as RootState & { questPlugin: QuestPluginState };

    expect(state.questPlugin).toBeDefined();
    expect(state.questPlugin.activeQuestCount).toBe(5);
  });
});
