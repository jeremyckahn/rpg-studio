import { describe, expect, it } from 'vitest'

import { PACKAGE_NAME } from '../src'

describe('@rpgstudio/editor', () => {
  it('identifies itself', () => {
    expect(PACKAGE_NAME).toBe('@rpgstudio/editor')
  })
})
