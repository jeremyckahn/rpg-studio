import { expect, test } from '../support/fixtures.ts'

test.describe('tools', () => {})

test.describe('zoom', () => {
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

  test('dimming fades layers other than the selected one', async ({ studio, page }) => {
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
