import { type Vec2 } from './geometry.ts'

/** A finger must travel this many screen pixels before a touch becomes a paint stroke. */
export const TAP_SLOP = 10
/** Zoom levels are whole numbers, so a pinch steps one level each time the fingers spread or close by this ratio. */
export const PINCH_STEP_RATIO = 1.35

export interface TouchPoint {
  readonly id: number
  readonly pos: Vec2
}

export type TouchMode =
  /** No finger down. */
  | 'idle'
  /** One finger down that has not moved far enough to be a stroke; a second finger would make it a pan. */
  | 'pending'
  | 'painting'
  | 'panning'
  | 'pinching'

export interface TouchState {
  readonly mode: TouchMode
  /** At most two fingers are tracked; extra fingers are ignored. */
  readonly points: readonly TouchPoint[]
  /** Where the pending finger first landed; the stroke starts here so no tile is skipped. */
  readonly origin: Vec2 | null
  /** Finger spread the next pinch step is measured against. */
  readonly baseline: number
}

export type TouchInput = {
  readonly type: 'down' | 'move' | 'up' | 'cancel'
  readonly id: number
  readonly pos: Vec2
}

export type TouchEffect =
  | { readonly type: 'paintStart'; readonly at: Vec2 }
  | { readonly type: 'paintMove'; readonly at: Vec2 }
  | { readonly type: 'paintEnd' }
  | { readonly type: 'pan'; readonly delta: Vec2 }
  | { readonly type: 'zoom'; readonly step: 1 | -1; readonly anchor: Vec2 }

export interface TouchOptions {
  /** The Pan tool is active: a single finger pans instead of painting. */
  readonly panOnly: boolean
}

export const initialTouchState: TouchState = {
  mode: 'idle',
  points: [],
  origin: null,
  baseline: 0,
}

export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)
export const midpoint = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** Whether the spread moved far enough from `baseline` to change the zoom level, and the baseline to use next. */
export const pinchStep = (
  baseline: number,
  spread: number,
): { readonly step: 0 | 1 | -1; readonly baseline: number } => {
  if (baseline <= 0) return { step: 0, baseline: spread }
  if (spread >= baseline * PINCH_STEP_RATIO) return { step: 1, baseline: spread }
  if (spread <= baseline / PINCH_STEP_RATIO) return { step: -1, baseline: spread }
  return { step: 0, baseline }
}

interface Transition {
  readonly state: TouchState
  readonly effects: readonly TouchEffect[]
}

const stay = (state: TouchState): Transition => ({ state, effects: [] })

const centre = (points: readonly TouchPoint[]): Vec2 | null => {
  const [a, b] = points
  return a && b ? midpoint(a.pos, b.pos) : null
}

const spread = (points: readonly TouchPoint[]): number => {
  const [a, b] = points
  return a && b ? distance(a.pos, b.pos) : 0
}

/**
 * Turns raw touch events into canvas intents. Pure: it holds no state of its own, so the
 * rules are testable without a browser.
 *
 * - One finger paints with the current tool, but only once it moves past `TAP_SLOP`
 *   (or lifts, which is a tap). Waiting is what lets a two-finger gesture begin
 *   without the first finger having already painted a tile.
 * - A second finger ends any stroke in progress, then pans (by the midpoint) and
 *   zooms (by the spread) until a finger lifts.
 * - With the Pan tool a single finger pans.
 */
export const reduceTouch = (
  state: TouchState,
  input: TouchInput,
  options: TouchOptions,
): Transition => {
  const tracked = state.points.some((point) => point.id === input.id)

  if (input.type === 'down') {
    if (tracked || state.points.length >= 2) return stay(state)
    const points = [...state.points, { id: input.id, pos: input.pos }]
    if (points.length === 2) {
      return {
        state: { mode: 'pinching', points, origin: null, baseline: spread(points) },
        effects: state.mode === 'painting' ? [{ type: 'paintEnd' }] : [],
      }
    }
    return stay({
      mode: options.panOnly ? 'panning' : 'pending',
      points,
      origin: input.pos,
      baseline: 0,
    })
  }

  if (!tracked) return stay(state)

  if (input.type === 'move') {
    const points = state.points.map((point) =>
      point.id === input.id ? { ...point, pos: input.pos } : point,
    )
    const next = { ...state, points }
    const previous = state.points.find((point) => point.id === input.id)

    switch (state.mode) {
      case 'pending': {
        if (!state.origin || distance(state.origin, input.pos) <= TAP_SLOP) return stay(next)
        return {
          state: { ...next, mode: 'painting', origin: null },
          effects: [
            { type: 'paintStart', at: state.origin },
            { type: 'paintMove', at: input.pos },
          ],
        }
      }
      case 'painting':
        return { state: next, effects: [{ type: 'paintMove', at: input.pos }] }
      case 'panning': {
        if (!previous) return stay(next)
        return {
          state: next,
          effects: [
            {
              type: 'pan',
              delta: { x: input.pos.x - previous.pos.x, y: input.pos.y - previous.pos.y },
            },
          ],
        }
      }
      case 'pinching': {
        const before = centre(state.points)
        const after = centre(points)
        if (!before || !after) return stay(next)
        const zoom = pinchStep(state.baseline, spread(points))
        const delta = { x: after.x - before.x, y: after.y - before.y }
        const effects: readonly TouchEffect[] = [
          ...(delta.x !== 0 || delta.y !== 0 ? [{ type: 'pan', delta } as const] : []),
          ...(zoom.step !== 0 ? [{ type: 'zoom', step: zoom.step, anchor: after } as const] : []),
        ]
        return { state: { ...next, baseline: zoom.baseline }, effects }
      }
      default:
        return stay(next)
    }
  }

  // 'up' or 'cancel': one finger leaves.
  const remaining = state.points.filter((point) => point.id !== input.id)
  switch (state.mode) {
    case 'pending': {
      // A tap paints exactly one cell; a cancelled touch paints nothing.
      const effects: readonly TouchEffect[] =
        input.type === 'up' && state.origin
          ? [{ type: 'paintStart', at: state.origin }, { type: 'paintEnd' }]
          : []
      return { state: initialTouchState, effects }
    }
    case 'painting':
      return { state: initialTouchState, effects: [{ type: 'paintEnd' }] }
    case 'pinching':
      // The finger left behind keeps panning; it must not start painting mid-gesture.
      return remaining.length === 1
        ? stay({ mode: 'panning', points: remaining, origin: null, baseline: 0 })
        : stay(initialTouchState)
    default:
      return stay(remaining.length === 0 ? initialTouchState : { ...state, points: remaining })
  }
}
