import { type Direction } from '@rpgstudio/core'

import { type PlayerInput } from './input.ts'

/** Fraction of the pad's radius, around its centre, where a touch counts as "no direction". */
export const DEAD_ZONE = 0.25

/** Height reserved under the game for the controls when the screen is portrait. */
export const TOUCH_CONTROLS_HEIGHT = 200

/**
 * Which way a touch at `(dx, dy)` from the pad's centre points, or null inside the dead
 * zone. The dominant axis wins, so a thumb sliding around the pad changes direction
 * smoothly and diagonals never produce movement on two axes (the game is four-way).
 */
export const directionFromOffset = (dx: number, dy: number, radius: number): Direction | null => {
  if (Math.hypot(dx, dy) < radius * DEAD_ZONE) return null
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'down' : 'up'
}

/** Touch screens report a coarse pointer; mice and trackpads do not. */
export const hasCoarsePointer = (target: Pick<Window, 'matchMedia'>): boolean =>
  typeof target.matchMedia === 'function' && target.matchMedia('(pointer: coarse)').matches

export interface TouchControls extends PlayerInput {
  /** The overlay holding the pad and the action button. */
  readonly element: HTMLElement
}

const GLYPHS: readonly {
  readonly direction: Direction
  readonly glyph: string
  readonly at: string
}[] = [
  { direction: 'up', glyph: '▲', at: 'left:50%;top:6px;transform:translateX(-50%)' },
  { direction: 'down', glyph: '▼', at: 'left:50%;bottom:6px;transform:translateX(-50%)' },
  { direction: 'left', glyph: '◀', at: 'left:8px;top:50%;transform:translateY(-50%)' },
  { direction: 'right', glyph: '▶', at: 'right:8px;top:50%;transform:translateY(-50%)' },
]

const BASE = 'rgba(255,255,255,0.18)'
const ACTIVE = 'rgba(255,255,255,0.42)'

/**
 * A virtual D-pad and an action button for touch screens. The pad is one surface rather
 * than four buttons, so sliding a thumb from one direction to another needs no lift.
 * The action button is the same as pressing Enter: it talks to NPCs and advances messages.
 */
export const createTouchControls = (parent: HTMLElement): TouchControls => {
  const doc = parent.ownerDocument
  const element = doc.createElement('div')
  element.setAttribute('data-touch-controls', '')
  element.style.cssText = [
    'position:absolute',
    'left:0',
    'right:0',
    'bottom:0',
    `height:${TOUCH_CONTROLS_HEIGHT}px`,
    'display:flex',
    'align-items:center',
    'justify-content:space-between',
    'box-sizing:border-box',
    'padding:0 24px env(safe-area-inset-bottom,0)',
    'pointer-events:none',
    'user-select:none',
    '-webkit-user-select:none',
    '-webkit-touch-callout:none',
  ].join(';')

  const surface = (label: string, size: number, radius: string): HTMLElement => {
    const node = doc.createElement('div')
    node.setAttribute('role', 'button')
    node.setAttribute('aria-label', label)
    node.style.cssText = [
      `width:${size}px`,
      `height:${size}px`,
      `border-radius:${radius}`,
      `background:${BASE}`,
      'border:2px solid rgba(255,255,255,0.35)',
      'position:relative',
      'pointer-events:auto',
      'touch-action:none',
      'color:#fff',
      'font:bold 22px sans-serif',
    ].join(';')
    return node
  }

  const pad = surface('Directional pad', 150, '50%')
  const glyphs = GLYPHS.map(({ direction, glyph, at }) => {
    const node = doc.createElement('span')
    node.textContent = glyph
    node.style.cssText = `position:absolute;${at};font-size:20px;opacity:0.7`
    pad.append(node)
    return { direction, node }
  })
  const action = surface('Action', 84, '50%')
  action.textContent = 'A'
  action.style.display = 'flex'
  action.style.alignItems = 'center'
  action.style.justifyContent = 'center'
  element.append(pad, action)
  parent.append(element)

  let held: Direction | null = null
  /** A direction pressed since the last poll, so a tap shorter than one frame still counts. */
  let tapped: Direction | null = null
  let confirmPressed = false
  let padPointer: number | null = null

  const show = (direction: Direction | null): void => {
    held = direction
    if (direction) tapped = direction
    glyphs.forEach((entry) => {
      entry.node.style.opacity = entry.direction === direction ? '1' : '0.7'
    })
    pad.style.background = direction ? ACTIVE : BASE
  }

  const steer = (event: PointerEvent): void => {
    const rect = pad.getBoundingClientRect()
    show(
      directionFromOffset(
        event.clientX - (rect.left + rect.width / 2),
        event.clientY - (rect.top + rect.height / 2),
        rect.width / 2,
      ),
    )
  }
  const release = (event: PointerEvent): void => {
    if (event.pointerId !== padPointer) return
    padPointer = null
    show(null)
    // A cancelled touch (the system took it over) was not a deliberate tap.
    if (event.type === 'pointercancel') tapped = null
  }

  const onPadDown = (event: PointerEvent): void => {
    event.preventDefault()
    padPointer = event.pointerId
    try {
      // Keeps the thumb steering after it slides off the pad.
      pad.setPointerCapture(event.pointerId)
    } catch {
      // The pointer is already gone, or capture is unsupported; steering still works inside the pad.
    }
    steer(event)
  }
  const onPadMove = (event: PointerEvent): void => {
    if (event.pointerId === padPointer) steer(event)
  }
  const onActionDown = (event: PointerEvent): void => {
    event.preventDefault()
    confirmPressed = true
    action.style.background = ACTIVE
  }
  const onActionUp = (): void => {
    action.style.background = BASE
  }

  pad.addEventListener('pointerdown', onPadDown)
  pad.addEventListener('pointermove', onPadMove)
  pad.addEventListener('pointerup', release)
  pad.addEventListener('pointercancel', release)
  action.addEventListener('pointerdown', onActionDown)
  action.addEventListener('pointerup', onActionUp)
  action.addEventListener('pointercancel', onActionUp)

  return {
    element,
    poll: () => {
      const input = { direction: held ?? tapped, confirm: confirmPressed }
      tapped = null
      confirmPressed = false
      return input
    },
    dispose: () => {
      pad.removeEventListener('pointerdown', onPadDown)
      pad.removeEventListener('pointermove', onPadMove)
      pad.removeEventListener('pointerup', release)
      pad.removeEventListener('pointercancel', release)
      action.removeEventListener('pointerdown', onActionDown)
      action.removeEventListener('pointerup', onActionUp)
      action.removeEventListener('pointercancel', onActionUp)
      element.remove()
    },
  }
}
