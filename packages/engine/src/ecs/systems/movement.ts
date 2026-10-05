import { type Direction, canStep, pointsEqual, stepTile } from '@rpgstudio/core'

import { type Entity } from '../entity.ts'
import { type GameInput, type Runtime, TICKS_PER_SECOND } from '../../game/types.ts'

/** Absorbs floating point drift so a 4 tiles/s step takes exactly 15 ticks. */
const STEP_EPSILON = 1e-9

type Mover = Entity & Required<Pick<Entity, 'position' | 'movement'>>

/** The solid entity (other than `mover`) occupying or about to occupy `tile`, if any. */
const blockerAt = (
  rt: Runtime,
  mover: Entity,
  tile: { x: number; y: number },
): Entity | undefined => {
  for (const other of rt.world.with('position', 'collision')) {
    if (other === mover || !other.collision.solid) continue
    if (pointsEqual(other.position, tile)) return other
    const target = other.movement?.target
    if (target && pointsEqual(target, tile)) return other
  }
  return undefined
}

/**
 * Tries to begin a step in the entity's requested direction. The entity always
 * turns to face the request; it only moves if the tile is passable and free.
 * Returns whether a step began.
 */
const beginStep = (rt: Runtime, entity: Mover): boolean => {
  const { movement, position } = entity
  const requested: Direction | null = movement.intent
  movement.intent = null
  if (requested === null) return false
  movement.direction = requested

  if (!canStep(rt.state.map, position, requested)) return false
  const target = stepTile(position, requested)
  const blocker = blockerAt(rt, entity, target)
  if (blocker) {
    rt.state.steps.push({ entity, kind: 'bump', blocker })
    return false
  }
  movement.target = target
  movement.progress = 0
  return true
}

/**
 * Grid-aligned movement. An entity is always either idle on a tile or part way
 * through a one-tile step; progress is advanced by `speed / TICKS_PER_SECOND`
 * each tick, and surplus progress carries into the next step so continuous
 * input moves at exactly `speed` tiles per second.
 */
export const movementSystem = (rt: Runtime, _input: GameInput): void => {
  for (const entity of rt.world.with('position', 'movement')) {
    const { movement } = entity
    const stride = movement.speed / TICKS_PER_SECOND

    if (movement.target === null && !beginStep(rt, entity)) continue

    movement.progress += stride
    while (movement.target !== null && movement.progress >= 1 - STEP_EPSILON) {
      const overflow = Math.max(0, movement.progress - 1)
      entity.position = movement.target
      movement.target = null
      movement.progress = 0
      rt.state.steps.push({ entity, kind: 'arrived' })
      rt.bus.emit('stepped', { entity })
      if (beginStep(rt, entity)) movement.progress = overflow
    }
  }
}
