import { describe, expect, it } from 'vitest'

import { PACKAGE_NAME } from '../src'

describe('@rpgstudio/core', () => {
  it('identifies itself', () => {
    expect(PACKAGE_NAME).toBe('@rpgstudio/core')
  })
})
