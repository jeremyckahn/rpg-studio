import { type Page } from '@playwright/test'

import { expect, test } from '../support/fixtures.ts'

const mapsPanel = (page: Page) => page.getByRole('complementary', { name: 'Asset browser' })

test.describe('maps', () => {
  test('offers every supported tile size', async ({ page }) => {
    await page.getByRole('button', { name: 'New map' }).click()
    await page
      .getByRole('dialog', { name: 'New map' })
      .getByRole('combobox', { name: 'Tile size' })
      .click()
    await expect(page.getByRole('option')).toHaveText(['16 × 16', '24 × 24', '32 × 32', '48 × 48'])
  })

  test('selecting a map shows it and paints into it', async ({ studio, page }) => {
    await studio.dispatch({
      type: 'project/createMap',
      payload: { name: 'Cellar', width: 8, height: 6, tileSize: 16 },
    })
    await mapsPanel(page).getByText('2. Cellar').click()
    await expect(page.getByText(/^Cellar · layer/)).toBeVisible()
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Cellar')
    await expect(page.getByLabel('Width', { exact: true })).toHaveValue('8')

    await studio.pickTile(4)
    await studio.clickCell({ x: 3, y: 2 }, { mapId: 2 })
    expect(await studio.tileAt(3, 2, 0, 2)).toBe(4)
    expect(await studio.tileAt(3, 2, 0, 1)).toBe(1)
  })
})

test.describe('layers', () => {
  test('adds a layer on top and selects layers by name', async ({ studio, page }) => {
    await page.getByRole('button', { name: 'Add layer' }).click()
    await expect(mapsPanel(page).getByText('Layer 4', { exact: true })).toBeVisible()
    expect((await studio.map(1)).layers).toHaveLength(4)

    await studio.selectLayer('Layer 4')
    await studio.pickTile(6)
    await studio.clickCell({ x: 5, y: 5 })
    expect(await studio.tileAt(5, 5, 3)).toBe(6)
    expect(await studio.tileAt(5, 5, 0)).toBe(1)
  })

  test('hiding a layer changes the canvas', async ({ studio, page }) => {
    await studio.dispatch({
      type: 'project/fillArea',
      payload: { mapId: 1, layer: 1, tile: 5, startX: 2, startY: 2, endX: 12, endY: 10 },
    })
    const shown = await studio.canvasImage()
    await page.getByRole('button', { name: 'Hide Objects', exact: true }).click()
    await expect.poll(async () => (await studio.canvasImage()).equals(shown)).toBe(false)
  })

  test('keeps a valid selection after the selected layer is deleted', async ({ studio, page }) => {
    await studio.selectLayer('Overlay')
    await page.getByRole('button', { name: 'Delete Overlay', exact: true }).click()
    await studio.pickTile(3)
    await studio.clickCell({ x: 5, y: 5 })
    // The selection fell back onto a layer that still exists, so the stroke landed somewhere.
    const data = await studio.map(1)
    const painted = data.layers.filter((layer) => layer.data[5 * data.width + 5] === 3)
    expect(painted).toHaveLength(1)
  })
})
