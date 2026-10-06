import { type CDPSession, type Page } from '@playwright/test'

export interface Finger {
  readonly x: number
  readonly y: number
}

/**
 * Multi-finger touch input through the DevTools protocol. `page.touchscreen` can only tap; pan and
 * pinch gestures need several fingers down at once. Chromium turns these into the same pointer
 * events (`pointerType: 'touch'`) a real screen produces.
 */
export const createTouch = async (page: Page) => {
  const session: CDPSession = await page.context().newCDPSession(page)
  const points = (fingers: readonly Finger[]) =>
    fingers.map((finger, index) => ({ x: finger.x, y: finger.y, id: index + 1 }))
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', fingers: readonly Finger[]) =>
    session.send('Input.dispatchTouchEvent', { type, touchPoints: points(fingers) })

  /** Puts fingers down at `from` and moves them to `to` in a few steps, then lifts them. */
  const gesture = async (
    from: readonly Finger[],
    to: readonly Finger[],
    options: { steps?: number; hold?: boolean } = {},
  ): Promise<void> => {
    const steps = options.steps ?? 6
    await send('touchStart', from)
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps
      await send(
        'touchMove',
        from.map((start, index) => {
          const end = to[index] ?? start
          return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t }
        }),
      )
    }
    if (!options.hold) await send('touchEnd', [])
  }

  return { gesture, end: () => send('touchEnd', []), detach: () => session.detach() }
}
