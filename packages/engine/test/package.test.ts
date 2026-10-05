import { describe, expect, it } from 'vitest'

import { PACKAGE_NAME } from '../src'

describe('@rpgstudio/engine', () => {
  it('identifies itself', () => {
    expect(PACKAGE_NAME).toBe('@rpgstudio/engine')
  })
})
