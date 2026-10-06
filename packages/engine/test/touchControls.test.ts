// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import {
  DEAD_ZONE,
  createTouchControls,
  directionFromOffset,
  hasCoarsePointer,
  mergeInputs,
} from '../src/player'

describe('directionFromOffset', () => {
  it('is null inside the dead zone', () => {
    expect(directionFromOffset(0, 0, 100)).toBeNull()
    expect(directionFromOffset(DEAD_ZONE * 100 - 1, 0, 100)).toBeNull()
  })

  it('picks the dominant axis, in screen coordinates (down is positive y)', () => {
    expect(directionFromOffset(60, 10, 100)).toBe('right')
    expect(directionFromOffset(-60, 10, 100)).toBe('left')
    expect(directionFromOffset(10, 60, 100)).toBe('down')
    expect(directionFromOffset(10, -60, 100)).toBe('up')
  })

  it('never reports a diagonal', () => {
    expect(directionFromOffset(50, 51, 100)).toBe('down')
    expect(directionFromOffset(51, 50, 100)).toBe('right')
  })
})

describe('hasCoarsePointer', () => {
  it('is true only when the screen reports a coarse pointer, and false without matchMedia', () => {
    const answering = (matches: boolean) =>
      ({ matchMedia: () => ({ matches }) as MediaQueryList }) as Pick<Window, 'matchMedia'>
    expect(hasCoarsePointer(answering(true))).toBe(true)
    expect(hasCoarsePointer(answering(false))).toBe(false)
    expect(hasCoarsePointer({} as Pick<Window, 'matchMedia'>)).toBe(false)
  })
})

/** A touch at an offset from the pad's centre; the pad is 150px square at (0, 0) in tests. */
const setup = () => {
  const parent = document.createElement('div')
  const controls = createTouchControls(parent)
  const pad = controls.element.querySelector<HTMLElement>('[aria-label="Directional pad"]')
  const action = controls.element.querySelector<HTMLElement>('[aria-label="Action"]')
  if (!pad || !action) throw new Error('controls missing')
  vi.spyOn(pad, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 150, 150))
  const touch = (target: HTMLElement, type: string, x: number, y: number, id = 1) => {
    const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true })
    Reflect.defineProperty(event, 'pointerId', { value: id })
    target.dispatchEvent(event)
  }
  return { parent, controls, pad, action, touch }
}

describe('touch controls', () => {
  it('adds an overlay to the page and removes it when disposed', () => {
    const { parent, controls } = setup()
    expect(parent.querySelector('[data-touch-controls]')).toBe(controls.element)
    controls.dispose()
    expect(parent.querySelector('[data-touch-controls]')).toBeNull()
  })

  it('reports nothing until touched', () => {
    expect(setup().controls.poll()).toEqual({ direction: null, confirm: false })
  })

  it('holds a direction while the thumb is on the pad and releases it on lift', () => {
    const { controls, pad, touch } = setup()
    touch(pad, 'pointerdown', 140, 75)
    expect(controls.poll().direction).toBe('right')
    expect(controls.poll().direction).toBe('right')
    touch(pad, 'pointerup', 140, 75)
    expect(controls.poll().direction).toBeNull()
  })

  it('changes direction as the thumb slides, without lifting', () => {
    const { controls, pad, touch } = setup()
    touch(pad, 'pointerdown', 75, 10)
    expect(controls.poll().direction).toBe('up')
    touch(pad, 'pointermove', 10, 75)
    expect(controls.poll().direction).toBe('left')
    touch(pad, 'pointermove', 75, 75) // back to the centre
    expect(controls.poll().direction).toBeNull()
  })

  it('does not lose a tap that ends before the next poll', () => {
    const { controls, pad, touch } = setup()
    touch(pad, 'pointerdown', 75, 140)
    touch(pad, 'pointerup', 75, 140)
    expect(controls.poll().direction).toBe('down')
    expect(controls.poll().direction).toBeNull()
  })

  it('ignores movement from a pointer that is not steering the pad', () => {
    const { controls, pad, touch } = setup()
    touch(pad, 'pointerdown', 140, 75, 1)
    touch(pad, 'pointermove', 10, 75, 2)
    expect(controls.poll().direction).toBe('right')
    touch(pad, 'pointerup', 10, 75, 2)
    expect(controls.poll().direction).toBe('right')
  })

  it('treats a cancelled touch as a release', () => {
    const { controls, pad, touch } = setup()
    touch(pad, 'pointerdown', 140, 75)
    touch(pad, 'pointercancel', 140, 75)
    expect(controls.poll().direction).toBeNull()
  })

  it('reports a press of the action button exactly once', () => {
    const { controls, action, touch } = setup()
    touch(action, 'pointerdown', 10, 10)
    expect(controls.poll().confirm).toBe(true)
    expect(controls.poll().confirm).toBe(false)
  })

  it('stops responding once disposed', () => {
    const { controls, pad, touch } = setup()
    controls.dispose()
    touch(pad, 'pointerdown', 140, 75)
    expect(controls.poll().direction).toBeNull()
  })
})

describe('mergeInputs', () => {
  const source = (direction: 'up' | 'left' | null, confirm: boolean) => ({
    poll: () => ({ direction, confirm }),
    dispose: () => undefined,
  })

  it('uses the first source that holds a direction, and any confirm', () => {
    expect(mergeInputs(source(null, false), source('left', true)).poll()).toEqual({
      direction: 'left',
      confirm: true,
    })
    expect(mergeInputs(source('up', false), source('left', false)).poll().direction).toBe('up')
    expect(mergeInputs(source(null, false), source(null, false)).poll()).toEqual({
      direction: null,
      confirm: false,
    })
  })

  it('polls and disposes every source', () => {
    let polls = 0
    let disposed = 0
    const counting = {
      poll: () => {
        polls += 1
        return { direction: null, confirm: false }
      },
      dispose: () => {
        disposed += 1
      },
    }
    const merged = mergeInputs(counting, counting)
    merged.poll()
    merged.dispose()
    expect(polls).toBe(2)
    expect(disposed).toBe(2)
  })
})
