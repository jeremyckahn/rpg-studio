// @vitest-environment jsdom
import { act, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { type PreviewController, type PreviewState } from '../src/preview/previewController'
import { PreviewDebugPanel } from '../src/preview/PreviewDebugPanel'
import { createHarness, renderInApp } from './render'

const baseState: PreviewState = {
  phase: 'ready',
  running: true,
  reasons: [],
  pendingChange: false,
  notice: null,
  problems: [],
  crashed: false,
  keepPlace: true,
  start: null,
  reloads: 0,
  info: {
    tick: 120,
    mapId: 1,
    mapName: 'Town',
    player: { x: 3, y: 4, direction: 'left', moving: false },
    switches: { 2: true },
    variables: { 1: 7 },
    message: 'Hello',
    eventRunning: true,
    gold: 25,
    party: [{ actorId: 1, level: 3, hp: 40, mp: 8 }],
    inventory: { 1: 2, 2: 0 },
  },
}

/** A controller that only reports; the panel never calls anything on it. */
const fakeController = (initial: PreviewState) => {
  let state = initial
  let listeners: readonly (() => void)[] = []
  const controller = {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners = [...listeners, listener]
      return () => {
        listeners = listeners.filter((candidate) => candidate !== listener)
      }
    },
  } as unknown as PreviewController
  return {
    controller,
    set: (next: PreviewState) => {
      state = next
      listeners.forEach((listener) => {
        listener()
      })
    },
  }
}

const setup = () => {
  const harness = createHarness()
  harness.handle.store.dispatch({
    type: 'project/updateMeta',
    payload: { changes: { switchNames: { '1': 'Door open', '2': 'Met the elder' } } },
  })
  const fake = fakeController(baseState)
  harness.services.preview.set(fake.controller)
  const view = renderInApp(<PreviewDebugPanel />, harness)
  return { ...harness, ...view, fake }
}

describe('Debug panel', () => {
  it('says to open the Play tab when none is open', () => {
    renderInApp(<PreviewDebugPanel />)
    expect(screen.getByText('Open the Play tab.')).toBeTruthy()
  })

  it('shows where the player is and what the game is doing', () => {
    setup()
    const panel = screen.getByTestId('preview-debug')
    expect(panel.textContent).toContain('Running')
    expect(panel.textContent).toContain('tick 120')
    expect(panel.textContent).toContain('Town (#1)')
    expect(panel.textContent).toContain('3, 4')
    expect(panel.textContent).toContain('left')
    expect(panel.textContent).toContain('Hello')
    expect(panel.textContent).toContain('Event runningyes')
  })

  it('shows the party, gold and the items actually held', () => {
    setup()
    const text = screen.getByTestId('preview-debug').textContent ?? ''
    expect(text).toContain('Gold25')
    expect(text).toContain('Hero')
    expect(text).toContain('Lv 3 · HP 40 · MP 8')
    expect(text).toContain('Potion×2')
    // An item with none left is not listed as held.
    expect(text).not.toContain('×0')
  })

  it('lists every named switch, ON or OFF, and any other switch that has been set', () => {
    setup()
    const text = screen.getByTestId('preview-debug').textContent ?? ''
    expect(text).toContain('Door openOFF')
    expect(text).toContain('Met the elderON')
  })

  it('lists variables that are set, and falls back to the id when a variable has no name', () => {
    setup()
    expect(screen.getByTestId('preview-debug').textContent).toContain('#17')
  })

  it('follows the game as it changes', () => {
    const { fake } = setup()
    act(() => {
      fake.set({
        ...baseState,
        running: false,
        info: baseState.info && { ...baseState.info, tick: 999, gold: 1 },
      })
    })
    const text = screen.getByTestId('preview-debug').textContent ?? ''
    expect(text).toContain('Paused')
    expect(text).toContain('tick 999')
    expect(text).toContain('Gold1')
  })

  it('says so while the game is still starting or cannot run', () => {
    const { fake } = setup()
    act(() => {
      fake.set({ ...baseState, info: null, phase: 'starting' })
    })
    expect(screen.getByText('Starting…')).toBeTruthy()
    act(() => {
      fake.set({ ...baseState, info: null, phase: 'failed' })
    })
    expect(screen.getByText('The game is not running.')).toBeTruthy()
  })
})
