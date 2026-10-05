/** Events that count as a user gesture browsers accept for starting audio. */
export const UNLOCK_EVENTS = ['pointerdown', 'touchend', 'keydown', 'click'] as const

export interface UnlockTarget {
  addEventListener: (type: string, listener: () => void, options?: AddEventListenerOptions) => void
  removeEventListener: (type: string, listener: () => void) => void
}

/**
 * Browsers keep audio suspended until the user interacts. This waits for the
 * first gesture, calls `unlock` once, then removes every listener. It retries on
 * the next gesture if `unlock` fails. Returns a function that cancels it.
 */
export const installAudioUnlock = (
  target: UnlockTarget,
  unlock: () => Promise<void> | void,
): (() => void) => {
  let done = false
  let cancelled = false
  const listen = (): void => {
    UNLOCK_EVENTS.forEach((type) => {
      target.addEventListener(type, onGesture, { passive: true })
    })
  }
  const unlisten = (): void => {
    UNLOCK_EVENTS.forEach((type) => {
      target.removeEventListener(type, onGesture)
    })
  }
  // Not unlocked after all (e.g. the gesture was not trusted): try again next time.
  const retry = (): void => {
    if (cancelled) return
    done = false
    listen()
  }
  function onGesture(): void {
    if (done) return
    done = true
    unlisten()
    // Called synchronously: browsers only honour resume() inside the gesture handler.
    try {
      void Promise.resolve(unlock()).catch(retry)
    } catch {
      retry()
    }
  }
  listen()
  return () => {
    cancelled = true
    done = true
    unlisten()
  }
}
