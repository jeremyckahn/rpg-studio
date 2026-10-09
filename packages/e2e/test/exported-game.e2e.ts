import { type Browser, type Page, devices } from '@playwright/test'

import {
  CELLAR_NOTICE,
  VILLAGE_NOTICE,
  addTransferNotices,
  buildDemoGame,
} from '../support/demoGame.ts'
import { type DownloadedZip, downloadZip } from '../support/downloads.ts'
import { type ServedGame, serveFiles } from '../support/gameServer.ts'
import { expect, test as base } from '../support/fixtures.ts'
import { createStudio } from '../support/studio.ts'

/**
 * Building the demo game through the editor and exporting it takes most of the time of every
 * test here, and none of them needs its own copy: they only play it. So it is exported once per
 * worker, in a throwaway editor tab, and each test serves the same files. Tests must not change
 * the entries (the ones that need a broken game spread them into a new object).
 */
const test = base.extend<object, { demoGame: DownloadedZip }>({
  demoGame: [
    async ({ browser }, use, workerInfo) => {
      // A worker fixture cannot see the test-scoped page options, so it takes them from the project.
      const { baseURL, viewport, userAgent, serviceWorkers } = workerInfo.project.use
      const context = await browser.newContext({
        ...(baseURL ? { baseURL } : {}),
        ...(viewport ? { viewport } : {}),
        ...(userAgent ? { userAgent } : {}),
        ...(serviceWorkers ? { serviceWorkers } : {}),
      })
      try {
        const studio = createStudio(await context.newPage())
        await studio.open()
        await buildDemoGame(studio)
        await addTransferNotices(studio)
        const zip = await downloadZip(studio.page, () =>
          studio.chooseMenuItem('File', /Export game/),
        )
        await use(zip)
      } finally {
        await context.close()
      }
    },
    { scope: 'worker', timeout: 120_000 },
  ],
})

// No test here touches the editor, only the exported game.
test.use({ openEditor: false })

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

  /** Serves the shared demo game and opens it in a new tab of the test's browser context. */
  const play = async (
    page: Page,
    zip: DownloadedZip,
  ): Promise<{ game: Page; zip: DownloadedZip }> => {
    served = await serveFiles(zip.entries)
    const game = await page.context().newPage()
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
  const messageShown = (page: Page, text: string) => async () =>
    ((await message(page).textContent()) ?? '').includes(text)

  test('boots, draws the map and runs an autorun event on the first frame', async ({
    page,
    demoGame,
  }) => {
    const { game } = await play(page, demoGame)
    await expect(game).toHaveTitle('My Game')
    await expect(message(game)).toHaveText('Welcome to the village.')
    await expect(message(game)).toBeVisible()
  })

  test('talking to an NPC runs its commands, with variables and branches', async ({
    page,
    demoGame,
  }) => {
    const { game } = await play(page, demoGame)
    await dismissGreeting(game)
    await game.keyboard.press('Enter') // talk to the Elder, who is directly below the player
    await expect(message(game)).toHaveText('First visit.')
    await game.keyboard.press('Enter')
    await expect(message(game)).toBeHidden()
    await game.keyboard.press('Enter')
    await expect(message(game)).toHaveText('You again.')
  })

  test('a door transfers the player to another map and back', async ({ page, demoGame }) => {
    const { game } = await play(page, demoGame)
    await dismissGreeting(game)
    // A key press shorter than a frame still moves exactly one tile, onto the door at (10, 6).
    await game.keyboard.press('ArrowUp')
    // The Cellar's notice speaks on arrival: that is the transfer, observed rather than awaited.
    await expect(message(game)).toHaveText(CELLAR_NOTICE)
    await game.keyboard.press('Enter')
    await expect(message(game)).toBeHidden()
    // The cat is directly below the arrival point (5, 3), so Enter reaches it only on the Cellar
    // map, at the right spot; on the Village map nothing answers.
    await game.keyboard.press('Enter')
    await expect(message(game)).toHaveText('Meow.')
    await game.keyboard.press('Enter')
    await expect(message(game)).toBeHidden()

    // One step up is the stairs at (5, 2), back to the Village beside the Elder.
    await game.keyboard.press('ArrowUp')
    await expect(message(game)).toHaveText(VILLAGE_NOTICE)
    await game.keyboard.press('Enter')
    await expect(message(game)).toBeHidden()
    await game.keyboard.press('Enter')
    await expect(message(game)).toHaveText('First visit.')
  })

  test('draws something different after the player moves', async ({ page, demoGame }) => {
    const { game } = await play(page, demoGame)
    await dismissGreeting(game)
    const canvas = game.locator('canvas')
    const before = await canvas.screenshot()
    await walk(game, 'ArrowRight', messageShown(game, 'Reached the right probe.'))
    // The message box is part of the picture too: close it, so only the player's move is compared.
    await game.keyboard.press('Enter')
    await expect(message(game)).toBeHidden()
    await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(false)
  })

  test('only ever requests files that were exported', async ({ page, demoGame }) => {
    const { game, zip } = await play(page, demoGame)
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

  test('has no console errors while playing', async ({ page, demoGame }) => {
    const { game } = await play(page, demoGame)
    const errors: string[] = []
    // eslint-disable-next-line functional/immutable-data -- collecting events raised by browser callbacks
    game.on('console', (entry) => entry.type() === 'error' && errors.push(entry.text()))
    await dismissGreeting(game)
    await walk(game, 'ArrowRight', messageShown(game, 'Reached the right probe.'))
    expect(errors).toEqual([])
  })
})

test.describe('exported game on a phone', () => {
  let served: ServedGame | null = null
  test.afterEach(async () => {
    await served?.close()
    served = null
  })

  test('shows a D-pad and an action button that drive the game', async ({ demoGame, browser }) => {
    served = await serveFiles(demoGame.entries)
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

  test('keeps the game above the controls in portrait', async ({ demoGame, browser }) => {
    served = await serveFiles(demoGame.entries)
    const game = await openOnPhone(browser, served.url)
    const canvas = await game.locator('canvas').boundingBox()
    const pad = await game.getByRole('button', { name: 'Directional pad' }).boundingBox()
    if (!canvas || !pad) throw new Error('game not visible')
    expect(canvas.y + canvas.height).toBeLessThanOrEqual(pad.y + 1)
  })
})

test.describe('exported game on a desktop', () => {
  test('has no touch controls', async ({ demoGame, context }) => {
    const served = await serveFiles(demoGame.entries)
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
