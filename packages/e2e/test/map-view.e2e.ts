import { expect, test } from '../support/fixtures.ts'

test.describe('tools', () => {
  test('the pencil is selected at first and exactly one tool is active at a time', async ({
    page,
  }) => {
    const pencil = page.getByRole('button', { name: /Pencil/ })
    await expect(pencil).toHaveAttribute('aria-pressed', 'true')
    for (const name of [/Fill/, /Eraser/, /Collision \(/, /Pan \(/]) {
      await page.getByRole('button', { name }).click()
      await expect(page.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
      await expect(pencil).toHaveAttribute('aria-pressed', 'false')
    }
  })
})

test.describe('zoom', () => {
  test('steps through the integer zoom levels with the toolbar buttons', async ({ page }) => {
    const zoom = page.getByLabel('Zoom level')
    const zoomIn = page.getByRole('button', { name: 'Zoom in' })
    const zoomOut = page.getByRole('button', { name: 'Zoom out' })
    await expect(zoom).toHaveText('300%')

    await zoomIn.click()
    await expect(zoom).toHaveText('400%')
    await zoomIn.click()
    await expect(zoom).toHaveText('600%')
    await zoomIn.click()
    await expect(zoom).toHaveText('800%')
    await expect(zoomIn).toBeDisabled()

    for (const level of ['600%', '400%', '300%', '200%', '100%']) {
      await zoomOut.click()
      await expect(zoom).toHaveText(level)
    }
    await expect(zoomOut).toBeDisabled()
  })

  test('zooms from the View menu', async ({ studio, page }) => {
    await studio.chooseMenuItem('View', 'Zoom in')
    await expect(page.getByLabel('Zoom level')).toHaveText('400%')
    await studio.chooseMenuItem('View', 'Zoom out')
    await studio.chooseMenuItem('View', 'Zoom out')
    await expect(page.getByLabel('Zoom level')).toHaveText('200%')
  })

  test('zooms with the mouse wheel over the canvas', async ({ studio, page }) => {
    const box = await studio.canvas.boundingBox()
    if (!box) throw new Error('canvas not visible')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -100)
    await expect(page.getByLabel('Zoom level')).toHaveText('400%')
    await page.mouse.wheel(0, 100)
    await page.mouse.wheel(0, 100)
    await expect(page.getByLabel('Zoom level')).toHaveText('200%')
  })

  test('paints in the right cell after zooming', async ({ studio, page }) => {
    await page.getByRole('button', { name: 'Zoom out' }).click()
    await page.getByRole('button', { name: 'Zoom out' }).click()
    await studio.pickTile(4)
    await studio.clickCell({ x: 0, y: 0 })
    await studio.clickCell({ x: 19, y: 14 })
    expect(await studio.tileAt(0, 0)).toBe(4)
    expect(await studio.tileAt(19, 14)).toBe(4)
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await studio.pickTile(5)
    await studio.clickCell({ x: 10, y: 7 })
    expect(await studio.tileAt(10, 7)).toBe(5)
  })
})

test.describe('overlays', () => {
  test('toolbar toggles start with the grid and layer dimming on and collision off', async ({
    page,
  }) => {
    await expect(page.getByRole('button', { name: 'Show grid' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByRole('button', { name: 'Show collision' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(page.getByRole('button', { name: 'Dim other layers' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('the View menu and the toolbar control the same overlays', async ({ studio, page }) => {
    await studio.chooseMenuItem('View', 'Hide grid')
    await expect(page.getByRole('button', { name: 'Show grid' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await page.getByRole('button', { name: 'Show collision' }).click()
    await expect(await studio.menuItem('View', 'Hide collision')).toBeVisible()
    await studio.closeMenu()
    await page.getByRole('button', { name: 'Dim other layers' }).click()
    await expect(await studio.menuItem('View', 'Dim other layers')).toBeVisible()
    await studio.closeMenu()
    await expect(await studio.menuItem('View', 'Show grid')).toBeVisible()
    await studio.closeMenu()
  })

  test('toggling the grid redraws the canvas', async ({ studio, page }) => {
    const withGrid = await studio.canvasImage()
    await page.getByRole('button', { name: 'Show grid' }).click()
    await expect.poll(async () => (await studio.canvasImage()).equals(withGrid)).toBe(false)
    await page.getByRole('button', { name: 'Show grid' }).click()
    await expect.poll(async () => (await studio.canvasImage()).equals(withGrid)).toBe(true)
  })

  test('the collision overlay draws solid cells', async ({ studio, page }) => {
    await studio.dispatch({
      type: 'project/setCollision',
      payload: { mapId: 1, cells: [{ x: 5, y: 5, flags: 1 }] },
    })
    const without = await studio.canvasImage()
    await page.getByRole('button', { name: 'Show collision' }).click()
    await expect.poll(async () => (await studio.canvasImage()).equals(without)).toBe(false)
  })

  // Known bug: MapScene sets `tilemap.alpha`, but @pixi/tilemap's shader only multiplies by each
  // tile's own alpha, so the layer's alpha never reaches the screen and "Dim other layers" changes
  // nothing visible. Turn this into a plain `test` once dimming is implemented (for example with
  // per-tile alpha), and delete this comment.
  test.fixme('dimming fades layers other than the selected one', async ({ studio, page }) => {
    await studio.dispatch({
      type: 'project/fillArea',
      payload: { mapId: 1, layer: 1, tile: 5, startX: 2, startY: 2, endX: 12, endY: 10 },
    })
    const dimmed = await studio.canvasImage()
    await page.getByRole('button', { name: 'Dim other layers' }).click()
    await expect.poll(async () => (await studio.canvasImage()).equals(dimmed)).toBe(false)
  })
})

test.describe('panning', () => {
  test('the Pan tool drags the view instead of painting', async ({ studio, page }) => {
    await studio.selectTool(/Pan \(/)
    const before = (await studio.summary()).revision
    const from = await studio.cellPoint({ x: 8, y: 7 })
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 48, from.y, { steps: 6 })
    await page.mouse.up()
    expect((await studio.summary()).revision).toBe(before)

    // The map moved one tile (48px at 300%) to the right, so the old cell centre now shows cell 7.
    await studio.selectTool(/Pencil/)
    await page.mouse.click(from.x, from.y)
    expect(await studio.tileAt(7, 7)).toBe(1)
    await studio.pickTile(3)
    await page.mouse.click(from.x, from.y)
    expect(await studio.tileAt(7, 7)).toBe(3)
    expect(await studio.tileAt(8, 7)).toBe(1)
  })

  test('Space plus a left drag pans', async ({ studio, page }) => {
    const from = await studio.cellPoint({ x: 8, y: 7 })
    await page.mouse.move(from.x, from.y)
    await page.keyboard.down('Space')
    await page.mouse.down()
    await page.mouse.move(from.x + 48, from.y, { steps: 6 })
    await page.mouse.up()
    await page.keyboard.up('Space')
    expect((await studio.summary()).revision).toBe(0)

    await studio.pickTile(3)
    await page.mouse.click(from.x, from.y)
    expect(await studio.tileAt(7, 7)).toBe(3)
  })

  for (const button of ['middle', 'right'] as const) {
    test(`a ${button}-button drag pans without painting`, async ({ studio, page }) => {
      const from = await studio.cellPoint({ x: 8, y: 7 })
      await page.mouse.move(from.x, from.y)
      await page.mouse.down({ button })
      await page.mouse.move(from.x, from.y + 48, { steps: 6 })
      await page.mouse.up({ button })
      expect((await studio.summary()).revision).toBe(0)

      await studio.pickTile(3)
      await page.mouse.click(from.x, from.y)
      expect(await studio.tileAt(8, 6)).toBe(3)
    })
  }

  test('does not open the browser context menu on the canvas', async ({ studio, page }) => {
    const prevented = await studio.canvas.evaluate((element) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
      element.querySelector('canvas')?.dispatchEvent(event)
      return event.defaultPrevented
    })
    expect(prevented).toBe(true)
    await expect(page.getByRole('menu')).toBeHidden()
  })
})

test.describe('window resizing', () => {
  test('keeps painting accurate after the window changes size', async ({ studio, page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(studio.canvas.locator('canvas')).toBeVisible()
    await studio.pickTile(3)
    await expect
      .poll(async () => {
        await studio.clickCell({ x: 6, y: 6 })
        return studio.tileAt(6, 6)
      })
      .toBe(3)
  })
})
