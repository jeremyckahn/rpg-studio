import { type JsonValue, type Unsubscribe } from '@rpgstudio/core'

// A whole-statement type import is erased entirely; `{ type X }` would keep an import of the
// controller, and with it PixiJS, in the Node-only companion tests and the bridge.
import type { PreviewController } from './previewController.ts'

/**
 * Where the open preview, if any, is found by everything that is not the Play tab itself: the
 * Debug panel and the `GET_PREVIEW_STATE` query. The tab publishes its controller while it is
 * open and withdraws it when it closes.
 */
export interface PreviewHub {
  current: () => PreviewController | null
  set: (controller: PreviewController | null) => void
  subscribe: (listener: () => void) => Unsubscribe
}

export const createPreviewHub = (): PreviewHub => {
  let controller: PreviewController | null = null
  let listeners: readonly (() => void)[] = []
  return {
    current: () => controller,
    set: (next) => {
      controller = next
      listeners.forEach((listener) => {
        listener()
      })
    },
    subscribe: (listener) => {
      listeners = [...listeners, listener]
      return () => {
        listeners = listeners.filter((candidate) => candidate !== listener)
      }
    },
  }
}

/**
 * The answer to `GET_PREVIEW_STATE`: whether the Play tab is open and, if so, whether it is
 * playing, why not if it is not, and what the game is doing. Plain JSON.
 */
export const describePreview = (controller: PreviewController | null): JsonValue => {
  if (!controller) return { open: false }
  const state = controller.getState()
  const status =
    state.phase === 'failed'
      ? 'failed'
      : state.phase === 'starting'
        ? 'starting'
        : state.running
          ? 'running'
          : 'paused'
  return JSON.parse(
    JSON.stringify({
      open: true,
      status,
      pausedFor: state.reasons,
      crashed: state.crashed,
      keepPlace: state.keepPlace,
      pendingChange: state.pendingChange,
      start: state.start,
      notice: state.notice,
      problems: state.problems,
      game: state.info,
    }),
  ) as JsonValue
}
