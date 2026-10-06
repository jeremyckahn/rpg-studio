const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

export interface AppUpdaterHooks {
  /** A new version has been downloaded and is waiting for the user to switch to it. */
  readonly onUpdateReady: () => void
  /** The app shell is cached, so the editor now works offline. */
  readonly onOfflineReady: () => void
}

export interface AppUpdater {
  /** Starts the service worker. Does nothing in development. */
  readonly register: () => Promise<void>
  /** Activates the waiting version and reloads the page. A no-op when none is waiting. */
  readonly apply: () => Promise<void>
}

/**
 * Registers the service worker that makes the editor installable and usable
 * offline. It does nothing in development, where a cached shell would only get
 * in the way of live reloading.
 *
 * Updates are never applied silently: reloading would throw away unsaved work, so
 * the new version waits (`registerType: 'prompt'`) until the user chooses to
 * `apply()` it from the update notice. The browser is asked to look for a new
 * version hourly so a long editing session still learns about releases.
 */
export const createAppUpdater = (hooks: AppUpdaterHooks): AppUpdater => {
  let activate: ((reloadPage?: boolean) => Promise<void>) | undefined

  return {
    register: async () => {
      if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
      const { registerSW } = await import('virtual:pwa-register')
      activate = registerSW({
        immediate: true,
        onNeedRefresh: hooks.onUpdateReady,
        onOfflineReady: hooks.onOfflineReady,
        onRegisteredSW: (_url, registration) => {
          if (registration) setInterval(() => void registration.update(), UPDATE_CHECK_INTERVAL_MS)
        },
      })
    },
    apply: async () => {
      await activate?.(true)
    },
  }
}
