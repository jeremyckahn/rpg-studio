import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  // `mockViewport` installs matchMedia; jsdom has none by default.
  if (typeof window !== 'undefined') {
    Reflect.deleteProperty(window, 'matchMedia')
    // Tests that need folder support install a picker; it must not leak into the next test.
    Reflect.deleteProperty(window, 'showDirectoryPicker')
  }
})

// jsdom has no object URLs; components that preview assets need them.
if (typeof URL.createObjectURL !== 'function') {
  Reflect.defineProperty(URL, 'createObjectURL', { value: () => 'blob:test', configurable: true })
  Reflect.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, configurable: true })
}
