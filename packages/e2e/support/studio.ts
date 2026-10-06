import { type Locator, type Page, expect } from '@playwright/test'
import { type Tilemap } from '@rpgstudio/core'

/** The part of `window.RPGStudio` (the console API) the tests use. */
interface RPGStudioApi {
  query: (query: unknown) => unknown
  dispatch: (action: unknown) => { success: boolean; error?: string; data?: unknown }
}

declare global {
  interface Window {
    RPGStudio?: RPGStudioApi
  }
}

export interface Result {
  readonly success: boolean
  readonly error?: string
}

export interface ProjectSummary {
  readonly name: string
  readonly revision: number
  readonly startMapId: number
  readonly startX: number
  readonly startY: number
  readonly maps: readonly { id: number; name: string; width: number; height: number }[]
  readonly counts: Readonly<Record<string, number>>
}

export interface Point {
  readonly x: number
  readonly y: number
}

export const COLLISION_SOLID = 1

/** The File ▸ Save item; its accessible name includes the shortcut hint. */
export const SAVE = /^Save Ctrl\+S$/

/**
 * A page object for the editor. It drives the real UI (clicks, keys, pointer strokes) and reads
 * the project back through `window.RPGStudio.query`, the same read path an AI agent uses, so a
 * test asserts what the project really contains rather than what the pixels suggest.
 */
export const createStudio = (page: Page) => {
  const canvas: Locator = page.getByTestId('map-canvas')
  /** The editor's toast (bottom left). Other alerts, like a panel's own error, are not matched. */
  const status: Locator = page.locator('.MuiSnackbar-root [role="alert"]').first()
  /** The project name in the menu bar (desktop layout only); it carries a • while unsaved. */
  const projectTitle: Locator = page.locator('p[aria-label="Project name"]')

  const query = <T = unknown>(request: unknown): Promise<T> =>
    page.evaluate((payload) => {
      if (!window.RPGStudio) throw new Error('window.RPGStudio is not installed')
      return window.RPGStudio.query(payload)
    }, request) as Promise<T>

  const dispatch = (action: unknown): Promise<Result> =>
    page.evaluate((payload) => {
      if (!window.RPGStudio) throw new Error('window.RPGStudio is not installed')
      return window.RPGStudio.dispatch(payload)
    }, action)

  const summary = (): Promise<ProjectSummary> => query({ type: 'GET_PROJECT_SUMMARY' })
  const map = (id = 1): Promise<Tilemap> => query({ type: 'GET_MAP_DATA', id })
  const table = <T = Record<string, unknown>>(name: string): Promise<readonly T[]> =>
    query({ type: 'GET_TABLE', table: name })
  const assets = (): Promise<readonly { path: string; bytes: number }[]> =>
    query({ type: 'LIST_ASSETS' })

  const tileAt = async (x: number, y: number, layer = 0, mapId = 1): Promise<number> => {
    const data = await map(mapId)
    return data.layers[layer]?.data[y * data.width + x] ?? -1
  }
  const collisionAt = async (x: number, y: number, mapId = 1): Promise<number> => {
    const data = await map(mapId)
    return data.collision[y * data.width + x] ?? -1
  }

  /**
   * Waits until the app has booted far enough for every test to start from a known state: the page
   * is scripted, the map is drawn and the tile palette is on screen. The "Created" toast the boot
   * leaves behind fades after four seconds, so it is not a readiness signal and is dismissed here;
   * a test that wants a toast provokes a fresh one.
   */
  const open = async (path = '/'): Promise<void> => {
    await page.goto(path)
    await page.waitForFunction(() => window.RPGStudio !== undefined)
    await expect(canvas.locator('canvas')).toBeVisible()
    await expect(tilePalette).toBeVisible()
    await dismissStatus()
  }

  const menuButton = (name: 'File' | 'Edit' | 'View') =>
    page.getByRole('button', { name, exact: true })
  const chooseMenuItem = async (
    menu: 'File' | 'Edit' | 'View',
    item: string | RegExp,
  ): Promise<void> => {
    await menuButton(menu).click()
    await page.getByRole('menuitem', { name: item }).click()
  }
  const menuItem = async (menu: 'File' | 'Edit' | 'View', item: string | RegExp) => {
    await menuButton(menu).click()
    return page.getByRole('menuitem', { name: item })
  }
  const closeMenu = async (): Promise<void> => {
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toBeHidden()
  }

  const zoomPercent = async (): Promise<number> => {
    const text = (await page.getByLabel('Zoom level').textContent()) ?? '0%'
    return Number.parseInt(text, 10)
  }

  /**
   * The page position of the middle of a cell. The map is centred in the canvas until the user
   * pans, so this holds for a fresh page at any zoom; `zoom` is only needed where the zoom label
   * is hidden (the compact layout) and defaults to the editor's initial 300%.
   */
  const cellPoint = async (
    cell: Point,
    options: { mapId?: number; zoom?: number } = {},
  ): Promise<Point> => {
    const box = await canvas.boundingBox()
    if (!box) throw new Error('The map canvas is not visible')
    const data = await map(options.mapId ?? 1)
    const zoom = options.zoom ?? (await zoomPercent()) / 100
    const size = data.tileSize * zoom
    const originX = Math.round((box.width - data.width * size) / 2)
    const originY = Math.round((box.height - data.height * size) / 2)
    return {
      x: box.x + originX + (cell.x + 0.5) * size,
      y: box.y + originY + (cell.y + 0.5) * size,
    }
  }

  const clickCell = async (cell: Point, options: { mapId?: number; zoom?: number } = {}) => {
    const at = await cellPoint(cell, options)
    await page.mouse.click(at.x, at.y)
  }

  /** One pointer stroke through the given cells, like a user dragging with the left button. */
  const strokeCells = async (
    cells: readonly Point[],
    options: { mapId?: number; zoom?: number; button?: 'left' | 'right' | 'middle' } = {},
  ): Promise<void> => {
    const [first, ...rest] = cells
    if (!first) return
    const start = await cellPoint(first, options)
    await page.mouse.move(start.x, start.y)
    await page.mouse.down({ button: options.button ?? 'left' })
    for (const cell of rest) {
      const at = await cellPoint(cell, options)
      await page.mouse.move(at.x, at.y, { steps: 4 })
    }
    await page.mouse.up({ button: options.button ?? 'left' })
  }

  const selectTool = async (label: RegExp | string): Promise<void> => {
    await page.getByRole('button', { name: label }).click()
  }

  const undo = (): Promise<void> => page.getByRole('button', { name: 'Undo' }).click()
  const redo = (): Promise<void> => page.getByRole('button', { name: 'Redo' }).click()

  const dismissStatus = async (): Promise<void> => {
    const close = status.getByRole('button', { name: 'Close' })
    if (await close.isVisible()) {
      // The toast also fades by itself after a few seconds; losing that race is fine.
      await close.click({ timeout: 2_000 }).catch(() => undefined)
      await expect(status).toBeHidden()
    }
  }

  /**
   * A snapshot of the canvas, to prove the picture changed. The pointer is parked outside the map
   * (no hover highlight) and the status toast is dismissed (it can overlap the canvas), so two
   * snapshots of the same project are identical.
   */
  const canvasImage = async (): Promise<Buffer> => {
    await dismissStatus()
    await page.mouse.move(0, 0)
    return canvas.screenshot()
  }

  const tilePalette: Locator = page.getByRole('img', { name: /^Tileset / })

  /** Picks a tile from the palette by its id (1 is the first cell; the palette is drawn at 2x). */
  const pickTile = async (tile: number): Promise<void> => {
    await expect(tilePalette).toBeVisible()
    const width = await tilePalette.evaluate((image) => (image as HTMLImageElement).naturalWidth)
    const columns = Math.max(1, Math.floor(width / 16))
    const index = tile - 1
    await tilePalette.click({
      position: { x: (index % columns) * 32 + 16, y: Math.floor(index / columns) * 32 + 16 },
    })
    // The yellow frame in the palette shows the choice in every layout (the toolbar caption does not).
    const frame = page.getByTestId('selected-tile')
    await expect(frame).toHaveCSS('left', `${(index % columns) * 32}px`)
    await expect(frame).toHaveCSS('top', `${Math.floor(index / columns) * 32}px`)
  }

  /** The layer list lives in the left dock; its rows also hold icon buttons, so click the name. */
  const selectLayer = async (name: string): Promise<void> => {
    await page
      .getByRole('complementary', { name: 'Asset browser' })
      .getByText(name, { exact: true })
      .click()
    await expect(page.getByText(`layer “${name}”`)).toBeVisible()
  }

  return {
    page,
    canvas,
    status,
    projectTitle,
    query,
    dispatch,
    summary,
    map,
    table,
    assets,
    tileAt,
    collisionAt,
    open,
    menuButton,
    chooseMenuItem,
    menuItem,
    closeMenu,
    zoomPercent,
    cellPoint,
    clickCell,
    strokeCells,
    selectTool,
    undo,
    redo,
    canvasImage,
    dismissStatus,
    tilePalette,
    pickTile,
    selectLayer,
  }
}

export type Studio = ReturnType<typeof createStudio>

/**
 * Remembers every toast (and other alert) the page shows from its first frame, because they fade
 * after a few seconds and a slow machine can look too late. Call before `studio.open()`, then
 * read them with `shownAlerts`.
 */
export const recordAlerts = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const note = (): void => {
      const seen = (Reflect.get(window, '__alerts') ?? []) as string[]
      const now = [...document.querySelectorAll('[role="alert"]')]
        .map((element) => element.textContent ?? '')
        .filter((text) => text !== '' && !seen.includes(text))
      if (now.length > 0) Reflect.set(window, '__alerts', [...seen, ...now])
    }
    new MutationObserver(note).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    })
  })
}

/** The alerts `recordAlerts` has seen so far, in order. */
export const shownAlerts = (page: Page): Promise<string[]> =>
  page.evaluate(() => (Reflect.get(window, '__alerts') ?? []) as string[])
