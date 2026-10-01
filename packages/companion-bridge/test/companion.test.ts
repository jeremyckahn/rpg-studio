import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { CompanionServer } from '../src/index.js';
import {
  createEditorStore,
  EditorCompanionBridge,
  setMap,
  setActiveMapId,
} from '@rpgstudio/editor';

describe('Companion Bridge & AI Automation E2E Integration', () => {
  const TEST_PORT = 8999;
  let server: CompanionServer;
  let editorBridge: EditorCompanionBridge;
  let editorStore: ReturnType<typeof createEditorStore>;

  beforeAll(async () => {
    // 1. Initialize Redux store in the editor
    editorStore = createEditorStore();

    // Setup active map in editor store
    editorStore.dispatch(
      setMap({
        id: 1,
        name: 'AI Generated Dungeon',
        width: 3,
        height: 3,
        tileSize: 32,
        tilesetId: 'dungeon-tiles',
        layers: [
          {
            id: 'ground',
            name: 'Ground',
            visible: true,
            opacity: 1,
            data: [0, 0, 0, 0, 0, 0, 0, 0, 0],
          },
        ],
        collision: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        events: [],
      })
    );
    editorStore.dispatch(setActiveMapId(1));

    // 2. Launch the companion server
    server = new CompanionServer({ port: TEST_PORT });
    await server.start();

    // 3. Connect Editor outbound bridge to the Companion Server
    editorBridge = new EditorCompanionBridge({
      url: `ws://localhost:${TEST_PORT}`,
      store: editorStore,
      webSocketFactory: (url) => new WebSocket(url) as unknown as globalThis.WebSocket,
    });
    editorBridge.connect();

    // Wait briefly for connection handshake
    await new Promise((resolve) => setTimeout(resolve, 150));
  });

  afterAll(async () => {
    editorBridge.disconnect();
    await server.stop();
  });

  it('verifies bidirectional connection established', () => {
    expect(server.isConnected()).toBe(true);
  });

  it('queries editor project state from companion server', async () => {
    const fullState = (await server.query('GET_FULL_STATE')) as {
      title: string;
      activeMapId: number;
    };
    expect(fullState).toBeDefined();
    expect(fullState.title).toBe('New RPG Project');
    expect(fullState.activeMapId).toBe(1);

    const actors = (await server.query('GET_ACTORS')) as unknown[];
    expect(Array.isArray(actors)).toBe(true);
    expect(actors).toHaveLength(0);
  });

  it('dispatches tile edits and mutates editor store in real-time', async () => {
    // Map initial tile at (1, 1) -> index 1 * 3 + 1 = 4 is 0
    expect(editorStore.getState().project.present.maps['1']?.layers[0]?.data[4]).toBe(0);

    // AI Companion places tile ID 8 at (1, 1)
    server.placeTile(1, 0, 1, 1, 8);

    // Allow event loop to process action dispatch
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(editorStore.getState().project.present.maps['1']?.layers[0]?.data[4]).toBe(8);
  });

  it('generates a new actor validated by Zod and synchronizes into Editor store', async () => {
    const actorPayload = {
      id: 'companion-hero',
      name: 'Kahn the Architect',
      classId: 1,
      level: 1,
      maxLevel: 99,
      exp: 0,
      stats: {
        hp: 150,
        maxHp: 150,
        mp: 30,
        maxMp: 30,
        attack: 20,
        defense: 15,
        mAttack: 12,
        mDefense: 10,
        agility: 14,
        luck: 12,
      },
      equips: {},
      sprite: {
        characterSheet: 'Actor1.png',
        characterIndex: 0,
      },
      profile: 'Engineered by AI companion runner.',
    };

    const createdActor = server.generateActor(actorPayload);
    expect(createdActor.name).toBe('Kahn the Architect');

    // Wait for dispatch
    await new Promise((resolve) => setTimeout(resolve, 50));

    const actors = editorStore.getState().project.present.actors;
    expect(actors).toHaveLength(1);
    expect(actors[0]?.name).toBe('Kahn the Architect');
  });

  it('rejects invalid or hallucinated actor data and blocks dispatch', () => {
    const badActor = {
      id: 'bad-actor',
      name: '', // Empty name violates min(1)
    };

    expect(() => server.generateActor(badActor)).toThrow();
  });
});
