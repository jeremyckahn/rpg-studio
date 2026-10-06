import { type Page } from '@playwright/test'

import { expect, test } from '../support/fixtures.ts'
import { createTouch } from '../support/touch.ts'
import { type Studio } from '../support/studio.ts'

// A phone held upright; individual tests rotate it.
test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })

const nav = (page: Page) => page.getByRole('button', { name: /^(Assets|Tools|Properties)$/ })
const sheet = (page: Page, title: string) =>
  page.getByRole('complementary', { name: `${title} sheet` })

/** Taps the middle of a cell. The zoom label is hidden here, so the initial 300% is passed along. */
const tapCell = async (studio: Studio, x: number, y: number): Promise<void> => {
  const at = await studio.cellPoint({ x, y }, { zoom: 3 })
  await studio.page.touchscreen.tap(at.x, at.y)
}

test.describe('compact layout', () => {
  test('replaces the side docks with a bottom navigation bar', async ({ page }) => {
    await expect(nav(page)).toHaveText(['Assets', 'Tools', 'Properties'])
    await expect(page.getByRole('complementary', { name: 'right panels' })).toHaveCount(0)
    await expect(page.getByRole('complementary', { name: 'Asset browser' })).toHaveCount(0)
  })

  test('opens the tile palette first, as the tool you paint with', async ({ page }) => {
    await expect(sheet(page, 'Tools')).toBeVisible()
    await expect(sheet(page, 'Tools').getByRole('img', { name: /^Tileset / })).toBeVisible()
  })

  test('switches sections from the navigation bar', async ({ page }) => {
    await page.getByRole('button', { name: 'Properties' }).tap()
    await expect(sheet(page, 'Properties')).toBeVisible()
    await expect(sheet(page, 'Properties').getByLabel('Project name')).toHaveValue('My Game')
    await expect(sheet(page, 'Tools')).toHaveCount(0)

    await page.getByRole('button', { name: 'Assets' }).tap()
    await expect(sheet(page, 'Assets')).toBeVisible()
    await expect(sheet(page, 'Assets').getByRole('button', { name: 'basic.png' })).toBeVisible()
  })

  test('tapping the open section collapses the sheet and gives the map the room', async ({
    studio,
    page,
  }) => {
    const before = await studio.canvas.boundingBox()
    await page.getByRole('button', { name: 'Tools' }).tap()
    await expect(sheet(page, 'Tools')).toHaveCount(0)
    const after = await studio.canvas.boundingBox()
    expect((after?.height ?? 0) > (before?.height ?? 0)).toBe(true)

    await page.getByRole('button', { name: 'Tools' }).tap()
    await expect(sheet(page, 'Tools')).toBeVisible()
  })

  test('puts the sheet under the map in portrait and beside it in landscape', async ({
    studio,
    page,
  }) => {
    const map = async () => studio.canvas.boundingBox()
    const sheetBox = async () => sheet(page, 'Tools').boundingBox()
    const portrait = { map: await map(), sheet: await sheetBox() }
    expect(
      (portrait.sheet?.y ?? 0) >= (portrait.map?.y ?? 0) + (portrait.map?.height ?? 0) - 1,
    ).toBe(true)

    await page.setViewportSize({ width: 812, height: 375 })
    await expect
      .poll(async () => {
        const landscape = { map: await map(), sheet: await sheetBox() }
        return (
          (landscape.sheet?.x ?? 0) >= (landscape.map?.x ?? 0) + (landscape.map?.width ?? 0) - 1
        )
      })
      .toBe(true)
  })

  test('drops the title, the zoom buttons and the status caption', async ({ studio, page }) => {
    await expect(page.getByText('RPG Studio', { exact: true })).toBeHidden()
    await expect(page.getByRole('button', { name: 'Zoom in' })).toHaveCount(0)
    await expect(page.getByLabel('Zoom level')).toHaveCount(0)
    await expect(studio.projectTitle).toHaveCount(0)
  })

  test('shows the companion as an icon with its state as the label', async ({ page }) => {
    const companion = page.getByRole('button', { name: 'Companion: off' })
    await expect(companion).toBeVisible()
    await companion.tap()
    await expect(page.getByRole('dialog', { name: 'Companion bridge' })).toBeVisible()
  })

  test('marks unsaved work on the File button, since the name does not fit', async ({
    studio,
    page,
  }) => {
    await expect(page.getByRole('button', { name: 'File', exact: true })).toHaveText('File')
    await studio.dispatch({ type: 'project/renameMap', payload: { mapId: 1, name: 'Edited' } })
    await expect(page.getByRole('button', { name: /^File/ })).toHaveText('File •')
  })

  test('menus open and work by touch', async ({ studio, page }) => {
    await studio.dispatch({ type: 'project/renameMap', payload: { mapId: 1, name: 'Edited' } })
    await page.getByRole('button', { name: /^Edit$/ }).tap()
    await page.getByRole('menuitem', { name: /^Undo/ }).tap()
    expect((await studio.map(1)).name).toBe('Map 1')
  })

  test('touch targets are comfortably large', async ({ page }) => {
    const boxes = await Promise.all(
      ['Undo', 'Redo', 'Pencil (paint tiles)'].map(async (name) =>
        page.getByRole('button', { name }).boundingBox(),
      ),
    )
    for (const box of boxes) {
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(40)
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(40)
    }
  })

  test('the map toolbar scrolls sideways instead of wrapping', async ({ page }) => {
    const group = page.getByRole('group', { name: 'Map tool' })
    await expect(group).toBeVisible()
    const toolbarHeight = await group.evaluate(
      (element) => element.parentElement?.clientHeight ?? 0,
    )
    expect(toolbarHeight).toBeLessThan(80)
  })
})

test.describe('touch painting', () => {
  test('a tap paints exactly one tile', async ({ studio }) => {
    await tapCell(studio, 10, 7)
    await expect.poll(() => studio.tileAt(10, 7)).toBe(1)
    await studio.selectTool(/Eraser/)
    await tapCell(studio, 10, 7)
    await expect.poll(() => studio.tileAt(10, 7)).toBe(0)
    const painted = (await studio.map(1)).layers[0]?.data.filter((tile) => tile === 0).length
    expect(painted).toBe(1)
  })

  test('a drag paints a line, as one undo step', async ({ studio, page }) => {
    await studio.selectTool(/Eraser/)
    const touch = await createTouch(page)
    const from = await studio.cellPoint({ x: 8, y: 7 }, { zoom: 3 })
    const to = await studio.cellPoint({ x: 11, y: 7 }, { zoom: 3 })
    await touch.gesture([from], [to])
    for (const x of [8, 9, 10, 11]) await expect.poll(() => studio.tileAt(x, 7)).toBe(0)
    await studio.undo()
    for (const x of [8, 9, 10, 11]) expect(await studio.tileAt(x, 7)).toBe(1)
    await touch.detach()
  })

  test('the fill and collision tools work by touch', async ({ studio }) => {
    await studio.selectTool(/Collision \(/)
    await tapCell(studio, 9, 7)
    await expect.poll(() => studio.collisionAt(9, 7)).toBe(1)
    await studio.selectTool(/Fill/)
    await tapCell(studio, 12, 7)
    await expect.poll(() => studio.tileAt(0, 0)).toBe(1)
  })

  test('the Pan tool drags the view instead of painting', async ({ studio, page }) => {
    await studio.selectTool(/Pan \(/)
    const touch = await createTouch(page)
    const from = await studio.cellPoint({ x: 10, y: 7 }, { zoom: 3 })
    await touch.gesture([from], [{ x: from.x + 48, y: from.y }])
    expect((await studio.summary()).revision).toBe(0)

    // One tile (48px at 300%) to the right: the point that was on cell 10 now shows cell 9.
    await studio.selectTool(/Pencil/)
    await studio.pickTile(3)
    await page.touchscreen.tap(from.x, from.y)
    await expect.poll(() => studio.tileAt(9, 7)).toBe(3)
    expect(await studio.tileAt(10, 7)).toBe(1)
    await touch.detach()
  })
})

test.describe('two-finger gestures', () => {
  test('two fingers pan the map without painting', async ({ studio, page }) => {
    const touch = await createTouch(page)
    const centre = await studio.cellPoint({ x: 10, y: 7 }, { zoom: 3 })
    await touch.gesture(
      [
        { x: centre.x - 30, y: centre.y },
        { x: centre.x + 30, y: centre.y },
      ],
      [
        { x: centre.x - 30 + 48, y: centre.y },
        { x: centre.x + 30 + 48, y: centre.y },
      ],
    )
    expect((await studio.summary()).revision).toBe(0)

    // The map moved a whole tile right, so a tap where cell 10 was paints cell 9.
    await studio.selectTool(/Eraser/)
    await page.touchscreen.tap(centre.x, centre.y)
    await expect.poll(() => studio.tileAt(9, 7)).toBe(0)
    expect(await studio.tileAt(10, 7)).toBe(1)
    await touch.detach()
  })

  test('pinching zooms a level and keeps the point between the fingers still', async ({
    studio,
    page,
  }) => {
    const touch = await createTouch(page)
    const centre = await studio.cellPoint({ x: 10, y: 7 }, { zoom: 3 })
    const before = await studio.canvasImage()
    await touch.gesture(
      [
        { x: centre.x - 40, y: centre.y },
        { x: centre.x + 40, y: centre.y },
      ],
      [
        { x: centre.x - 70, y: centre.y },
        { x: centre.x + 70, y: centre.y },
      ],
    )
    expect((await studio.summary()).revision).toBe(0)
    await expect.poll(async () => (await studio.canvasImage()).equals(before)).toBe(false)

    // The cell under the fingers' midpoint is still the one that was there.
    await studio.selectTool(/Eraser/)
    await page.touchscreen.tap(centre.x, centre.y)
    await expect.poll(() => studio.tileAt(10, 7)).toBe(0)
    await touch.detach()
  })

  test('pinching in zooms back out', async ({ studio, page }) => {
    const touch = await createTouch(page)
    const centre = await studio.cellPoint({ x: 10, y: 7 }, { zoom: 3 })
    const before = await studio.canvasImage()
    await touch.gesture(
      [
        { x: centre.x - 70, y: centre.y },
        { x: centre.x + 70, y: centre.y },
      ],
      [
        { x: centre.x - 40, y: centre.y },
        { x: centre.x + 40, y: centre.y },
      ],
    )
    await expect.poll(async () => (await studio.canvasImage()).equals(before)).toBe(false)
    await touch.detach()
  })
})

test.describe('sprite editor and database on a phone', () => {
  test('every workspace is reachable and the sheet follows the workspace', async ({ page }) => {
    await page.getByRole('tab', { name: 'Database' }).tap()
    await expect(page.getByRole('grid')).toBeVisible()
    // The map-only sections are gone, leaving only the assets.
    await expect(nav(page)).toHaveText(['Assets'])

    await page.getByRole('tab', { name: 'Map' }).tap()
    await expect(nav(page)).toHaveText(['Assets', 'Tools', 'Properties'])
  })
})
