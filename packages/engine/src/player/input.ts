import { type Direction } from '@rpgstudio/core'

import { type GameInput } from '../game/types.ts'

const DIRECTION_KEYS: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
}

const CONFIRM_KEYS: ReadonlySet<string> = new Set(['Enter', 'Space', 'KeyZ'])

export interface KeyboardInput {
  /** The input for the next tick. A confirm press is reported exactly once. */
  poll: () => GameInput
  dispose: () => void
}

interface KeyTarget {
  addEventListener: (type: string, listener: (event: KeyboardEvent) => void) => void
  removeEventListener: (type: string, listener: (event: KeyboardEvent) => void) => void
}

/**
 * Reads arrows/WASD for movement and Enter/Space/Z to confirm. When several
 * direction keys are held the most recently pressed one wins, which feels
 * right when changing direction without lifting the previous key.
 */
export const createKeyboardInput = (target: KeyTarget): KeyboardInput => {
  let held: readonly Direction[] = []
  /** A direction pressed since the last poll, so a tap shorter than one frame still counts. */
  let tapped: Direction | null = null
  let confirmPressed = false

  const onKeyDown = (event: KeyboardEvent): void => {
    const direction = DIRECTION_KEYS[event.code]
    if (direction) {
      event.preventDefault()
      held = [...held.filter((d) => d !== direction), direction]
      tapped = direction
    } else if (CONFIRM_KEYS.has(event.code)) {
      event.preventDefault()
      if (!event.repeat) confirmPressed = true
    }
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    const direction = DIRECTION_KEYS[event.code]
    if (direction) {
      // Both keys mapped to one direction (W and ArrowUp) release it together.
      held = held.filter((d) => d !== direction)
    }
  }

  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('keyup', onKeyUp)

  return {
    poll: () => {
      const input: GameInput = { direction: held.at(-1) ?? tapped, confirm: confirmPressed }
      tapped = null
      confirmPressed = false
      return input
    },
    dispose: () => {
      target.removeEventListener('keydown', onKeyDown)
      target.removeEventListener('keyup', onKeyUp)
    },
  }
}
