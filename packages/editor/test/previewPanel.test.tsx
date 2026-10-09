// @vitest-environment jsdom
/* eslint-disable functional/immutable-data --
   The session is a test double whose state the test changes to simulate the engine. */
import { createDefaultTilesetPng } from '@rpgstudio/core'
import { type PlayerSession, type PlayerSessionOptions } from '@rpgstudio/engine/player'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { describePreview } from '../src/preview/previewHub'
import { createPreviewPanel } from '../src/preview/PreviewWorkspace'
import { createHarness, renderInApp } from './render'

const fakeGame = () => ({
  canSave: () => true,
  serialize: () => ({}),
  bus: { on: () => () => undefined },
  snapshot: () => ({
    tick: 42,
    mapId: 1,
    player: { x: 3, y: 4, direction: 'down', moving: false },
    switches: {},
    variables: {},
    message: null,
    eventRunning: false,
  }),
  state: { map: { name: 'Town' }, gold: 0, party: [], inventory: {} },
})

const setup = (withTileset = true) => {
  const harness = createHarness()
  if (withTileset) harness.assets.write('img/tilesets/basic.png', createDefaultTilesetPng())
  const sessions: Array<PlayerSession & { paused: boolean }> = []
  const createSession = vi.fn((options: PlayerSessionOptions) => {
    const session = {
      paused: options.startPaused === true,
      game: fakeGame() as never,
      pause: vi.fn(() => {
        session.paused = true
      }),
      resume: vi.fn(() => {
        session.paused = false
      }),
      reload: vi.fn(() => Promise.resolve({ success: true as const, data: { restored: true } })),
      stop: vi.fn(),
    }
    sessions.push(session)
    return Promise.resolve(session as unknown as PlayerSession & { paused: boolean })
  })
  const Panel = createPreviewPanel(
    {
      read: {
        list: harness.assets.list,
        readText: harness.assets.readText,
        readBytes: harness.assets.readBytes,
      },
    },
    { createSession },
  )
  const view = renderInApp(<Panel />, harness)
  return { ...harness, ...view, sessions, createSession }
}

const button = (name: string): HTMLButtonElement =>
  screen.getByRole<HTMLButtonElement>('button', { name })
const status = (): string => screen.getByTestId('preview-status').textContent ?? ''

const stage = () => screen.getByRole('application', { name: 'Game preview' })

describe('Play tab', () => {
  it('starts playing when it opens, because opening it focuses the game', async () => {
    const { sessions } = setup()
    await waitFor(() => {
      expect(sessions[0]?.resume).toHaveBeenCalledOnce()
    })
    expect(button('Pause').disabled).toBe(false)
    expect(status()).toContain('Running')
    expect(await screen.findByText(/Town · \(3, 4\) · tick 42/)).toBeTruthy()
  })

  it('pauses from the button and from Esc, and says so over the game', async () => {
    const { sessions } = setup()
    await waitFor(() => {
      expect(button('Pause').disabled).toBe(false)
    })
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }))
    await waitFor(() => {
      expect(sessions[0]?.pause).toHaveBeenCalledOnce()
    })
    expect(screen.getByRole('button', { name: 'Resume the game' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Paused')
    expect(screen.getByText('Click or press Enter to resume')).toBeTruthy()
    expect(status()).toContain('Paused')

    await userEvent.click(screen.getByRole('button', { name: 'Resume' }))
    await waitFor(() => {
      expect(button('Pause').disabled).toBe(false)
    })
    fireEvent.keyDown(stage(), { key: 'Escape' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Resume the game' })).toBeTruthy()
    })
  })

  it('resumes with Enter or a click on the game, but not with Ctrl+Enter', async () => {
    const { sessions } = setup()
    await waitFor(() => {
      expect(button('Pause').disabled).toBe(false)
    })
    fireEvent.keyDown(stage(), { key: 'Escape' })
    await screen.findByRole('button', { name: 'Resume the game' })
    fireEvent.keyDown(stage(), { key: 'Enter', ctrlKey: true })
    expect(sessions[0]?.resume).toHaveBeenCalledOnce() // only the first play
    fireEvent.keyDown(stage(), { key: 'Enter' })
    await waitFor(() => {
      expect(sessions[0]?.resume).toHaveBeenCalledTimes(2)
    })
    fireEvent.keyDown(stage(), { key: 'Escape' })
    await userEvent.click(await screen.findByRole('button', { name: 'Resume the game' }))
    await waitFor(() => {
      expect(sessions[0]?.resume).toHaveBeenCalledTimes(3)
    })
  })

  it('pauses when focus leaves for the rest of the editor and invites a click', async () => {
    const { sessions } = setup()
    await waitFor(() => {
      expect(button('Pause').disabled).toBe(false)
    })
    act(() => {
      stage().blur()
    })
    await waitFor(() => {
      expect(sessions[0]?.pause).toHaveBeenCalled()
    })
    expect(screen.getByText('Click to play')).toBeTruthy()
  })

  it('keeps playing when focus only moves to the toolbar', async () => {
    const { sessions } = setup()
    const pause = await screen.findByRole('button', { name: 'Pause' })
    await waitFor(() => {
      expect(sessions[0]?.resume).toHaveBeenCalled()
    })
    act(() => {
      pause.focus()
    })
    expect(sessions[0]?.pause).not.toHaveBeenCalled()
    expect(status()).toContain('Running')
  })

  it('restarts from the beginning', async () => {
    const { sessions } = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Restart' }))
    await waitFor(() => {
      expect(sessions[0]?.reload).toHaveBeenCalledOnce()
    })
    expect(vi.mocked(sessions[0]?.reload ?? vi.fn()).mock.calls[0]?.[0]).not.toHaveProperty('save')
  })

  it('remembers the keep-my-place setting and passes it to the controller', async () => {
    const { handle, sessions } = setup()
    const toggle = await screen.findByRole<HTMLInputElement>('switch', {
      name: 'Keep my place when the project changes',
    })
    expect(toggle.checked).toBe(true)
    await userEvent.click(toggle)
    expect(handle.store.getState().editorUi.previewKeepPlace).toBe(false)
    expect(toggle.checked).toBe(false)
    expect(sessions[0]).toBeDefined()
  })

  it('names what is wrong instead of showing a blank screen', async () => {
    const { createSession } = setup(false)
    expect(await screen.findByText('The game cannot start')).toBeTruthy()
    expect(screen.getByText(/A map uses img\/tilesets\/basic\.png/)).toBeTruthy()
    expect(createSession).not.toHaveBeenCalled()
    expect(button('Restart').disabled).toBe(true)
  })

  it('answers GET_PREVIEW_STATE while open and says it is closed afterwards', async () => {
    const { services, unmount } = setup()
    await waitFor(() => {
      expect(button('Pause').disabled).toBe(false)
    })
    expect(describePreview(services.preview.current())).toMatchObject({
      open: true,
      status: 'running',
      pausedFor: [],
      keepPlace: true,
      game: { tick: 42, mapName: 'Town' },
    })
    unmount()
    expect(describePreview(services.preview.current())).toEqual({ open: false })
  })

  it('stops the game when the tab closes', async () => {
    const { sessions, unmount } = setup()
    await waitFor(() => {
      expect(sessions[0]).toBeDefined()
    })
    unmount()
    expect(sessions[0]?.stop).toHaveBeenCalled()
  })
})
