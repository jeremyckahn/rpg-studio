/**
 * Registers the service worker that makes the editor installable and usable
 * offline. It does nothing in development, where a cached shell would only get
 * in the way of live reloading.
 */
export const registerServiceWorker = async (): Promise<void> => {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const { registerSW } = await import('virtual:pwa-register')
  registerSW({ immediate: true })
}
