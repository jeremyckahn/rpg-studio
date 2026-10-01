import {
  TilemapSchema,
  SaveStateSchema,
  type Tilemap,
  type SaveState,
  type Direction,
  type Actor,
  coordsToIndex,
} from '@rpgstudio/core';
import {
  createGameWorld,
  type GameWorld,
} from '../ecs/world.js';
import type { GameEntity } from '../ecs/components.js';
import {
  createMovementSystem,
  requestEntityMove,
} from '../ecs/systems/movement.js';
import {
  createEventSystem,
  type EventSystemState,
} from '../ecs/systems/event.js';

export interface HeadlessEngineOptions {
  tileSize?: number;
}

export class HeadlessEngine {
  public readonly world: GameWorld;
  public readonly switches: Map<string, boolean>;
  public readonly variables: Map<string, number>;
  public currentMap: Tilemap | null = null;
  public playerEntity: GameEntity | null = null;
  public actors: Actor[] = [];
  public inventory: { itemId: string | number; count: number }[] = [];
  public gold: number = 0;
  public playTime: number = 0;

  private readonly movementSystem: (dt: number) => void;
  private readonly eventSystem: () => void;
  private readonly isPassableMap: (x: number, y: number) => boolean;

  public dialogueLog: string[] = [];
  public seLog: string[] = [];
  public bgmLog: string[] = [];

  constructor(options: HeadlessEngineOptions = {}) {
    const tileSize = options.tileSize ?? 32;
    this.world = createGameWorld();
    this.switches = new Map();
    this.variables = new Map();

    this.isPassableMap = (x: number, y: number) => {
      if (!this.currentMap) return true;
      if (x < 0 || x >= this.currentMap.width || y < 0 || y >= this.currentMap.height) {
        return false;
      }
      if (this.currentMap.collision.length > 0) {
        const idx = coordsToIndex(x, y, this.currentMap.width);
        const flag = this.currentMap.collision[idx];
        if (flag !== undefined && flag > 0) {
          return false; // Solid tile
        }
      }
      return true;
    };

    const eventState: EventSystemState = {
      switches: this.switches,
      variables: this.variables,
      onShowText: (text) => {
        this.dialogueLog.push(text);
      },
      onTransferPlayer: (_mapId, x, y, direction) => {
        if (this.playerEntity && this.playerEntity.position) {
          this.playerEntity.position.x = x;
          this.playerEntity.position.y = y;
          this.playerEntity.position.pixelX = x * tileSize;
          this.playerEntity.position.pixelY = y * tileSize;
          if (this.playerEntity.movement) {
            this.playerEntity.movement.targetX = x;
            this.playerEntity.movement.targetY = y;
            this.playerEntity.movement.moving = false;
            if (direction) {
              this.playerEntity.movement.direction = direction;
            }
          }
        }
      },
      onPlaySE: (name) => {
        this.seLog.push(name);
      },
      onPlayBGM: (name) => {
        this.bgmLog.push(name);
      },
    };

    this.movementSystem = createMovementSystem(this.world, {
      tileSize,
      isPassable: this.isPassableMap,
    });
    this.eventSystem = createEventSystem(this.world, eventState);
  }

  public loadMap(mapData: unknown): void {
    const parseResult = TilemapSchema.safeParse(mapData);
    if (!parseResult.success) {
      throw new Error(`Failed to load invalid map schema: ${parseResult.error.message}`);
    }

    this.currentMap = parseResult.data;

    // Clear existing event entities from world
    const existingEvents = Array.from(this.world.with('eventTrigger'));
    for (const ent of existingEvents) {
      this.world.remove(ent);
    }

    // Populate events from map
    for (const ev of this.currentMap.events) {
      const activePage = ev.pages[0];
      if (!activePage) continue;

      this.world.add({
        id: `event-${ev.id}`,
        position: {
          x: ev.x,
          y: ev.y,
          pixelX: ev.x * (this.currentMap.tileSize ?? 32),
          pixelY: ev.y * (this.currentMap.tileSize ?? 32),
        },
        collision: {
          solid: true,
          collisionGroup: 'event',
        },
        eventTrigger: {
          eventId: ev.id,
          trigger: activePage.trigger,
          pages: ev.pages,
          activePageIndex: 0,
          commandQueue: activePage.list,
          commandIndex: 0,
          waitFrames: 0,
          active: activePage.trigger === 'autorun',
        },
      });
    }
  }

  public spawnPlayer(actorId: string | number, x: number, y: number, direction: Direction = 'down'): GameEntity {
    const tileSize = this.currentMap?.tileSize ?? 32;

    if (this.playerEntity) {
      this.world.remove(this.playerEntity);
    }

    const player: GameEntity = {
      id: 'player',
      playerTag: { actorId },
      position: {
        x,
        y,
        pixelX: x * tileSize,
        pixelY: y * tileSize,
      },
      movement: {
        targetX: x,
        targetY: y,
        speed: 4,
        moving: false,
        direction,
      },
      collision: {
        solid: true,
        collisionGroup: 'player',
      },
    };

    this.world.add(player);
    this.playerEntity = player;
    return player;
  }

  public movePlayer(dx: number, dy: number): boolean {
    if (!this.playerEntity || !this.playerEntity.position) {
      return false;
    }
    const targetX = this.playerEntity.position.x + dx;
    const targetY = this.playerEntity.position.y + dy;

    return requestEntityMove(this.playerEntity, targetX, targetY, this.isPassableMap);
  }

  public interact(): boolean {
    if (!this.playerEntity || !this.playerEntity.position || !this.playerEntity.movement) {
      return false;
    }

    const { x, y } = this.playerEntity.position;
    const dir: Direction = this.playerEntity.movement.direction ?? 'down';

    const deltaMap: Record<Direction, { readonly dx: number; readonly dy: number }> = {
      up: { dx: 0, dy: -1 },
      down: { dx: 0, dy: 1 },
      left: { dx: -1, dy: 0 },
      right: { dx: 1, dy: 0 },
    };
    const delta = deltaMap[dir];
    const targetX = x + delta.dx;
    const targetY = y + delta.dy;

    const eventEntities = this.world.with('eventTrigger', 'position');
    for (const ent of eventEntities) {
      if (ent.position.x === targetX && ent.position.y === targetY) {
        if (ent.eventTrigger.trigger === 'action_button') {
          ent.eventTrigger.active = true;
          ent.eventTrigger.commandIndex = 0;
          return true;
        }
      }
    }

    return false;
  }

  public step(deltaTime = 16.666): void {
    this.movementSystem(deltaTime);
    this.eventSystem();
    this.playTime += Math.round(deltaTime / 1000);
  }

  public simulateTicks(count: number, deltaTime = 16.666): void {
    for (let i = 0; i < count; i++) {
      this.step(deltaTime);
    }
  }

  public createSaveState(): SaveState {
    if (!this.playerEntity?.position || !this.playerEntity.playerTag || !this.playerEntity.movement) {
      throw new Error('Cannot create save state: player entity is not initialized');
    }

    const switchesObj: Record<string, boolean> = {};
    for (const [k, v] of this.switches.entries()) {
      switchesObj[k] = v;
    }

    const varsObj: Record<string, number> = {};
    for (const [k, v] of this.variables.entries()) {
      varsObj[k] = v;
    }

    const saveObj = {
      version: '1.0.0',
      timestamp: Date.now(),
      playTime: this.playTime,
      mapId: this.currentMap?.id ?? 1,
      player: {
        x: this.playerEntity.position.x,
        y: this.playerEntity.position.y,
        direction: this.playerEntity.movement.direction,
        actorId: this.playerEntity.playerTag.actorId,
      },
      actors: this.actors,
      switches: switchesObj,
      variables: varsObj,
      selfSwitches: {},
      inventory: this.inventory,
      gold: this.gold,
    };

    const parseResult = SaveStateSchema.safeParse(saveObj);
    if (!parseResult.success) {
      throw new Error(`Generated invalid save state: ${parseResult.error.message}`);
    }
    return parseResult.data;
  }

  public loadSaveState(saveData: unknown): void {
    const parseResult = SaveStateSchema.safeParse(saveData);
    if (!parseResult.success) {
      throw new Error(`Failed to load invalid save state: ${parseResult.error.message}`);
    }

    const data = parseResult.data;
    this.playTime = data.playTime;
    this.actors = [...data.actors];
    this.inventory = [...data.inventory];
    this.gold = data.gold;

    this.switches.clear();
    for (const [k, v] of Object.entries(data.switches)) {
      this.switches.set(k, Boolean(v));
    }

    this.variables.clear();
    for (const [k, v] of Object.entries(data.variables)) {
      this.variables.set(k, Number(v));
    }

    this.spawnPlayer(data.player.actorId, data.player.x, data.player.y, data.player.direction);
  }
}
