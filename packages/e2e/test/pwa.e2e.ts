import { type Page } from '@playwright/test'

import { downloadZip } from '../support/downloads.ts'
import { expect, test } from '../support/fixtures.ts'

test.describe('web app manifest', () => {
  test('describes an installable app', async ({ page, request }) => {
    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(href).toBeTruthy()
    const response = await request.get(new URL(href ?? '', page.url()).href)
    expect(response.ok()).toBe(true)
    const manifest = (await response.json()) as {
      name: string
      short_name: string
      display: string
      start_url: string
      scope: string
      background_color: string
      theme_color: string
      icons: { src: string; sizes: string; type: string; purpose?: string }[]
    }
    expect(manifest).toMatchObject({
      name: 'RPG Studio',
      short_name: 'RPG Studio',
      display: 'standalone',
      start_url: './',
      scope: './',
    })
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(['192x192', '512x512', '512x512'])
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true)
  })

  test('every icon it declares exists and is a PNG', async ({ page, request }) => {
    const href = (await page.locator('link[rel="manifest"]').getAttribute('href')) ?? ''
    const manifestUrl = new URL(href, page.url())
    const manifest = (await (await request.get(manifestUrl.href)).json()) as {
      icons: { src: string }[]
    }
    for (const icon of manifest.icons) {
      const response = await request.get(new URL(icon.src, manifestUrl).href)
      expect(response.ok(), icon.src).toBe(true)
      expect(response.headers()['content-type']).toContain('image/png')
    }
  })

  test('has the favicon, touch icon and theme colour in the page head', async ({ page }) => {
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /icon-192\.png$/)
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      'href',
      /apple-touch-icon\.png$/,
    )
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1b1d23')
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      'content',
      /viewport-fit=cover/,
    )
  })

  test('serves the engine player and the sprite editor with the app', async ({
    request,
    baseURL,
  }) => {
    const player = await request.get(`${baseURL}/engine/player.js`)
    expect(player.ok()).toBe(true)
    expect((await player.body()).length).toBeGreaterThan(100_000)
    const piskel = await request.get(`${baseURL}/piskel/index.html`)
    expect(piskel.ok()).toBe(true)
  })
})

test.describe('offline support', () => {
  test.use({ serviceWorkers: 'allow', openEditor: false })

  /** Resolves once the service worker is active, which means the whole app shell is cached. */
  const installed = (page: Page) =>
    page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })

  test('installs a service worker and tells the user it can work offline', async ({
    studio,
    page,
  }) => {
    // The notice is a toast that fades after a few seconds, so watch for it from the first frame.
    await page.addInitScript(() => {
      new MutationObserver(() => {
        if (document.body?.textContent?.includes('RPG Studio is ready to work offline.')) {
          Reflect.set(window, '__sawOfflineNotice', true)
        }
      }).observe(document, { subtree: true, childList: true, characterData: true })
    })
    await studio.open()
    await installed(page)
    await page.waitForFunction(
      () => Reflect.get(window, '__sawOfflineNotice') === true,
      undefined,
      {
        timeout: 20_000,
      },
    )
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
    expect(scope).toMatch(/\/$/)
  })

  test('loads and works with the network off', async ({ studio, page, context }) => {
    await studio.open()
    await installed(page)
    // Reload once so the worker controls the page, then cut the network and reload again.
    await page.reload()
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

    await context.setOffline(true)
    await page.reload()
    await page.waitForFunction(() => window.RPGStudio !== undefined)
    await expect(page.getByTestId('map-canvas').locator('canvas')).toBeVisible()
    await studio.pickTile(3)
    await studio.clickCell({ x: 5, y: 5 })
    expect(await studio.tileAt(5, 5)).toBe(3)

    // Exporting needs the engine player, which is cached with the app.
    const zip = await downloadZip(page, () => studio.chooseMenuItem('File', /Export game/))
    expect(Object.keys(zip.entries)).toContain('engine/player.js')
  })

  test('the sprite editor is available offline too', async ({ studio, page, context }) => {
    // Any failed request (Piskel's icon fonts used to be one) would show up as a console error.
    await studio.open()
    await installed(page)
    await page.reload()
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
    await context.setOffline(true)
    await page.reload()
    await page.waitForFunction(() => window.RPGStudio !== undefined)
    await page.getByRole('button', { name: 'basic.png' }).dblclick()
    await expect(
      page.frameLocator('iframe[title="Piskel sprite editor"]').locator('.drawing-canvas'),
    ).toBeVisible()
  })
})
