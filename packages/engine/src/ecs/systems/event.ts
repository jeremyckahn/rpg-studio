import {
  type EventCommand,
  type MapEvent,
  type Tilemap,
  pointsEqual,
  stepTile,
} from '@rpgstudio/core'

import { conditionHolds, createInterpreter, stepInterpreter } from '../../game/interpreter.ts'
import { type GameInput, type Interpreter, type Runtime } from '../../game/types.ts'
import { type Entity } from '../entity.ts'

const eventById = (map: Tilemap, eventId: number): MapEvent | undefined =>
  map.events.find((event) => event.id === eventId)

/** The highest-numbered page whose conditions all hold, as in RPG Maker. */
export const activePageIndex = (rt: Runtime, event: MapEvent): number =>
  event.pages.findLastIndex((page) => page.conditions.every((c) => conditionHolds(rt.state, c)))

const finishForeground = (rt: Runtime, interpreter: Interpreter): void => {
  rt.state.foreground = null
  rt.bus.emit('eventFinished', { eventId: interpreter.sourceEventId })
}

/** Starts an event and runs it up to its first wait, so it reacts on the tick that triggered it. */
const startForeground = (
  rt: Runtime,
  commands: readonly EventCommand[],
  eventId: number | null,
): void => {
  const interpreter = createInterpreter(commands, eventId)
  rt.state.foreground = interpreter
  rt.bus.emit('eventStarted', { eventId })
  if (stepInterpreter(rt, interpreter, false).finished) finishForeground(rt, interpreter)
}

/** Applies the active page of every event entity to its components. */
export const refreshPages = (rt: Runtime): void => {
  for (const entity of rt.world.with('eventId')) {
    const event = eventById(rt.state.map, entity.eventId)
    if (!event) continue
    const index = activePageIndex(rt, event)
    if (index === entity.activePage) continue
    entity.activePage = index
    const page = event.pages[index]

    if (!page) {
      rt.world.removeComponent(entity, 'eventTrigger')
      rt.world.removeComponent(entity, 'collision')
      rt.world.removeComponent(entity, 'sprite')
      rt.state.background.delete(event.id)
      continue
    }
    rt.world.update(entity, 'eventTrigger', { eventId: event.id, trigger: page.trigger })
    rt.world.update(entity, 'collision', { solid: page.solid })
    if (page.graphic) {
      rt.world.update(entity, 'sprite', { ...page.graphic })
    } else {
      rt.world.removeComponent(entity, 'sprite')
    }
    if (page.trigger === 'parallel') {
      rt.state.background.set(event.id, createInterpreter(page.commands, event.id))
    } else {
      rt.state.background.delete(event.id)
    }
  }
}

const commandsOf = (rt: Runtime, entity: Entity): readonly EventCommand[] | undefined => {
  if (entity.eventId === undefined || entity.activePage === undefined) return undefined
  return eventById(rt.state.map, entity.eventId)?.pages[entity.activePage]?.commands
}

/** Event entities with `trigger` located by `where`, in map order. */
const triggeredEntities = (
  rt: Runtime,
  trigger: 'action' | 'touch' | 'autorun',
  where: (entity: Entity & Required<Pick<Entity, 'position' | 'collision'>>) => boolean,
): Entity[] => {
  const matches: Entity[] = []
  for (const entity of rt.world.with('eventTrigger', 'position', 'collision')) {
    if (entity.eventTrigger.trigger === trigger && where(entity)) matches.push(entity)
  }
  return matches
}

const startFromEntity = (rt: Runtime, entity: Entity): boolean => {
  const commands = commandsOf(rt, entity)
  if (!commands || entity.eventId === undefined) return false
  startForeground(rt, commands, entity.eventId)
  return true
}

/**
 * Runs map events: page selection, the foreground interpreter (which blocks the
 * player), parallel interpreters, and the four trigger kinds.
 */
export const eventSystem = (rt: Runtime, input: GameInput): void => {
  const { state } = rt
  if (state.pagesDirty) {
    state.pagesDirty = false
    refreshPages(rt)
  }

  // Parallel events run alongside everything else.
  for (const [eventId, interpreter] of state.background) {
    if (stepInterpreter(rt, interpreter, false).finished) {
      const event = eventById(state.map, eventId)
      const entity = [...rt.world.with('eventId')].find(
        (candidate) => candidate.eventId === eventId,
      )
      const commands = event && entity && commandsOf(rt, entity)
      if (commands) state.background.set(eventId, createInterpreter(commands, eventId))
    }
  }

  const steps = state.steps
  state.steps = []

  let confirm = input.confirm
  if (state.foreground) {
    const foreground = state.foreground
    const first = stepInterpreter(rt, foreground, confirm)
    // Dismissing a message continues the event on the same tick, so closing the
    // last message ends the event immediately.
    const result = first.confirmUsed
      ? { ...stepInterpreter(rt, foreground, false), confirmUsed: true }
      : first
    confirm = confirm && !result.confirmUsed
    if (result.finished) finishForeground(rt, foreground)
    // Nothing new may start on the tick an event ends or while one runs.
    if (state.foreground || result.finished) return
  }

  const player = state.player
  const playerSteps = steps.filter((step) => step.entity === player)

  // Touch: the player stepped onto an event, or bumped into a solid one.
  for (const step of playerSteps) {
    const touched =
      step.kind === 'arrived'
        ? triggeredEntities(
            rt,
            'touch',
            (e) => !e.collision.solid && pointsEqual(e.position, player.position!),
          )
        : step.blocker && step.blocker.eventTrigger?.trigger === 'touch'
          ? [step.blocker]
          : []
    const first = touched[0]
    if (first && startFromEntity(rt, first)) return
  }

  // Action: confirm pressed while idle, on the player's tile or the one faced.
  if (confirm && player.movement && player.position && player.movement.target === null) {
    const facing = stepTile(player.position, player.movement.direction)
    const candidates = triggeredEntities(rt, 'action', (e) =>
      e.collision.solid
        ? pointsEqual(e.position, facing)
        : pointsEqual(e.position, player.position!),
    )
    const first = candidates[0]
    if (first && startFromEntity(rt, first)) return
  }

  // Autorun: starts whenever nothing else is running.
  const autorun = triggeredEntities(rt, 'autorun', () => true)[0]
  if (autorun) startFromEntity(rt, autorun)
}
