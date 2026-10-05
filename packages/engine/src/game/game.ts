import {
  type Direction,
  type Project,
  type Result,
  type SaveState,
  SAVE_STATE_VERSION,
  SaveStateSchema,
  type Tilemap,
  createEventBus,
  createRng,
  fail,
  inBounds,
  ok,
} from '@rpgstudio/core'
import { type World } from 'miniplex'

import { type Entity, createWorld } from '../ecs/entity.ts'
import { eventSystem, movementSystem, refreshPages } from '../ecs/systems/index.ts'
import { createPartyMember } from './party.ts'
import {
  type AudioPort,
  DEFAULT_PLAYER_SPEED,
  type GameEventMap,
  type GameInput,
  type GameState,
  NO_INPUT,
  type Runtime,
} from './types.ts'

export class GameError extends Error {
  override readonly name = 'GameError'
}

export const silentAudio: AudioPort = {
  play: () => undefined,
  stop: () => undefined,
}

export interface GameOptions {
  /** A validated project. Use `ProjectSchema.parse` or `filesToProject` first. */
  readonly project: Project
  readonly seed?: number
  readonly audio?: AudioPort
}

/** Plain-data summary of the simulation, convenient for assertions and logging. */
export interface GameSnapshot {
  readonly tick: number
  readonly mapId: number
  readonly player: {
    readonly x: number
    readonly y: number
    readonly direction: Direction
    readonly moving: boolean
  }
  readonly switches: Readonly<Record<number, boolean>>
  readonly variables: Readonly<Record<number, number>>
  readonly message: string | null
  readonly eventRunning: boolean
}

export interface Game {
  readonly project: Project
  readonly world: World<Entity>
  readonly bus: Runtime['bus']
  /** Read-only view of the simulation for renderers and tools. */
  readonly state: Readonly<GameState>
  /** Advances the simulation by exactly one tick. */
  tick: (input?: GameInput) => void
  /** False while an event is running; saving then would drop the event. */
  canSave: () => boolean
  serialize: () => SaveState
  /** Validates `save` and, only if it is consistent with the project, applies it. */
  restore: (save: unknown) => Result<undefined>
  snapshot: () => GameSnapshot
}

const findMap = (project: Project, mapId: number): Tilemap | undefined =>
  project.maps.find((map) => map.id === mapId)

const toRecord = <T>(entries: readonly (readonly [string, T])[]): Record<number, T> =>
  Object.fromEntries(entries.map(([key, value]) => [Number(key), value]))

export const createGame = (options: GameOptions): Game => {
  const { project, audio = silentAudio } = options
  const startMap = findMap(project, project.meta.startMapId)
  if (!startMap) throw new GameError(`Start map ${project.meta.startMapId} does not exist`)

  const world = createWorld()
  const bus = createEventBus<GameEventMap>()
  const startActor = project.database.actors.find(
    (actor) => actor.id === project.meta.startParty[0],
  )

  const player: Entity = {
    kind: 'player',
    position: { x: project.meta.startX, y: project.meta.startY },
    movement: {
      direction: project.meta.startDirection,
      speed: DEFAULT_PLAYER_SPEED,
      intent: null,
      target: null,
      progress: 0,
    },
    collision: { solid: true },
    ...(startActor?.sprite ? { sprite: { ...startActor.sprite, frame: 0 } } : {}),
  }
  world.add(player)

  const state: GameState = {
    tick: 0,
    map: startMap,
    switches: {},
    variables: {},
    inventory: {},
    gold: project.meta.startGold,
    party: project.meta.startParty.map((actorId) => createPartyMember(project, actorId)),
    rng: createRng(options.seed ?? 1),
    message: null,
    foreground: null,
    background: new Map(),
    steps: [],
    pagesDirty: true,
    currentBgm: null,
    currentBgs: null,
    player,
  }

  const loadMap = (mapId: number, x: number, y: number, direction: Direction | undefined): void => {
    const map = findMap(project, mapId)
    if (!map) throw new GameError(`Cannot transfer to map ${mapId}: it does not exist`)
    if (!inBounds(map, { x, y })) {
      throw new GameError(`Cannot transfer to (${x}, ${y}) on map ${mapId}: outside the map`)
    }

    state.map = map
    for (const entity of [...world.entities]) {
      if (entity !== player) world.remove(entity)
    }
    state.background.clear()
    state.steps = []

    map.events.forEach((event) => {
      world.add({
        kind: 'event',
        eventId: event.id,
        position: { x: event.x, y: event.y },
        movement: {
          direction: 'down',
          speed: DEFAULT_PLAYER_SPEED,
          intent: null,
          target: null,
          progress: 0,
        },
        activePage: -2,
      })
    })

    if (player.movement && player.position) {
      player.position = { x, y }
      player.movement.target = null
      player.movement.progress = 0
      player.movement.intent = null
      if (direction) player.movement.direction = direction
    }

    if (map.bgm && map.bgm.name !== state.currentBgm) {
      state.currentBgm = map.bgm.name
      audio.play('bgm', map.bgm)
    }
    if (map.bgs && map.bgs.name !== state.currentBgs) {
      state.currentBgs = map.bgs.name
      audio.play('bgs', map.bgs)
    }

    state.pagesDirty = true
    refreshPages(runtime)
    state.pagesDirty = false
    bus.emit('mapLoaded', { mapId })
  }

  const runtime: Runtime = { project, world, state, bus, audio, transferPlayer: loadMap }
  loadMap(startMap.id, project.meta.startX, project.meta.startY, project.meta.startDirection)

  const tick = (input: GameInput = NO_INPUT): void => {
    // Input: held directions steer the player unless an event has taken control.
    if (player.movement && !state.foreground) player.movement.intent = input.direction
    movementSystem(runtime, input)
    eventSystem(runtime, input)
    state.tick += 1
  }

  const canSave = (): boolean => state.foreground === null

  const serialize = (): SaveState => {
    if (!canSave()) throw new GameError('Cannot save while an event is running')
    const where = player.movement?.target ?? player.position
    if (!where || !player.movement) throw new GameError('Player has no position')
    const save: SaveState = {
      version: SAVE_STATE_VERSION,
      projectName: project.meta.name,
      tick: state.tick,
      rngState: state.rng.getState(),
      mapId: state.map.id,
      player: { x: where.x, y: where.y, direction: player.movement.direction },
      entities: [...world.with('eventId', 'position', 'movement')].map((entity) => ({
        eventId: entity.eventId,
        x: entity.position.x,
        y: entity.position.y,
        direction: entity.movement.direction,
      })),
      party: state.party.map((member) => ({ ...member })),
      switches: Object.fromEntries(Object.entries(state.switches)),
      variables: Object.fromEntries(Object.entries(state.variables)),
      inventory: Object.fromEntries(Object.entries(state.inventory)),
      gold: state.gold,
    }
    return SaveStateSchema.parse(save)
  }

  const restore = (input: unknown): Result<undefined> => {
    const parsed = SaveStateSchema.safeParse(input)
    if (!parsed.success) return fail(`Invalid save: ${parsed.error.message}`)
    const save = parsed.data

    const map = findMap(project, save.mapId)
    if (!map) return fail(`Save refers to map ${save.mapId}, which does not exist`)
    if (!inBounds(map, save.player)) return fail('Saved player position is outside the map')
    const missingActor = save.party.find(
      (member) => !project.database.actors.some((actor) => actor.id === member.actorId),
    )
    if (missingActor) return fail(`Save refers to missing actor ${missingActor.actorId}`)
    const badEntity = save.entities.find(
      (entity) =>
        !map.events.some((event) => event.id === entity.eventId) || !inBounds(map, entity),
    )
    if (badEntity) return fail(`Saved event ${badEntity.eventId} does not fit map ${map.id}`)

    // Everything checks out: apply.
    state.foreground = null
    state.message = null
    loadMap(save.mapId, save.player.x, save.player.y, save.player.direction)
    for (const entity of world.with('eventId', 'position', 'movement')) {
      const saved = save.entities.find((candidate) => candidate.eventId === entity.eventId)
      if (!saved) continue
      entity.position = { x: saved.x, y: saved.y }
      entity.movement.direction = saved.direction
    }
    state.tick = save.tick
    state.rng = createRng(save.rngState)
    state.party = save.party.map((member) => ({ ...member }))
    state.switches = toRecord(Object.entries(save.switches))
    state.variables = toRecord(Object.entries(save.variables))
    state.inventory = toRecord(Object.entries(save.inventory))
    state.gold = save.gold
    state.pagesDirty = true
    refreshPages(runtime)
    state.pagesDirty = false
    bus.emit('loaded')
    return ok(undefined)
  }

  const snapshot = (): GameSnapshot => ({
    tick: state.tick,
    mapId: state.map.id,
    player: {
      x: player.position?.x ?? 0,
      y: player.position?.y ?? 0,
      direction: player.movement?.direction ?? 'down',
      moving: player.movement?.target != null,
    },
    switches: { ...state.switches },
    variables: { ...state.variables },
    message: state.message?.text ?? null,
    eventRunning: state.foreground !== null,
  })

  return { project, world, bus, state, tick, canSave, serialize, restore, snapshot }
}
