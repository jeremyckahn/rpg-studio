/**
 * Why the live preview is, or is not, running. It runs only when none of the three reasons to
 * stand still applies; each is set and cleared by a different event, so they cannot undo each
 * other (a tab that comes back to the front does not resume a game the user paused).
 */
export interface RunState {
  /** The user pressed Pause (or Esc). */
  readonly user: boolean
  /** Keyboard focus is somewhere other than the game, so it would not hear any keys. */
  readonly away: boolean
  /** The browser tab is not visible. */
  readonly hidden: boolean
}

export type RunEvent =
  'userPaused' | 'userResumed' | 'focusEntered' | 'focusLeft' | 'tabHidden' | 'tabShown'

export type PauseReason = 'user' | 'focus' | 'hidden'

/** Nothing has focus yet when the preview opens; the panel focuses the game as soon as it is ready. */
export const initialRunState: RunState = { user: false, away: true, hidden: false }

export const reduceRun = (state: RunState, event: RunEvent): RunState => {
  switch (event) {
    case 'userPaused':
      return { ...state, user: true }
    // Resuming means "play now", and playing needs focus, so it answers both reasons at once.
    case 'userResumed':
      return { ...state, user: false, away: false }
    case 'focusEntered':
      return { ...state, away: false }
    case 'focusLeft':
      return { ...state, away: true }
    case 'tabHidden':
      return { ...state, hidden: true }
    case 'tabShown':
      return { ...state, hidden: false }
  }
}

export const isRunning = (state: RunState): boolean => !state.user && !state.away && !state.hidden

/** The reasons the game is standing still, most important first (the one to tell the user about). */
export const pauseReasons = (state: RunState): readonly PauseReason[] => [
  ...(state.user ? (['user'] as const) : []),
  ...(state.hidden ? (['hidden'] as const) : []),
  ...(state.away ? (['focus'] as const) : []),
]
