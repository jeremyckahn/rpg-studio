import {
  type Direction,
  type Point,
  ProjectSchema,
  canStep,
  directionBetween,
  findPath,
  isSolidCell,
  pointsEqual,
  stepTile,
} from '@rpgstudio/core'

import {
  type AudioCue,
  type AudioPort,
  type AudioTier,
  type GameInput,
  type GameMessage,
  NO_INPUT,
  TICKS_PER_SECOND,
} from '../game/types.ts'
import { type Game, type GameSnapshot, createGame } from '../game/game.ts'

export interface AudioCall {
  readonly action: 'play' | 'stop'
  readonly tier: AudioTier
  readonly cue?: AudioCue
}

/** An `AudioPort` that remembers what it was asked to do. */
export interface RecordingAudio extends AudioPort {
  readonly calls: () => readonly AudioCall[]
}

export const createRecordingAudio = (): RecordingAudio => {
  let calls: readonly AudioCall[] = []
  return {
    play: (tier, cue) => {
      calls = [...calls, { action: 'play', tier, cue }]
    },
    stop: (tier) => {
      calls = [...calls, { action: 'stop', tier }]
    },
    calls: () => calls,
  }
}

/** Either one input held for every tick, or a function of the tick number. */
export type InputSource = GameInput | ((tick: number) => GameInput)

export interface SimulationResult {
  readonly ticksRun: number
  readonly snapshot: GameSnapshot
}

export interface WalkResult {
  readonly reached: boolean
  readonly ticks: number
  /** Why walking stopped early: an event took control, or no route exists. */
  readonly reason?: 'event' | 'no-path' | 'timeout'
}

export interface HeadlessGame {
  readonly game: Game
  readonly audio: RecordingAudio
  /** Every message shown so far, oldest first. */
  readonly messages: () => readonly GameMessage[]
  /** Runs `count` ticks. Needs no DOM, window or WebGL context. */
  simulateTicks: (count: number, input?: InputSource) => SimulationResult
  /** Holds `direction` for `ticks` ticks. */
  hold: (direction: Direction, ticks: number) => SimulationResult
  /** Moves one tile: presses `direction` for a tick, then lets the step finish. */
  step: (direction: Direction) => SimulationResult
  /** Presses and releases the confirm button over one tick. */
  pressConfirm: () => SimulationResult
  /** Ticks until a step in flight finishes, with no input. */
  settle: () => SimulationResult
  /** Walks the shortest route to `target`, as an AI playtester would. */
  walkTo: (target: Point, options?: { readonly maxTicks?: number }) => WalkResult
}

export interface HeadlessOptions {
  readonly seed?: number
}

/**
 * Builds a game that can be driven without a browser. `projectInput` is
 * untrusted JSON (for example written by an AI agent) and is validated first.
 */
export const createHeadlessGame = (
  projectInput: unknown,
  options: HeadlessOptions = {},
): HeadlessGame => {
  const project = ProjectSchema.parse(projectInput)
  const audio = createRecordingAudio()
  const game = createGame({
    project,
    audio,
    ...(options.seed === undefined ? {} : { seed: options.seed }),
  })

  let messages: readonly GameMessage[] = []
  game.bus.on('message', (message) => {
    messages = [...messages, message]
  })

  const simulateTicks: HeadlessGame['simulateTicks'] = (count, input = NO_INPUT) => {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError(`Tick count must be a non-negative integer, got ${count}`)
    }
    for (let i = 0; i < count; i++) {
      game.tick(typeof input === 'function' ? input(game.state.tick) : input)
    }
    return { ticksRun: count, snapshot: game.snapshot() }
  }

  const settle: HeadlessGame['settle'] = () => {
    const limit = TICKS_PER_SECOND * 10
    let ticks = 0
    while (game.state.player.movement?.target != null && ticks < limit) {
      game.tick(NO_INPUT)
      ticks += 1
    }
    return { ticksRun: ticks, snapshot: game.snapshot() }
  }

  const walkTo: HeadlessGame['walkTo'] = (target, { maxTicks = 3_600 } = {}) => {
    const { player, map } = game.state
    const movement = player.movement
    if (!movement) return { reached: false, ticks: 0, reason: 'no-path' }

    const solidEntityTiles = (): Point[] =>
      [...game.world.with('position', 'collision')]
        .filter((e) => e !== player && e.collision.solid && !pointsEqual(e.position, target))
        .map((e) => e.position)

    const plan = (from: Point): readonly Point[] | null => {
      const blocked = solidEntityTiles()
      return findPath({
        width: map.width,
        height: map.height,
        start: from,
        goal: target,
        goalReachable: (goal) => !isSolidCell(map, goal),
        canStep: (cell, direction) =>
          canStep(map, cell, direction) &&
          !blocked.some((tile) => pointsEqual(tile, stepTile(cell, direction))),
      })
    }

    // The tile the player will stand on once any step in flight completes.
    const anchor = (): Point => movement.target ?? (player.position as Point)

    let path = plan(anchor())
    if (!path) return { reached: false, ticks: 0, reason: 'no-path' }

    for (let ticks = 0; ticks < maxTicks; ticks++) {
      if (game.state.foreground) return { reached: false, ticks, reason: 'event' }
      const here = anchor()
      if (pointsEqual(here, target) && movement.target === null) return { reached: true, ticks }
      const index = path.findIndex((cell) => pointsEqual(cell, here))
      if (index === -1) {
        path = plan(here)
        if (!path) return { reached: false, ticks, reason: 'no-path' }
        continue
      }
      const next = path[index + 1]
      const direction = next ? (directionBetween(here, next) ?? null) : null
      game.tick({ direction, confirm: false })
    }
    return { reached: false, ticks: maxTicks, reason: 'timeout' }
  }

  return {
    game,
    audio,
    messages: () => messages,
    simulateTicks,
    hold: (direction, ticks) => simulateTicks(ticks, { direction, confirm: false }),
    step: (direction) => {
      simulateTicks(1, { direction, confirm: false })
      return settle()
    },
    pressConfirm: () => simulateTicks(1, { direction: null, confirm: true }),
    settle,
    walkTo,
  }
}
