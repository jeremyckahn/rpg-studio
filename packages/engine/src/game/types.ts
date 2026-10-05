import { type Direction, type EventCommand, type Project, type Tilemap } from '@rpgstudio/core'
import { type Rng } from '@rpgstudio/core'
import { type World } from 'miniplex'

import { type Entity } from '../ecs/entity.ts'
import { type EventBus } from '@rpgstudio/core'

/** Simulation rate. Every duration in the engine is measured in ticks. */
export const TICKS_PER_SECOND = 60
export const DEFAULT_PLAYER_SPEED = 4

/** What the player is doing this tick. `confirm` is true only on the tick of the press. */
export interface GameInput {
  readonly direction: Direction | null
  readonly confirm: boolean
}

export const NO_INPUT: GameInput = { direction: null, confirm: false }

export interface PartyMember {
  actorId: number
  level: number
  experience: number
  hp: number
  mp: number
}

export interface GameMessage {
  readonly face: string | undefined
  readonly text: string
}

export type AudioTier = 'bgm' | 'bgs' | 'me' | 'se'

export interface AudioCue {
  readonly name: string
  readonly volume: number
  readonly pitch: number
}

/** The engine's only dependency on a sound system; headless runs use a recorder. */
export interface AudioPort {
  play: (tier: AudioTier, cue: AudioCue) => void
  stop: (tier: AudioTier) => void
}

export interface GameEventMap {
  message: GameMessage
  messageClosed: void
  mapLoaded: { readonly mapId: number }
  eventStarted: { readonly eventId: number | null }
  eventFinished: { readonly eventId: number | null }
  switchChanged: { readonly switchId: number; readonly value: boolean }
  variableChanged: { readonly variableId: number; readonly value: number }
  /** Fired once per completed step of any entity. */
  stepped: { readonly entity: Entity }
  loaded: void
}

/** A running event: a stack of command lists plus its wait state. */
export interface Interpreter {
  readonly sourceEventId: number | null
  readonly stack: Frame[]
  waitTicks: number
  waitingForMessage: boolean
}

export interface Frame {
  readonly commands: readonly EventCommand[]
  index: number
}

export interface EntityStep {
  readonly entity: Entity
  /** `bump` means the entity tried to enter the tile and was stopped by `blocker`. */
  readonly kind: 'arrived' | 'bump'
  readonly blocker?: Entity
}

/** Mutable simulation state. Only systems and the game facade write to it. */
export interface GameState {
  tick: number
  map: Tilemap
  switches: Record<number, boolean>
  variables: Record<number, number>
  inventory: Record<number, number>
  gold: number
  party: PartyMember[]
  rng: Rng
  message: GameMessage | null
  foreground: Interpreter | null
  background: Map<number, Interpreter>
  steps: EntityStep[]
  pagesDirty: boolean
  currentBgm: string | null
  currentBgs: string | null
  player: Entity
}

/** A custom per-tick system, as registered by plugins. Runs after the built-in systems. */
export type GameSystem = (game: GameSystemContext, input: GameInput) => void

export interface GameSystemContext {
  readonly world: World<Entity>
  readonly state: Readonly<GameState>
  readonly bus: EventBus<GameEventMap>
}

export interface Runtime {
  readonly project: Project
  readonly world: World<Entity>
  readonly state: GameState
  readonly bus: EventBus<GameEventMap>
  readonly audio: AudioPort
  /** Loads another map and places the player. Provided by the game facade. */
  readonly transferPlayer: (
    mapId: number,
    x: number,
    y: number,
    direction: Direction | undefined,
  ) => void
}
