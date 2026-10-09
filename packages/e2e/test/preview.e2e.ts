import { type Page } from '@playwright/test'

import { buildDemoGame } from '../support/demoGame.ts'
import { expect, test } from '../support/fixtures.ts'
import { type Studio } from '../support/studio.ts'

/** Presses a key for as long as it takes `done` to hold, so a test never depends on frame timing. */
const holdUntil = async (page: Page, key: string, done: () => Promise<boolean>): Promise<void> => {
  await page.keyboard.down(key)
  try {
    await expect.poll(done, { timeout: 8_000 }).toBe(true)
  } finally {
    await page.keyboard.up(key)
  }
}

const playerX = async (studio: Studio): Promise<number> =>
  (await studio.preview()).game?.player.x ?? -1

test.describe('Play tab', () => {
  test.describe('opening and playing', () => {
    test('sits between Map and Database and starts playing when opened', async ({
      studio,
      page,
    }) => {
      await expect(page.getByRole('tab')).toHaveText(['Map', 'Play', 'Database', 'Sprite Editor'])
      expect(await studio.preview()).toEqual({ open: false })

      await studio.openPlay()
      const report = await studio.preview()
      expect(report).toMatchObject({
        open: true,
        status: 'running',
        pausedFor: [],
        keepPlace: true,
      })
      expect(report.game).toMatchObject({ mapId: 1, player: { x: 10, y: 7 } })
      await expect(studio.gameStage.locator('canvas')).toBeVisible()
    })

    test('draws the game across the whole stage, not a collapsed corner of it', async ({
      studio,
    }) => {
      await studio.openPlay()
      const stage = await studio.gameStage.boundingBox()
      const canvas = await studio.gameStage.locator('canvas').boundingBox()
      if (!stage || !canvas) throw new Error('the game is not on screen')
      expect(stage.width).toBeGreaterThan(400)
      expect(stage.height).toBeGreaterThan(300)
      expect(canvas.width).toBeCloseTo(stage.width, -1)
      expect(canvas.height).toBeCloseTo(stage.height, -1)
    })

    test('runs the simulation: time passes and the arrow keys walk the player', async ({
      studio,
      page,
    }) => {
      await studio.openPlay()
      const before = (await studio.preview()).game?.tick ?? 0
      await studio.waitForGame((game) => game.tick > before + 5)
      await holdUntil(page, 'ArrowRight', async () => (await playerX(studio)) >= 12)
      expect((await studio.preview()).game?.player.direction).toBe('right')
    })

    test('runs the project’s events: an autorun greeting, then a conversation', async ({
      studio,
      page,
    }) => {
      await buildDemoGame(studio)
      await studio.openPlay()
      await expect(studio.gameMessage).toHaveText('Welcome to the village.')
      await page.keyboard.press('Enter')
      await expect(studio.gameMessage).toBeHidden()
      // The player starts facing down, toward the Elder.
      await page.keyboard.press('Enter')
      await expect(studio.gameMessage).toHaveText('First visit.')
      await page.keyboard.press('Enter')
      await expect(studio.gameMessage).toBeHidden()
      expect((await studio.preview()).game?.variables).toMatchObject({ '1': 1 })
    })

    test('follows a door to another map', async ({ studio, page }) => {
      await buildDemoGame(studio)
      await studio.openPlay()
      await page.keyboard.press('Enter') // the greeting
      await expect(studio.gameMessage).toBeHidden()
      await page.keyboard.press('ArrowUp')
      await studio.waitForGame((game) => game.mapId === 2)
      expect((await studio.preview()).game?.mapName).toBe('Cellar')
    })

    test('closes with the tab and starts fresh on the next visit', async ({ studio, page }) => {
      await studio.openPlay()
      await holdUntil(page, 'ArrowRight', async () => (await playerX(studio)) >= 12)
      await page.getByRole('tab', { name: 'Map' }).click()
      expect(await studio.preview()).toEqual({ open: false })
      await studio.openPlay()
      expect((await studio.preview()).game?.player).toMatchObject({ x: 10, y: 7 })
    })
  })

  test.describe('pausing', () => {
    test('the Pause button freezes the game and Resume continues it', async ({ studio, page }) => {
      await studio.openPlay()
      await page.getByRole('button', { name: 'Pause' }).click()
      await expect.poll(async () => (await studio.preview()).status).toBe('paused')
      expect((await studio.preview()).pausedFor).toContain('user')
      await expect(page.getByTestId('preview-status')).toHaveText('Paused')
      await expect(page.getByText('Click or press Enter to resume')).toBeVisible()

      const frozen = (await studio.preview()).game?.tick
      await page.waitForTimeout(600) // nothing should happen in this time
      expect((await studio.preview()).game?.tick).toBe(frozen)

      await page.getByRole('button', { name: 'Resume', exact: true }).click()
      await expect.poll(async () => (await studio.preview()).status).toBe('running')
      await studio.waitForGame((game) => game.tick > (frozen ?? 0) + 5)
    })

    test('Esc pauses and Enter resumes, and the Enter is not taken as a move or a confirm', async ({
      studio,
      page,
    }) => {
      await buildDemoGame(studio)
      await studio.openPlay()
      await expect(studio.gameMessage).toHaveText('Welcome to the village.')
      await page.keyboard.press('Enter')
      await expect(studio.gameMessage).toBeHidden()

      await page.keyboard.press('Escape')
      await expect.poll(async () => (await studio.preview()).status).toBe('paused')
      await page.keyboard.press('Enter')
      await expect.poll(async () => (await studio.preview()).status).toBe('running')
      // Facing the Elder, a confirm would have started a conversation.
      await page.waitForTimeout(400)
      await expect(studio.gameMessage).toBeHidden()
    })

    test('stops by itself when focus goes elsewhere, and clicking the game brings it back', async ({
      studio,
      page,
    }) => {
      await studio.openPlay()
      await page.getByRole('complementary', { name: 'Asset browser' }).click()
      await expect.poll(async () => (await studio.preview()).status).toBe('paused')
      expect((await studio.preview()).pausedFor).toEqual(['focus'])
      await expect(page.getByText('Click to play')).toBeVisible()

      await page.getByRole('button', { name: 'Resume the game' }).click()
      await expect.poll(async () => (await studio.preview()).status).toBe('running')
    })

    test('keeps playing while the pointer works the toolbar', async ({ studio, page }) => {
      await studio.openPlay()
      await page.getByRole('switch', { name: 'Keep my place when the project changes' }).focus()
      await page.waitForTimeout(400)
      expect((await studio.preview()).status).toBe('running')
    })

    test('stops while the browser tab is hidden, and a user pause survives its return', async ({
      studio,
      page,
    }) => {
      const hide = (hidden: boolean) =>
        page.evaluate((value) => {
          Reflect.defineProperty(document, 'hidden', { configurable: true, get: () => value })
          document.dispatchEvent(new Event('visibilitychange'))
        }, hidden)
      await studio.openPlay()
      await hide(true)
      await expect.poll(async () => (await studio.preview()).status).toBe('paused')
      expect((await studio.preview()).pausedFor).toEqual(['hidden'])
      await hide(false)
      await expect.poll(async () => (await studio.preview()).status).toBe('running')

      await page.getByRole('button', { name: 'Pause' }).click()
      await hide(true)
      await hide(false)
      await page.waitForTimeout(300)
      expect((await studio.preview()).status).toBe('paused')
      expect((await studio.preview()).pausedFor).toEqual(['user'])
    })

    test('disables Resume and Restart while there is no game to resume', async ({
      studio,
      page,
    }) => {
      await studio.dispatch({
        type: 'project/updateMeta',
        payload: { changes: { plugins: ['acme.ghost'] } },
      })
      await page.getByRole('tab', { name: 'Play' }).click()
      await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Restart' })).toBeDisabled()
    })
  })

  test.describe('a project that cannot be played', () => {
    test('says why instead of showing a black screen, and starts by itself when fixed', async ({
      studio,
      page,
    }) => {
      const enabled = await studio.dispatch({
        type: 'project/updateMeta',
        payload: { changes: { plugins: ['acme.ghost'] } },
      })
      expect(enabled.success).toBe(true)
      await page.getByRole('tab', { name: 'Play' }).click()
      await expect(page.getByText('The game cannot start')).toBeVisible()
      await expect(page.getByText(/Plugin "acme\.ghost" is enabled/)).toBeVisible()
      expect((await studio.preview()).status).toBe('failed')

      await studio.dispatch({ type: 'project/updateMeta', payload: { changes: { plugins: [] } } })
      await expect.poll(async () => (await studio.preview()).status).toBe('running')
      await expect(page.getByText('The game cannot start')).toBeHidden()
    })
  })

  test.describe('restart', () => {
    test('puts the player back at the start', async ({ studio, page }) => {
      await studio.openPlay()
      await holdUntil(page, 'ArrowRight', async () => (await playerX(studio)) >= 12)
      await page.getByRole('button', { name: 'Restart' }).click()
      await studio.waitForGame((game) => game.player.x === 10 && game.player.y === 7)
      expect((await studio.preview()).status).toBe('running')
    })
  })

  test.describe('keyboard shortcuts', () => {
    test('Ctrl+Z over the game undoes the last edit instead of confirming in the game', async ({
      studio,
      page,
    }) => {
      await studio.openPlay()
      const before = (await studio.summary()).revision
      await studio.dispatch({
        type: 'project/setTiles',
        payload: { mapId: 1, layer: 0, cells: [{ x: 0, y: 0, tile: 3 }] },
      })
      expect((await studio.summary()).revision).toBe(before + 1)
      await page.keyboard.press('Control+z')
      await expect.poll(async () => (await studio.summary()).revision).toBe(before)
      expect(await studio.tileAt(0, 0)).not.toBe(3)
      await expect(studio.gameMessage).toBeHidden()
    })
  })

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })

    test('shows the touch pad inside the game, above which the picture stays, and walks with it', async ({
      studio,
      page,
    }) => {
      await page.getByRole('tab', { name: 'Play' }).tap()
      await expect.poll(async () => (await studio.preview()).status).toBe('running')

      const pad = studio.gameStage.getByRole('button', { name: 'Directional pad' })
      await expect(pad).toBeVisible()
      await expect(studio.gameStage.getByRole('button', { name: 'Action' })).toBeVisible()
      const canvas = await studio.gameStage.locator('canvas').boundingBox()
      const padBox = await pad.boundingBox()
      if (!canvas || !padBox) throw new Error('the game is not on screen')
      expect(canvas.y + canvas.height).toBeLessThanOrEqual(padBox.y + 1)

      // Holding the right of the pad walks right.
      await page.mouse.move(padBox.x + padBox.width * 0.9, padBox.y + padBox.height / 2)
      await page.mouse.down()
      try {
        await studio.waitForGame((game) => game.player.x >= 12)
      } finally {
        await page.mouse.up()
      }
    })

    test('pauses from the toolbar and resumes by tapping the game', async ({ studio, page }) => {
      await page.getByRole('tab', { name: 'Play' }).tap()
      await expect.poll(async () => (await studio.preview()).status).toBe('running')
      await page.getByRole('button', { name: 'Pause' }).tap()
      await expect.poll(async () => (await studio.preview()).status).toBe('paused')
      await page.getByRole('button', { name: 'Resume the game' }).tap()
      await expect.poll(async () => (await studio.preview()).status).toBe('running')
    })
  })
})
