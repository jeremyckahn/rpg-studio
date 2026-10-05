import { describe, expect, it } from 'vitest'

import { createHeadlessGame } from '../src'
import { buildProject, mapFromAscii, page, rows, text } from './fixtures'

const playerAt = (headless: ReturnType<typeof createHeadlessGame>) => {
  const { x, y, direction, moving } = headless.game.snapshot().player
  return { x, y, direction, moving }
}

describe('grid-aligned movement', () => {
  it('starts on the project start tile, facing the start direction', () => {
    const headless = createHeadlessGame(buildProject())
    expect(playerAt(headless)).toEqual({ x: 2, y: 3, direction: 'down', moving: false })
  })

  it('takes exactly 15 ticks per tile at the default 4 tiles per second', () => {
    const headless = createHeadlessGame(buildProject())
    headless.hold('right', 14)
    expect(playerAt(headless)).toMatchObject({ x: 2, moving: true })
    headless.hold('right', 1)
    expect(playerAt(headless)).toMatchObject({ x: 3 })
  })

  it('carries surplus progress so sustained input moves at exactly the configured speed', () => {
    const headless = createHeadlessGame(buildProject({ meta: { startX: 0, startY: 2 } }))
    headless.hold('right', 60)
    expect(headless.game.snapshot().player.x).toBe(4)
    headless.settle() // the step begun on the last tick still completes
    expect(headless.game.snapshot().player.x).toBe(5)
  })

  it('step() moves exactly one tile and leaves the player idle', () => {
    const headless = createHeadlessGame(buildProject())
    headless.step('right')
    expect(playerAt(headless)).toEqual({ x: 3, y: 3, direction: 'right', moving: false })
  })

  it('finishes a step in flight when input is released, then stops on a tile', () => {
    const headless = createHeadlessGame(buildProject())
    headless.hold('up', 5)
    expect(playerAt(headless).moving).toBe(true)
    headless.simulateTicks(30)
    expect(playerAt(headless)).toEqual({ x: 2, y: 2, direction: 'up', moving: false })
  })

  it('ignores direction changes until the current step completes', () => {
    const headless = createHeadlessGame(buildProject())
    headless.hold('right', 7)
    headless.hold('down', 8) // the right step completes on tick 15 and down begins at once
    expect(playerAt(headless)).toEqual({ x: 3, y: 3, direction: 'down', moving: true })
    headless.settle()
    expect(playerAt(headless)).toEqual({ x: 3, y: 4, direction: 'down', moving: false })
  })

  it('moves in all four directions', () => {
    const headless = createHeadlessGame(buildProject())
    const walk = (direction: 'up' | 'down' | 'left' | 'right') => {
      headless.step(direction)
      return playerAt(headless)
    }
    expect(walk('up')).toMatchObject({ x: 2, y: 2 })
    expect(walk('right')).toMatchObject({ x: 3, y: 2 })
    expect(walk('down')).toMatchObject({ x: 3, y: 3 })
    expect(walk('left')).toMatchObject({ x: 2, y: 3 })
  })
})

describe('collision', () => {
  it('turns to face a solid tile without entering it', () => {
    const headless = createHeadlessGame(buildProject({ meta: { startX: 3, startY: 2 } }))
    headless.hold('up', 40) // (3, 1) is a wall
    expect(playerAt(headless)).toEqual({ x: 3, y: 2, direction: 'up', moving: false })
  })

  it('blocks the map edges', () => {
    const headless = createHeadlessGame(buildProject({ meta: { startX: 0, startY: 0 } }))
    headless.hold('up', 30)
    headless.hold('left', 30)
    expect(playerAt(headless)).toMatchObject({ x: 0, y: 0 })
  })

  it('honours one-way ledges: BLOCK_RIGHT stops leaving to the right', () => {
    const headless = createHeadlessGame(buildProject({ meta: { startX: 9, startY: 2 } }))
    headless.hold('right', 30)
    expect(playerAt(headless)).toMatchObject({ x: 9 })
    headless.hold('left', 15)
    expect(playerAt(headless)).toMatchObject({ x: 8 })
  })

  it('is stopped by solid event entities and can walk through non-solid ones', () => {
    const headless = createHeadlessGame(buildProject({ meta: { startX: 5, startY: 4 } }))
    headless.hold('up', 40) // the Elder stands on (5, 3)
    expect(playerAt(headless)).toMatchObject({ x: 5, y: 4, direction: 'up', moving: false })
  })

  it('treats a solid entity as occupying the tile it is moving into', () => {
    const headless = createHeadlessGame(buildProject({ meta: { startX: 4, startY: 4 } }))
    const elder = [...headless.game.world.with('eventId', 'movement', 'position')].find(
      (e) => e.eventId === 1,
    )
    if (!elder) throw new Error('missing elder')
    headless.game.world.update(elder, 'movement', { ...elder.movement, intent: 'down' })
    headless.game.tick() // the elder starts stepping from (5, 3) to (5, 4)
    headless.hold('right', 5) // the player wants (5, 4): reserved by the elder
    expect(playerAt(headless)).toMatchObject({ x: 4, y: 4, moving: false })
  })
})

describe('event-driven movement locks', () => {
  it('freezes player input while a message is open', () => {
    const project = buildProject({
      maps: [
        mapFromAscii(1, rows('.....', '.....'), {
          events: [{ id: 1, x: 1, y: 0, pages: [page([text('Halt!')])] }],
        }),
      ],
      meta: { startX: 1, startY: 1, startDirection: 'up' },
    })
    const headless = createHeadlessGame(project)
    headless.pressConfirm()
    expect(headless.game.snapshot().message).toBe('Halt!')
    headless.hold('right', 40)
    expect(playerAt(headless)).toMatchObject({ x: 1, y: 1 })
    headless.pressConfirm()
    expect(headless.game.snapshot().message).toBeNull()
    headless.step('right')
    expect(playerAt(headless)).toMatchObject({ x: 2 })
  })
})
