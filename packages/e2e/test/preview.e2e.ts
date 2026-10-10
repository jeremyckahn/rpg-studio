import { type Page } from '@playwright/test'

import { buildDemoGame } from '../support/demoGame.ts'
import { solidPng } from '../support/files.ts'
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

/** Waits until the Play tab has replaced its game `count` times (a reload or a restart each count once). */
const reloaded = async (studio: Studio, count: number): Promise<void> => {
  await expect.poll(async () => (await studio.preview()).reloads).toBe(count)
}

/** Makes the cell solid, the smallest edit whose effect on the game can be walked into. */
const wall = (studio: Studio, x: number, y: number) =>
  studio.dispatch({
    type: 'project/setCollision',
    payload: { mapId: 1, cells: [{ x, y, flags: 1 }] },
  })

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

  test.describe('live reload', () => {
    test('an edit while playing takes effect without losing your place or the time played', async ({
      studio,
      page,
    }) => {
      await studio.openPlay()
      await holdUntil(page, 'ArrowRight', async () => (await playerX(studio)) >= 12)
      await expect.poll(async () => (await studio.preview()).game?.player.moving).toBe(false)
      const before = (await studio.preview()).game
      if (!before) throw new Error('no game')

      await wall(studio, before.player.x + 1, before.player.y)
      await reloaded(studio, 1)

      const after = (await studio.preview()).game
      expect(after?.player).toMatchObject({ x: before.player.x, y: before.player.y })
      expect(after?.tick).toBeGreaterThanOrEqual(before.tick)
      expect((await studio.preview()).notice).toBeNull()

      // The new wall is really in the rebuilt game: the player cannot walk through it.
      await page.keyboard.down('ArrowRight')
      await page.waitForTimeout(700) // nothing should happen in this time
      await page.keyboard.up('ArrowRight')
      expect((await studio.preview()).game?.player.x).toBe(before.player.x)
    })

    test('with Keep my place off, an edit starts the game again from the beginning', async ({
      studio,
      page,
    }) => {
      await studio.openPlay()
      await page.getByRole('switch', { name: 'Keep my place when the project changes' }).click()
      expect((await studio.preview()).keepPlace).toBe(false)
      await holdUntil(page, 'ArrowRight', async () => (await playerX(studio)) >= 12)

      await wall(studio, 0, 0)
      await reloaded(studio, 1)
      await studio.waitForGame((game) => game.player.x === 10 && game.player.y === 7)
    })

    test('a burst of edits reloads once, after they stop', async ({ studio }) => {
      await studio.openPlay()
      for (let x = 0; x < 6; x += 1) await wall(studio, x, 0)
      await reloaded(studio, 1)
      await studio.page.waitForTimeout(800) // nothing should happen in this time
      expect((await studio.preview()).reloads).toBe(1)
    })

    test('undo and redo reload too', async ({ studio, page }) => {
      await studio.openPlay()
      await wall(studio, 0, 0)
      await reloaded(studio, 1)
      await page.keyboard.press('Control+z')
      await reloaded(studio, 2)
      expect(await studio.collisionAt(0, 0)).toBe(0)
      await page.keyboard.press('Control+Shift+z')
      await reloaded(studio, 3)
      expect(await studio.collisionAt(0, 0)).toBe(1)
    })

    test('waits while paused, says so, and catches up once on resume before the first tick', async ({
      studio,
      page,
    }) => {
      await studio.openPlay()
      await page.getByRole('button', { name: 'Pause' }).click()
      await expect.poll(async () => (await studio.preview()).status).toBe('paused')

      await wall(studio, 0, 0)
      await wall(studio, 1, 0)
      await expect.poll(async () => (await studio.preview()).pendingChange).toBe(true)
      await expect(
        page.getByText(/The project changed; the game updates when you resume/),
      ).toBeVisible()
      await page.waitForTimeout(700) // nothing should happen in this time
      expect((await studio.preview()).reloads).toBe(0)

      await page.getByRole('button', { name: 'Resume', exact: true }).click()
      await reloaded(studio, 1)
      await expect.poll(async () => (await studio.preview()).status).toBe('running')
      expect((await studio.preview()).pendingChange).toBe(false)
      await expect(page.getByText(/The project changed; the game updates/)).toBeHidden()
    })

    test('a cutscene that is running when the project changes plays again from its start', async ({
      studio,
      page,
    }) => {
      await buildDemoGame(studio)
      await studio.openPlay()
      await expect(studio.gameMessage).toHaveText('Welcome to the village.')

      await wall(studio, 0, 0)
      await reloaded(studio, 1)
      await expect(studio.gameMessage).toHaveText('Welcome to the village.')
      await page.keyboard.press('Enter')
      await expect(studio.gameMessage).toBeHidden()
    })

    test('a place the new project no longer has starts the game again and says why', async ({
      studio,
      page,
    }) => {
      await studio.openPlay()
      await holdUntil(page, 'ArrowRight', async () => (await playerX(studio)) >= 14)
      await expect.poll(async () => (await studio.preview()).game?.player.moving).toBe(false)

      // Shrinking the map takes the player's tile away.
      const resized = await studio.dispatch({
        type: 'project/resizeMap',
        payload: { mapId: 1, width: 12, height: 15 },
      })
      expect(resized.success).toBe(true)
      await reloaded(studio, 1)
      const report = await studio.preview()
      expect(report.notice?.severity).toBe('warning')
      expect(report.notice?.text).toMatch(/^Restarted from the beginning:/)
      await expect(page.getByText(/Restarted from the beginning/)).toBeVisible()
      expect(report.game?.player.x).toBeLessThan(12)
      expect(report.status).toBe('running')
    })

    test('keeps the game it has and names the problem when an edit makes it unplayable, then recovers', async ({
      studio,
      page,
    }) => {
      await studio.openPlay()
      await studio.dispatch({
        type: 'project/updateMeta',
        payload: { changes: { plugins: ['acme.ghost'] } },
      })
      await expect.poll(async () => (await studio.preview()).notice?.severity).toBe('error')
      await expect(page.getByText(/Not reloaded\. .*acme\.ghost/)).toBeVisible()
      const report = await studio.preview()
      expect(report.status).toBe('running')
      expect(report.reloads).toBe(0)
      const tick = report.game?.tick ?? 0
      await studio.waitForGame((game) => game.tick > tick + 5)

      await studio.dispatch({ type: 'project/updateMeta', payload: { changes: { plugins: [] } } })
      await reloaded(studio, 1)
      expect((await studio.preview()).notice).toBeNull()
      await expect(page.getByText(/Not reloaded/)).toBeHidden()
    })

    test('a picture saved while you were elsewhere is on screen when you come back', async ({
      studio,
      page,
    }) => {
      await studio.openPlay()
      const before = await studio.gameStage.locator('canvas').screenshot()

      // Uploading takes focus away, which pauses the game; the new tileset waits for the resume.
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      const chooser = page.waitForEvent('filechooser')
      await page.getByRole('menuitem', { name: 'Tileset image' }).click()
      await (
        await chooser
      ).setFiles([
        {
          name: 'basic.png',
          mimeType: 'image/png',
          buffer: solidPng(128, 128, [10, 200, 90, 255]),
        },
      ])
      await expect.poll(async () => (await studio.preview()).status).toBe('paused')
      await expect.poll(async () => (await studio.preview()).pendingChange).toBe(true)

      await page.getByRole('button', { name: 'Resume the game' }).click()
      await reloaded(studio, 1)
      await expect
        .poll(async () => (await studio.gameStage.locator('canvas').screenshot()).equals(before))
        .toBe(false)
    })
  })

  test.describe('Play from here', () => {
    test('starts the game on the clicked tile and brings back the tool you were using', async ({
      studio,
      page,
    }) => {
      await studio.selectTool(/Collision/)
      await studio.selectTool(/Play from here/)
      await studio.clickCell({ x: 4, y: 3 })

      await expect(page.getByRole('tab', { name: 'Play' })).toHaveAttribute('aria-selected', 'true')
      await expect.poll(async () => (await studio.preview()).status).toBe('running')
      expect((await studio.preview()).game?.player).toMatchObject({ x: 4, y: 3 })
      expect((await studio.preview()).start).toEqual({ mapId: 1, x: 4, y: 3 })
      await expect(page.getByText('Starting at Map 1 (4, 3)')).toBeVisible()

      await page.getByRole('tab', { name: 'Map' }).click()
      await expect(page.getByRole('button', { name: /^Collision/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(page.getByRole('button', { name: /^Play from here/ })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
    })

    test('changes nothing in the project, and does not count as unsaved work', async ({
      studio,
    }) => {
      const before = await studio.summary()
      await studio.selectTool(/Play from here/)
      await studio.clickCell({ x: 4, y: 3 })
      await expect.poll(async () => (await studio.preview()).status).toBe('running')
      const after = await studio.summary()
      expect(after.revision).toBe(before.revision)
      expect(after).toMatchObject({ startX: before.startX, startY: before.startY })
      await expect(studio.projectTitle).toHaveText('My Game')
    })

    test('is still where a later reload starts from, when the place is not kept', async ({
      studio,
      page,
    }) => {
      await studio.selectTool(/Play from here/)
      await studio.clickCell({ x: 4, y: 3 })
      await expect.poll(async () => (await studio.preview()).status).toBe('running')
      await page.getByRole('switch', { name: 'Keep my place when the project changes' }).click()
      await studio.waitForGame((game) => game.tick > 5)

      await wall(studio, 0, 0)
      await reloaded(studio, 1)
      await studio.waitForGame((game) => game.player.x === 4 && game.player.y === 3)
    })

    test('the chip clears it and starts again from the project’s own start', async ({
      studio,
      page,
    }) => {
      await studio.selectTool(/Play from here/)
      await studio.clickCell({ x: 4, y: 3 })
      await expect(page.getByText('Starting at Map 1 (4, 3)')).toBeVisible()
      await page.getByRole('img', { name: 'Use the project start' }).click()
      await expect(page.getByText(/Starting at/)).toBeHidden()
      await studio.waitForGame((game) => game.player.x === 10 && game.player.y === 7)
      expect((await studio.preview()).start).toBeNull()
      // The next visit begins at the project start too.
      await page.getByRole('tab', { name: 'Map' }).click()
      await studio.openPlay()
      expect((await studio.preview()).game?.player).toMatchObject({ x: 10, y: 7 })
    })

    test('plays from a tile on another map', async ({ studio, page }) => {
      await buildDemoGame(studio)
      await page.getByRole('button', { name: 'Cellar 10×8' }).click()
      await studio.selectTool(/Play from here/)
      await studio.clickCell({ x: 2, y: 2 }, { mapId: 2 })
      await expect.poll(async () => (await studio.preview()).status).toBe('running')
      expect((await studio.preview()).game).toMatchObject({ mapId: 2, player: { x: 2, y: 2 } })
    })

    test('a start that the project can no longer hold is dropped quietly', async ({
      studio,
      page,
    }) => {
      await studio.selectTool(/Play from here/)
      await studio.clickCell({ x: 18, y: 12 })
      await expect(page.getByText('Starting at Map 1 (18, 12)')).toBeVisible()
      await page.getByRole('tab', { name: 'Map' }).click()
      await studio.dispatch({
        type: 'project/resizeMap',
        payload: { mapId: 1, width: 12, height: 12 },
      })
      await studio.openPlay()
      await expect(page.getByText(/Starting at/)).toBeHidden()
      expect((await studio.preview()).game?.player).toMatchObject({ x: 10, y: 7 })
    })
  })

  test.describe('Debug panel', () => {
    test('shows the game’s state beside it, and only on the Play tab', async ({ studio, page }) => {
      const debug = page
        .getByRole('complementary', { name: 'right panels' })
        .getByTestId('preview-debug')
      await expect(debug).toBeHidden()
      await studio.openPlay()
      await expect(debug).toBeVisible()
      await expect(debug).toContainText('Map 1 (#1)')
      await expect(debug).toContainText('10, 7')
      await expect(debug).toContainText('Hero')
      await page.getByRole('tab', { name: 'Map' }).click()
      await expect(debug).toBeHidden()
    })

    test('follows the player, and lists switches and variables by name', async ({
      studio,
      page,
    }) => {
      await buildDemoGame(studio)
      await studio.dispatch({
        type: 'project/updateMeta',
        payload: {
          changes: { switchNames: { '2': 'Greeted' }, variableNames: { '1': 'Elder visits' } },
        },
      })
      await studio.openPlay()
      const debug = page.getByTestId('preview-debug')
      await expect(studio.gameMessage).toHaveText('Welcome to the village.')
      await page.keyboard.press('Enter')
      await expect(debug).toContainText('Greeted')
      await expect(debug).toContainText('ON')
      await page.keyboard.press('Enter') // talk to the Elder, who counts visits
      await expect(studio.gameMessage).toHaveText('First visit.')
      await expect(debug).toContainText('Elder visits')
      await expect(debug).toContainText('Message')
      await expect(debug).toContainText('First visit.')
      await page.keyboard.press('Enter')
      await expect(studio.gameMessage).toBeHidden()
      await holdUntil(page, 'ArrowRight', async () => (await playerX(studio)) >= 11)
      await studio.waitForGame((game) => !game.player.moving)
      const { x, y } = (await studio.preview()).game?.player ?? { x: -1, y: -1 }
      await expect(debug).toContainText(`${x}, ${y}`)
    })

    test('clicking in it pauses the game like clicking anywhere outside it, and says Paused', async ({
      studio,
      page,
    }) => {
      await studio.openPlay()
      await page.getByTestId('preview-debug').click()
      await expect.poll(async () => (await studio.preview()).status).toBe('paused')
      await expect(page.getByTestId('preview-debug')).toContainText('Paused')
    })
  })

  test.describe('staying healthy', () => {
    test('many reloads in a row keep one working game on the same canvas', async ({ studio }) => {
      await studio.openPlay()
      for (let round = 1; round <= 15; round += 1) {
        await wall(studio, round % 20, 0)
        await reloaded(studio, round)
      }
      const report = await studio.preview()
      expect(report.status).toBe('running')
      expect(report.notice).toBeNull()
      await expect(studio.gameStage.locator('canvas')).toHaveCount(1)
      const tick = report.game?.tick ?? 0
      await studio.waitForGame((game) => game.tick > tick + 5)
    })

    test('opening and leaving the tab many times leaves no extra canvases or stuck games', async ({
      studio,
      page,
    }) => {
      for (let round = 0; round < 10; round += 1) {
        await studio.openPlay()
        await page.getByRole('tab', { name: 'Map' }).click()
        await expect(page.getByRole('application', { name: 'Game preview' })).toHaveCount(0)
      }
      await studio.openPlay()
      await expect(studio.gameStage.locator('canvas')).toHaveCount(1)
      expect((await studio.preview()).reloads).toBe(0)
      const tick = (await studio.preview()).game?.tick ?? 0
      await studio.waitForGame((game) => game.tick > tick + 5)
    })

    test('keeps showing the last picture while paused, instead of going blank', async ({
      studio,
      page,
    }) => {
      await studio.openPlay()
      await page.getByRole('button', { name: 'Pause' }).click()
      await expect.poll(async () => (await studio.preview()).status).toBe('paused')
      // The overlay only dims the game. A blank canvas would be a uniform black image, which
      // compresses to almost nothing; the tile map does not.
      const picture = await studio.gameStage.screenshot()
      expect(picture.byteLength).toBeGreaterThan(8_000)
    })

    test('redraws a paused game after the window changes size', async ({ studio, page }) => {
      await studio.openPlay()
      await page.getByRole('button', { name: 'Pause' }).click()
      await expect.poll(async () => (await studio.preview()).status).toBe('paused')
      await page.setViewportSize({ width: 1100, height: 700 })
      await expect
        .poll(async () => (await studio.gameStage.screenshot()).byteLength, { timeout: 8_000 })
        .toBeGreaterThan(8_000)
      const stage = await studio.gameStage.boundingBox()
      const canvas = await studio.gameStage.locator('canvas').boundingBox()
      expect(canvas?.width).toBeCloseTo(stage?.width ?? 0, -1)
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

    test('draws the Keep my place switch whole, with a finger-sized row to tap', async ({
      studio,
      page,
    }) => {
      await page.getByRole('tab', { name: 'Play' }).tap()
      await expect.poll(async () => (await studio.preview()).status).toBe('running')

      // On a touch screen every button grows to 44px, which once inflated the switch's thumb out
      // of its track (it looked squashed, with a quarter-circle thumb beside it).
      const keep = page.getByRole('switch', { name: 'Keep my place when the project changes' })
      const sizes = await keep.evaluate((input) => {
        const thumbHolder = input.parentElement?.getBoundingClientRect()
        const track = input.parentElement?.parentElement?.getBoundingClientRect()
        const row = input.closest('label')?.getBoundingClientRect()
        return { thumb: thumbHolder?.width, track: track?.width, row: row?.height }
      })
      expect(sizes.thumb).toBeLessThanOrEqual(26)
      expect(sizes.track).toBe(40)
      expect(sizes.row).toBeGreaterThanOrEqual(44)

      await keep.setChecked(false)
      await expect(keep).not.toBeChecked()
      await keep.setChecked(true)
      await expect(keep).toBeChecked()
    })

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

    test('shows the Debug panel in the bottom sheet', async ({ studio, page }) => {
      await page.getByRole('tab', { name: 'Play' }).tap()
      await expect.poll(async () => (await studio.preview()).status).toBe('running')
      await page.getByRole('button', { name: 'Debug' }).tap()
      await expect(
        page.getByRole('complementary', { name: 'Debug sheet' }).getByTestId('preview-debug'),
      ).toContainText('Map 1 (#1)')
    })

    test('starts the game on a tapped tile with the Play from here tool', async ({
      studio,
      page,
    }) => {
      await page.getByRole('button', { name: /^Play from here/ }).tap()
      const at = await studio.cellPoint({ x: 9, y: 6 }, { zoom: 3 })
      await page.touchscreen.tap(at.x, at.y)
      await expect.poll(async () => (await studio.preview()).status).toBe('running')
      expect((await studio.preview()).game?.player).toMatchObject({ x: 9, y: 6 })
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
