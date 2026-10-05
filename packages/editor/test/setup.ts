import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

// jsdom has no object URLs; components that preview assets need them.
if (typeof URL.createObjectURL !== 'function') {
  Reflect.defineProperty(URL, 'createObjectURL', { value: () => 'blob:test', configurable: true })
  Reflect.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, configurable: true })
}
