import { type Browser, type Page, devices } from '@playwright/test'

import { buildDemoGame } from '../support/demoGame.ts'
import { type DownloadedZip, downloadZip } from '../support/downloads.ts'
import { type ServedGame, serveFiles } from '../support/gameServer.ts'
import { expect, test } from '../support/fixtures.ts'
import { type Studio } from '../support/studio.ts'

/** Exports the open project and returns the unpacked files. */
const exportGame = (studio: Studio): Promise<DownloadedZip> =>
  downloadZip(studio.page, () => studio.chooseMenuItem('File', /Export game/))

/** The game's message box. It stays in the page, hidden, between messages. */
const message = (page: Page) => page.locator('[role="status"]')

const { defaultBrowserType: _browserType, ...phone } = devices['Pixel 7']

/** A tab in a phone-sized touch browser (the editor stays on the desktop one). */
const openOnPhone = async (browser: Browser, url: string): Promise<Page> => {
  const context = await browser.newContext(phone)
  const page = await context.newPage()
  await page.goto(url)
  return page
}

test.describe('exported game', () => {
  let served: ServedGame | null = null
  test.afterEach(async () => {
    await served?.close()
    served = null
  })

  /** Exports the demo game, serves it, and opens it in a new tab of the same browser context. */
  const play = async (studio: Studio): Promise<{ game: Page; zip: DownloadedZip }> => {
    await buildDemoGame(studio)
    const zip = await exportGame(studio)
    served = await serveFiles(zip.entries)
    const game = await studio.page.context().newPage()
    await game.goto(served.url)
    await expect(game.locator('canvas')).toBeVisible()
    return { game, zip }
  }

  /** Holds a key until `done` is true (or time runs out), so a test does not depend on frame timing. */
  const walk = async (page: Page, key: string, done: () => Promise<boolean>): Promise<void> => {
    await page.keyboard.down(key)
    try {
      await expect.poll(done, { timeout: 8_000 }).toBe(true)
    } finally {
      await page.keyboard.up(key)
    }
  }
  /** Closes the autorun greeting. Input is polled once per frame, so each press waits for its effect. */
  const dismissGreeting = async (page: Page): Promise<void> => {
    await expect(message(page)).toHaveText('Welcome to the village.')
    await page.keyboard.press('Enter')
    await expect(message(page)).toBeHidden()
  }
  /**
   * Presses Enter every so often until `text` is on screen. Each press is given time to take effect
   * before the message is read, because the next press would dismiss what the last one opened.
   */
  const talkUntil = async (page: Page, text: string): Promise<void> => {
    await expect
      .poll(async () => {
        await page.keyboard.press('Enter')
        await page.waitForTimeout(300)
        return ((await message(page).textContent()) ?? '').includes(text)
      })
      .toBe(true)
  }
  const messageShown = (page: Page, text: string) => async () =>
    ((await message(page).textContent()) ?? '').includes(text)

  test('boots, draws the map and runs an autorun event on the first frame', async ({ studio }) => {
    const { game } = await play(studio)
    await expect(game).toHaveTitle('My Game')
    await expect(message(game)).toHaveText('Welcome to the village.')
    await expect(message(game)).toBeVisible()
  })

  test('a message is dismissed with Enter and an autorun event does not repeat', async ({
    studio,
  }) => {
    const { game } = await play(studio)
    await expect(message(game)).toHaveText('Welcome to the village.')
    await game.keyboard.press('Enter')
    await expect(message(game)).toBeHidden()
    await game.waitForTimeout(500)
    await expect(message(game)).toBeHidden()
  })

  test('Space and Z confirm as well', async ({ studio }) => {
    const { game } = await play(studio)
    await expect(message(game)).toHaveText('Welcome to the village.')
    await game.keyboard.press('Space')
    await expect(message(game)).toBeHidden()
    // Talk to the Elder (the player faces down at the start), then dismiss with Z.
    await game.keyboard.press('Enter')
    await expect(message(game)).toHaveText('First visit.')
    await game.keyboard.press('KeyZ')
    await expect(message(game)).toBeHidden()
  })

  test('talking to an NPC runs its commands, with variables and branches', async ({ studio }) => {
    const { game } = await play(studio)
    await dismissGreeting(game)
    await game.keyboard.press('Enter') // talk to the Elder, who is directly below the player
    await expect(message(game)).toHaveText('First visit.')
    await game.keyboard.press('Enter')
    await expect(message(game)).toBeHidden()
    await game.keyboard.press('Enter')
    await expect(message(game)).toHaveText('You again.')
  })

  test('the player cannot walk through a solid cell', async ({ studio }) => {
    const { game } = await play(studio)
    await dismissGreeting(game)
    // The wall at (9, 7) stands between the player and the probe at (8, 7).
    await game.keyboard.down('ArrowLeft')
    await game.waitForTimeout(1500)
    await game.keyboard.up('ArrowLeft')
    await expect(message(game)).toBeHidden()
    // The way right is open: stepping onto the probe at (11, 7) triggers it.
    await walk(game, 'ArrowRight', messageShown(game, 'Reached the right probe.'))
  })

  test('WASD moves the player like the arrow keys', async ({ studio }) => {
    const { game } = await play(studio)
    await dismissGreeting(game)
    await walk(game, 'KeyD', messageShown(game, 'Reached the right probe.'))
  })

  test('an NPC blocks the way', async ({ studio }) => {
    const { game } = await play(studio)
    await dismissGreeting(game)
    // Walking down into the Elder does nothing by itself; only Enter talks to them.
    await game.keyboard.down('ArrowDown')
    await game.waitForTimeout(800)
    await game.keyboard.up('ArrowDown')
    await expect(message(game)).toBeHidden()
    await game.keyboard.press('Enter')
    await expect(message(game)).toHaveText('First visit.')
  })

  test('a door transfers the player to another map and back', async ({ studio }) => {
    const { game } = await play(studio)
    await dismissGreeting(game)
    // A key press shorter than a frame still moves exactly one tile, onto the door at (10, 6).
    await game.keyboard.press('ArrowUp')
    // On the Cellar map the cat is directly below the arrival point (5, 3), so Enter reaches it
    // only if the transfer happened; on the Village map nothing answers.
    await talkUntil(game, 'Meow.')
    await game.keyboard.press('Enter')
    await expect(message(game)).toBeHidden()

    // One step up is the stairs at (5, 2), back to the Village beside the Elder.
    await game.keyboard.press('ArrowUp')
    await talkUntil(game, 'First visit.')
  })

  test('draws something different after the player moves', async ({ studio }) => {
    const { game } = await play(studio)
    await dismissGreeting(game)
    await game.waitForTimeout(300)
    const before = await game.locator('canvas').screenshot()
    await game.keyboard.down('ArrowRight')
    await game.waitForTimeout(600)
    await game.keyboard.up('ArrowRight')
    await game.keyboard.press('Enter')
    await game.waitForTimeout(300)
    expect((await game.locator('canvas').screenshot()).equals(before)).toBe(false)
  })

  test('only ever requests files that were exported', async ({ studio }) => {
    const { game, zip } = await play(studio)
    await expect(message(game)).toBeVisible()
    const shipped = new Set(Object.keys(zip.entries).map((path) => `/${path}`))
    const asked = (served?.requests() ?? []).filter(
      (path) => path !== '/' && path !== '/favicon.ico',
    )
    expect(asked.length).toBeGreaterThan(4)
    expect(asked.filter((path) => !shipped.has(path))).toEqual([])
    expect(asked).toEqual(
      expect.arrayContaining(['/game.json', '/project.json', '/engine/player.js']),
    )
    expect(asked.some((path) => /piskel|editor/i.test(path))).toBe(false)
  })

  test('has no console errors while playing', async ({ studio }) => {
    const { game } = await play(studio)
    const errors: string[] = []
    // eslint-disable-next-line functional/immutable-data -- collecting events raised by browser callbacks
    game.on('console', (entry) => entry.type() === 'error' && errors.push(entry.text()))
    await dismissGreeting(game)
    await walk(game, 'ArrowRight', messageShown(game, 'Reached the right probe.'))
    expect(errors).toEqual([])
  })

  test('shows a readable error instead of a blank page when the data is broken', async ({
    studio,
    context,
    problems,
  }) => {
    problems.allow(/./)
    await buildDemoGame(studio)
    const zip = await exportGame(studio)
    served = await serveFiles({
      ...zip.entries,
      'maps/map-001.json': new TextEncoder().encode('{ "id": "not a number" }'),
    })
    const game = await context.newPage()
    await game.goto(served.url)
    await expect(game.locator('pre')).toContainText('The game data is invalid')
    await expect(game.locator('pre')).toContainText('maps/map-001.json')
  })

  test('reports a missing game.json', async ({ studio, context, problems }) => {
    problems.allow(/./)
    const zip = await exportGame(studio)
    const { 'game.json': _removed, ...rest } = zip.entries
    served = await serveFiles(rest)
    const game = await context.newPage()
    await game.goto(served.url)
    await expect(game.locator('pre')).toContainText('Could not load game.json (404)')
  })
})

test.describe('exported game on a phone', () => {
  let served: ServedGame | null = null
  test.afterEach(async () => {
    await served?.close()
    served = null
  })

  test('shows a D-pad and an action button that drive the game', async ({ studio, browser }) => {
    await buildDemoGame(studio)
    const zip = await exportGame(studio)
    served = await serveFiles(zip.entries)
    const game = await openOnPhone(browser, served.url)

    const pad = game.getByRole('button', { name: 'Directional pad' })
    const action = game.getByRole('button', { name: 'Action' })
    await expect(pad).toBeVisible()
    await expect(action).toBeVisible()
    await expect(message(game)).toHaveText('Welcome to the village.')

    // A tap on A dismisses the message, a second one talks to the Elder below the player.
    await action.tap()
    await expect(message(game)).toBeHidden()
    await action.tap()
    await expect(message(game)).toHaveText('First visit.')
    await action.tap()
    await expect(message(game)).toBeHidden()

    // Holding the right side of the pad walks right, onto the probe at (11, 7).
    const box = await pad.boundingBox()
    if (!box) throw new Error('pad not visible')
    await game.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2)
    await game.mouse.down()
    await expect(message(game)).toHaveText('Reached the right probe.', { timeout: 8_000 })
    await game.mouse.up()
  })

  test('keeps the game above the controls in portrait', async ({ studio, browser }) => {
    await buildDemoGame(studio)
    const zip = await exportGame(studio)
    served = await serveFiles(zip.entries)
    const game = await openOnPhone(browser, served.url)
    const canvas = await game.locator('canvas').boundingBox()
    const pad = await game.getByRole('button', { name: 'Directional pad' }).boundingBox()
    if (!canvas || !pad) throw new Error('game not visible')
    expect(canvas.y + canvas.height).toBeLessThanOrEqual(pad.y + 1)
  })
})

test.describe('exported game on a desktop', () => {
  test('has no touch controls', async ({ studio, context }) => {
    await buildDemoGame(studio)
    const zip = await exportGame(studio)
    const served = await serveFiles(zip.entries)
    try {
      const game = await context.newPage()
      await game.goto(served.url)
      await expect(game.locator('canvas')).toBeVisible()
      await expect(game.getByRole('button', { name: 'Directional pad' })).toHaveCount(0)
    } finally {
      await served.close()
    }
  })
})
