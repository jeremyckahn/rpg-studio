import { type Page } from '@playwright/test'

import { expect, test } from '../support/fixtures.ts'

const mapsPanel = (page: Page) => page.getByRole('complementary', { name: 'Asset browser' })

test.describe('maps', () => {
  test('lists the starter map as the start map and cannot delete it', async ({ page }) => {
    await expect(mapsPanel(page).getByText('1. Map 1')).toBeVisible()
    await expect(page.getByText('20×15 · start')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete Map 1', exact: true })).toBeDisabled()
  })

  test('creates a map with the dialog defaults', async ({ studio, page }) => {
    await page.getByRole('button', { name: 'New map' }).click()
    const dialog = page.getByRole('dialog', { name: 'New map' })
    await expect(dialog.getByLabel('Name')).toHaveAttribute('placeholder', 'Map 2')
    await expect(dialog.getByLabel('Width (tiles)')).toHaveValue('20')
    await expect(dialog.getByLabel('Height (tiles)')).toHaveValue('15')
    await expect(dialog.getByRole('combobox', { name: 'Tile size' })).toHaveText('16 × 16')
    await dialog.getByRole('button', { name: 'Create' }).click()
    await expect(dialog).toBeHidden()

    await expect(page.getByText('2. Map 2')).toBeVisible()
    const created = await studio.map(2)
    expect(created).toMatchObject({ name: 'Map 2', width: 20, height: 15, tileSize: 16 })
    expect(created.layers.map((layer) => layer.name)).toEqual(['Ground', 'Objects', 'Overlay'])
    expect(created.layers[0]?.data.every((tile) => tile === 1)).toBe(true)
    // The new map is not the start map.
    await expect(page.getByRole('button', { name: 'Delete Map 2', exact: true })).toBeEnabled()
  })

  test('creates a map with a custom name, size and tile size', async ({ studio, page }) => {
    await page.getByRole('button', { name: 'New map' }).click()
    const dialog = page.getByRole('dialog', { name: 'New map' })
    await dialog.getByLabel('Name').fill('Dungeon')
    await dialog.getByLabel('Width (tiles)').fill('30')
    await dialog.getByLabel('Height (tiles)').fill('10')
    await dialog.getByRole('combobox', { name: 'Tile size' }).click()
    await page.getByRole('option', { name: '32 × 32' }).click()
    await dialog.getByRole('button', { name: 'Create' }).click()

    await expect(page.getByText('2. Dungeon')).toBeVisible()
    await expect(page.getByText('30×10', { exact: true })).toBeVisible()
    expect(await studio.map(2)).toMatchObject({
      name: 'Dungeon',
      width: 30,
      height: 10,
      tileSize: 32,
    })
  })

  test('offers every supported tile size', async ({ page }) => {
    await page.getByRole('button', { name: 'New map' }).click()
    await page
      .getByRole('dialog', { name: 'New map' })
      .getByRole('combobox', { name: 'Tile size' })
      .click()
    await expect(page.getByRole('option')).toHaveText(['16 × 16', '24 × 24', '32 × 32', '48 × 48'])
  })

  test('limits the size to 1 through 512 tiles', async ({ studio, page }) => {
    await page.getByRole('button', { name: 'New map' }).click()
    const dialog = page.getByRole('dialog', { name: 'New map' })
    await dialog.getByLabel('Width (tiles)').fill('9999')
    await dialog.getByLabel('Height (tiles)').fill('0')
    await dialog.getByRole('button', { name: 'Create' }).click()
    expect(await studio.map(2)).toMatchObject({ width: 512, height: 1 })
  })

  test('cancelling the dialog creates nothing', async ({ studio, page }) => {
    await page.getByRole('button', { name: 'New map' }).click()
    await page
      .getByRole('dialog', { name: 'New map' })
      .getByRole('button', { name: 'Cancel' })
      .click()
    await expect(page.getByRole('dialog')).toBeHidden()
    expect((await studio.summary()).maps).toHaveLength(1)
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

  test('deletes a map that nothing refers to, and undo brings it back', async ({
    studio,
    page,
  }) => {
    await studio.dispatch({
      type: 'project/createMap',
      payload: { name: 'Cellar', width: 8, height: 6, tileSize: 16 },
    })
    await page.getByRole('button', { name: 'Delete Cellar', exact: true }).click()
    await expect(page.getByText('2. Cellar')).toBeHidden()
    expect((await studio.summary()).maps).toHaveLength(1)
    await studio.undo()
    await expect(page.getByText('2. Cellar')).toBeVisible()
  })

  test('refuses to delete a map that a door leads to', async ({ studio, page }) => {
    await studio.dispatch({
      type: 'project/createMap',
      payload: { name: 'Cellar', width: 8, height: 6, tileSize: 16 },
    })
    const door = await studio.dispatch({
      type: 'project/upsertMapEvent',
      payload: {
        mapId: 1,
        event: {
          id: 1,
          name: 'Door',
          x: 5,
          y: 5,
          pages: [
            { trigger: 'touch', commands: [{ command: 'TransferPlayer', mapId: 2, x: 1, y: 1 }] },
          ],
        },
      },
    })
    expect(door.success).toBe(true)
    await page.getByRole('button', { name: 'Delete Cellar', exact: true }).click()
    expect((await studio.summary()).maps.map((map) => map.id)).toEqual([1, 2])
    await expect(page.getByText('2. Cellar')).toBeVisible()
  })
})

test.describe('layers', () => {
  test('starts with Ground, Objects and Overlay, topmost first', async ({ page }) => {
    const layers = mapsPanel(page).getByText(/^(Ground|Objects|Overlay)$/)
    await expect(layers).toHaveText(['Overlay', 'Objects', 'Ground'])
    await expect(page.getByText('drawn above characters')).toBeVisible()
    await expect(page.getByText(/layer “Ground”/)).toBeVisible()
  })

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

  test('stops adding layers at the maximum of eight', async ({ studio, page }) => {
    for (let i = 0; i < 7; i += 1) await page.getByRole('button', { name: 'Add layer' }).click()
    await expect.poll(async () => (await studio.map(1)).layers.length).toBe(8)
    await page.getByRole('button', { name: 'Add layer' }).click()
    expect((await studio.map(1)).layers).toHaveLength(8)
  })

  test('hides and shows a layer', async ({ studio, page }) => {
    await page.getByRole('button', { name: 'Hide Objects', exact: true }).click()
    expect((await studio.map(1)).layers[1]?.visible).toBe(false)
    await page.getByRole('button', { name: 'Show Objects', exact: true }).click()
    expect((await studio.map(1)).layers[1]?.visible).toBe(true)
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

  test('draws a layer above characters on request', async ({ studio, page }) => {
    await page.getByRole('button', { name: 'Toggle Objects above characters', exact: true }).click()
    expect((await studio.map(1)).layers[1]?.above).toBe(true)
    await expect(page.getByText('drawn above characters')).toHaveCount(2)
    await page.getByRole('button', { name: 'Toggle Overlay above characters', exact: true }).click()
    expect((await studio.map(1)).layers[2]?.above).toBe(false)
    await expect(page.getByText('drawn above characters')).toHaveCount(1)
  })

  test('renames nothing but deletes a layer, and undo restores it', async ({ studio, page }) => {
    await page.getByRole('button', { name: 'Delete Overlay', exact: true }).click()
    expect((await studio.map(1)).layers.map((layer) => layer.name)).toEqual(['Ground', 'Objects'])
    await studio.undo()
    expect((await studio.map(1)).layers.map((layer) => layer.name)).toEqual([
      'Ground',
      'Objects',
      'Overlay',
    ])
  })

  test('cannot delete the last remaining layer', async ({ studio, page }) => {
    await page.getByRole('button', { name: 'Delete Overlay', exact: true }).click()
    await page.getByRole('button', { name: 'Delete Objects', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Delete Ground', exact: true })).toBeDisabled()
    expect((await studio.map(1)).layers).toHaveLength(1)
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
