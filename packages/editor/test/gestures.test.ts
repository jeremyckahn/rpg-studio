import { describe, expect, it } from 'vitest'

import {
  PINCH_STEP_RATIO,
  TAP_SLOP,
  type TouchEffect,
  type TouchInput,
  type TouchOptions,
  type TouchState,
  initialTouchState,
  pinchStep,
  reduceTouch,
} from '../src/canvas/gestures'

const paintOptions: TouchOptions = { panOnly: false }

/** Feeds events through the reducer, returning the final state and every effect in order. */
const run = (inputs: readonly TouchInput[], options: TouchOptions = paintOptions) =>
  inputs.reduce<{ state: TouchState; effects: readonly TouchEffect[] }>(
    (acc, input) => {
      const next = reduceTouch(acc.state, input, options)
      return { state: next.state, effects: [...acc.effects, ...next.effects] }
    },
    { state: initialTouchState, effects: [] },
  )

const at = (type: TouchInput['type'], id: number, x: number, y: number): TouchInput => ({
  type,
  id,
  pos: { x, y },
})

describe('pinchStep', () => {
  it('steps once the spread passes the ratio and re-bases on the new spread', () => {
    expect(pinchStep(100, 100 * PINCH_STEP_RATIO)).toEqual({
      step: 1,
      baseline: 100 * PINCH_STEP_RATIO,
    })
    expect(pinchStep(100, 100 / PINCH_STEP_RATIO)).toEqual({
      step: -1,
      baseline: 100 / PINCH_STEP_RATIO,
    })
  })

  it('does nothing for small changes, or when there is no baseline yet', () => {
    expect(pinchStep(100, 110)).toEqual({ step: 0, baseline: 100 })
    expect(pinchStep(0, 80)).toEqual({ step: 0, baseline: 80 })
  })
})

describe('one finger', () => {
  it('paints one cell for a tap', () => {
    const { effects, state } = run([at('down', 1, 40, 40), at('up', 1, 40, 40)])
    expect(effects).toEqual([{ type: 'paintStart', at: { x: 40, y: 40 } }, { type: 'paintEnd' }])
    expect(state).toEqual(initialTouchState)
  })

  it('does not paint for a cancelled touch', () => {
    expect(run([at('down', 1, 40, 40), at('cancel', 1, 40, 40)]).effects).toEqual([])
  })

  it('ignores jitter inside the slop, then starts the stroke where the finger first landed', () => {
    const jitter = run([at('down', 1, 40, 40), at('move', 1, 40 + TAP_SLOP, 40)])
    expect(jitter.effects).toEqual([])
    expect(jitter.state.mode).toBe('pending')

    const stroke = run([at('down', 1, 40, 40), at('move', 1, 40 + TAP_SLOP + 1, 40)])
    expect(stroke.effects).toEqual([
      { type: 'paintStart', at: { x: 40, y: 40 } },
      { type: 'paintMove', at: { x: 51, y: 40 } },
    ])
    expect(stroke.state.mode).toBe('painting')
  })

  it('continues and ends a stroke', () => {
    const { effects, state } = run([
      at('down', 1, 0, 0),
      at('move', 1, 30, 0),
      at('move', 1, 60, 0),
      at('up', 1, 60, 0),
    ])
    expect(effects.map((effect) => effect.type)).toEqual([
      'paintStart',
      'paintMove',
      'paintMove',
      'paintEnd',
    ])
    expect(state.mode).toBe('idle')
  })

  it('pans instead of painting with the Pan tool', () => {
    const { effects } = run([at('down', 1, 10, 10), at('move', 1, 25, 5), at('up', 1, 25, 5)], {
      panOnly: true,
    })
    expect(effects).toEqual([{ type: 'pan', delta: { x: 15, y: -5 } }])
  })
})

describe('two fingers', () => {
  it('never paints when a second finger lands before the first moves', () => {
    const { effects, state } = run([at('down', 1, 100, 100), at('down', 2, 200, 100)])
    expect(effects).toEqual([])
    expect(state.mode).toBe('pinching')
  })

  it('ends a stroke already in progress when a second finger lands', () => {
    const { effects } = run([at('down', 1, 0, 0), at('move', 1, 40, 0), at('down', 2, 100, 100)])
    expect(effects.at(-1)).toEqual({ type: 'paintEnd' })
  })

  it('pans by the movement of the midpoint', () => {
    const { effects } = run([
      at('down', 1, 100, 100),
      at('down', 2, 200, 100),
      at('move', 1, 110, 120),
      at('move', 2, 210, 120),
    ])
    const pans = effects.filter((effect) => effect.type === 'pan')
    const total = pans.reduce(
      (sum, effect) => ({ x: sum.x + effect.delta.x, y: sum.y + effect.delta.y }),
      { x: 0, y: 0 },
    )
    expect(total).toEqual({ x: 10, y: 20 })
  })

  it('zooms in when the fingers spread, anchored at their midpoint', () => {
    const { effects } = run([
      at('down', 1, 100, 100),
      at('down', 2, 200, 100),
      at('move', 2, 300, 100),
    ])
    expect(effects.filter((effect) => effect.type === 'zoom')).toEqual([
      { type: 'zoom', step: 1, anchor: { x: 200, y: 100 } },
    ])
  })

  it('zooms out when the fingers close, and steps again only after another full ratio', () => {
    const { effects } = run([
      at('down', 1, 0, 0),
      at('down', 2, 300, 0),
      at('move', 2, 200, 0),
      at('move', 2, 190, 0),
    ])
    expect(effects.filter((effect) => effect.type === 'zoom')).toEqual([
      { type: 'zoom', step: -1, anchor: { x: 100, y: 0 } },
    ])
  })

  it('keeps panning with the remaining finger, and does not paint, after one lifts', () => {
    const lifted = run([at('down', 1, 100, 100), at('down', 2, 200, 100), at('up', 2, 200, 100)])
    expect(lifted.state.mode).toBe('panning')
    const { effects } = run([
      at('down', 1, 100, 100),
      at('down', 2, 200, 100),
      at('up', 2, 200, 100),
      at('move', 1, 130, 100),
      at('up', 1, 130, 100),
    ])
    expect(effects).toEqual([{ type: 'pan', delta: { x: 30, y: 0 } }])
  })

  it('ignores a third finger and events from fingers it is not tracking', () => {
    const { state, effects } = run([
      at('down', 1, 0, 0),
      at('down', 2, 100, 0),
      at('down', 3, 50, 50),
      at('move', 9, 500, 500),
    ])
    expect(state.points.map((point) => point.id)).toEqual([1, 2])
    expect(effects).toEqual([])
  })
})
