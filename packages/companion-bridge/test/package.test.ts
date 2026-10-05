import { describe, expect, it } from 'vitest'

import { PACKAGE_NAME } from '../src'

describe('@rpgstudio/companion-bridge', () => {
  it('identifies itself', () => {
    expect(PACKAGE_NAME).toBe('@rpgstudio/companion-bridge')
  })
})
