import { type Page } from '@playwright/test'

import { solidPng } from '../support/files.ts'
import { expect, test } from '../support/fixtures.ts'

const browser = (page: Page) => page.getByRole('complementary', { name: 'Asset browser' })
const piskel = (page: Page) => page.frameLocator('iframe[title="Piskel sprite editor"]')
const save = (page: Page) => page.getByRole('button', { name: 'Save to project' }).first()
/** The panel's own result message (the editor's toast shares the alert role). */
const saved = (page: Page) => page.getByRole('alert').filter({ hasText: /^Saved / })

/** Opens the starter tileset in the sprite editor and waits for Piskel to be ready for input. */
const openTileset = async (page: Page): Promise<void> => {
  await browser(page).getByRole('button', { name: 'basic.png' }).dblclick()
  await expect(page.getByRole('tab', { name: 'Sprite Editor' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(piskel(page).locator('.drawing-canvas')).toBeVisible()
  await expect(save(page)).toBeEnabled()
  // Piskel starts with a blank sprite and swaps in ours a moment later; its size readout shows when.
  await expect(piskel(page).getByText('[128x32]')).toBeVisible()
}

test.describe('sprite editor', () => {
  test('waits for an image to be chosen', async ({ page }) => {
    await page.getByRole('tab', { name: 'Sprite Editor' }).click()
    await expect(
      page.getByText('Double-click a .png or .piskel in the asset browser to edit it'),
    ).toBeVisible()
    await expect(save(page)).toBeDisabled()
    await expect(page.getByRole('alert').filter({ hasText: 'did not respond' })).toBeHidden()
  })

  test('opens an asset in the embedded Piskel editor', async ({ page }) => {
    await openTileset(page)
    await expect(page.getByText('img/tilesets/basic.png', { exact: true })).toBeVisible()
    // Piskel is running inside the iframe, with the tileset as its single 128x32 frame.
    await expect(piskel(page).getByText('[128x32]')).toBeVisible()
  })

  test('saves the PNG and the editable .piskel source back into the project', async ({
    studio,
    page,
  }) => {
    await openTileset(page)
    const before = await studio.assets()
    expect(before.map((asset) => asset.path)).toEqual(['img/tilesets/basic.png'])

    await save(page).click()
    await expect(saved(page)).toHaveText(
      'Saved img/tilesets/basic.png (128×32) and img/tilesets/basic.piskel',
    )
    await expect
      .poll(async () => (await studio.assets()).map((asset) => asset.path).toSorted())
      .toEqual(['img/tilesets/basic.piskel', 'img/tilesets/basic.png'])
    await expect(browser(page).getByRole('button', { name: 'basic.piskel' })).toBeVisible()
    await expect(studio.projectTitle).toHaveText('My Game •')
  })

  test('drawing then saving changes the PNG and redraws the map', async ({ studio, page }) => {
    const pngSize = async (): Promise<number | undefined> =>
      (await studio.assets()).find((asset) => asset.path.endsWith('.png'))?.bytes

    // Baseline: what Piskel writes for the untouched sprite, and how the map looks with it.
    await openTileset(page)
    await save(page).click()
    await expect(saved(page)).toBeVisible()
    await page.getByRole('tab', { name: 'Map' }).click()
    await expect(studio.canvas.locator('canvas')).toBeVisible()
    const baselineSize = await pngSize()
    const baselineMap = await studio.canvasImage()

    // Come back, paint one black pixel in the middle of the first (grass) tile, and save again.
    await page.getByRole('tab', { name: 'Sprite Editor' }).click()
    await expect(piskel(page).locator('.drawing-canvas')).toBeVisible()
    await expect(save(page)).toBeEnabled()
    await piskel(page)
      .locator('.drawing-canvas')
      .click({ position: { x: 40, y: 300 }, force: true })
    await save(page).click()
    await expect(saved(page)).toBeVisible()
    await expect.poll(pngSize).not.toBe(baselineSize)

    // The map picks up the new pixels without a reload: texture caches are invalidated on save.
    await page.getByRole('tab', { name: 'Map' }).click()
    await expect(studio.canvas.locator('canvas')).toBeVisible()
    await expect.poll(async () => (await studio.canvasImage()).equals(baselineMap)).toBe(false)
  })

  test('reopens a saved .piskel source', async ({ page }) => {
    await openTileset(page)
    await save(page).click()
    await expect(saved(page)).toBeVisible()
    await page.getByRole('tab', { name: 'Map' }).click()

    await browser(page).getByRole('button', { name: 'basic.piskel' }).dblclick()
    await expect(page.getByRole('tab', { name: 'Sprite Editor' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByText('img/tilesets/basic.piskel', { exact: true })).toBeVisible()
    await expect(piskel(page).locator('.drawing-canvas')).toBeVisible()
  })

  test('edits an uploaded character sheet', async ({ studio, page }) => {
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('menuitem', { name: 'Character sheet' }).click()
    await (
      await chooser
    ).setFiles([{ name: 'hero.png', mimeType: 'image/png', buffer: solidPng(48, 64) }])
    await browser(page).getByRole('button', { name: 'hero.png' }).dblclick()
    await expect(page.getByText('img/characters/hero.png', { exact: true })).toBeVisible()
    await expect(piskel(page).getByText('[48x64]')).toBeVisible()
    await expect(save(page)).toBeEnabled()
    await save(page).click()
    await expect(saved(page)).toContainText('Saved img/characters/hero.png (48×64)')
    expect((await studio.assets()).map((asset) => asset.path)).toContain(
      'img/characters/hero.piskel',
    )
  })

  test('the Save button Piskel adds inside its own window works too', async ({ studio, page }) => {
    await openTileset(page)
    await piskel(page).getByRole('button', { name: 'Save to project' }).click()
    await expect
      .poll(async () => (await studio.assets()).map((asset) => asset.path))
      .toContain('img/tilesets/basic.piskel')
  })

  test('keeps the editor when you switch workspaces and come back', async ({ page }) => {
    await openTileset(page)
    await page.getByRole('tab', { name: 'Database' }).click()
    await page.getByRole('tab', { name: 'Sprite Editor' }).click()
    await expect(page.getByText('img/tilesets/basic.png', { exact: true })).toBeVisible()
    await expect(piskel(page).locator('.drawing-canvas')).toBeVisible()
  })
})
