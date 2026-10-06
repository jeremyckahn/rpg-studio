import {
  type AgentConnection,
  type CompanionServer,
  CompanionError,
  connectAgent,
  runDemo,
  startCompanionServer,
} from '@rpgstudio/companion-bridge'
import { type Page } from '@playwright/test'

import { solidPng } from '../support/files.ts'
import { expect, test } from '../support/fixtures.ts'
import { type Studio } from '../support/studio.ts'

const companionButton = (page: Page) => page.locator('button').filter({ hasText: /^Companion:/ })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Companion bridge' })

/** Opens the dialog, fills it in and presses Connect. */
const connect = async (page: Page, options: { url: string; token?: string }): Promise<void> => {
  await companionButton(page).click()
  await dialog(page).getByLabel('Server address').fill(options.url)
  if (options.token !== undefined)
    await dialog(page).getByLabel('Token (optional)').fill(options.token)
  await dialog(page).getByRole('button', { name: 'Connect', exact: true }).click()
}

test.describe('companion bridge', () => {
  let relay: CompanionServer | null = null
  let agent: AgentConnection | null = null

  test.afterEach(async () => {
    agent?.close()
    agent = null
    await relay?.close()
    relay = null
  })

  const startRelay = async (options: Parameters<typeof startCompanionServer>[0] = {}) => {
    relay = await startCompanionServer({ port: 0, ...options })
    return relay
  }

  /** Starts a relay, connects the editor to it and an agent to the relay. */
  const connected = async (studio: Studio): Promise<AgentConnection> => {
    const server = await startRelay()
    await connect(studio.page, { url: server.url })
    await expect(companionButton(studio.page)).toHaveText('Companion: connected')
    agent = await connectAgent({ url: server.url })
    await agent.waitForEditor(5_000)
    return agent
  }

  test.describe('dialog', () => {
    test('opens with the default address and an empty token', async ({ page }) => {
      await expect(companionButton(page)).toHaveText('Companion: off')
      await companionButton(page).click()
      await expect(dialog(page).getByLabel('Server address')).toHaveValue('ws://localhost:8080')
      await expect(dialog(page).getByLabel('Token (optional)')).toHaveValue('')
      await expect(dialog(page).getByLabel('Token (optional)')).toHaveAttribute('type', 'password')
      await expect(dialog(page).getByRole('button', { name: 'Disconnect' })).toBeDisabled()
      await expect(dialog(page).getByText('pnpm dev:companion')).toBeVisible()
    })

    test('links to the setup guide in the wiki', async ({ page }) => {
      await companionButton(page).click()
      const link = dialog(page).getByRole('link', { name: 'Setup guide' })
      await expect(link).toHaveAttribute(
        'href',
        /github\.com\/jeremyckahn\/rpg-studio\/wiki\/AI-Companion/,
      )
      await expect(link).toHaveAttribute('target', '_blank')
    })

    test('closes without connecting', async ({ page }) => {
      await companionButton(page).click()
      await dialog(page).getByRole('button', { name: 'Close' }).click()
      await expect(dialog(page)).toBeHidden()
      await expect(companionButton(page)).toHaveText('Companion: off')
    })

    test('rejects an address that is not a WebSocket URL', async ({ page }) => {
      await companionButton(page).click()
      await dialog(page).getByLabel('Server address').fill('http://localhost:8080')
      await dialog(page).getByRole('button', { name: 'Connect', exact: true }).click()
      await expect(dialog(page).getByRole('alert')).toContainText('must start with ws:// or wss://')
      await expect(dialog(page)).toBeVisible()
      await expect(companionButton(page)).toHaveText('Companion: off')
    })

    test('rejects text that is not a URL at all', async ({ page }) => {
      await companionButton(page).click()
      await dialog(page).getByLabel('Server address').fill('not a url')
      await dialog(page).getByRole('button', { name: 'Connect', exact: true }).click()
      await expect(dialog(page).getByRole('alert')).toBeVisible()
      await expect(companionButton(page)).toHaveText('Companion: off')
    })
  })

  test.describe('connecting', () => {
    test('connects the editor to a relay and shows it', async ({ page }) => {
      const server = await startRelay()
      await connect(page, { url: server.url })
      await expect(dialog(page)).toBeHidden()
      await expect(companionButton(page)).toHaveText('Companion: connected')
      await expect.poll(() => server.editorConnected()).toBe(true)

      await companionButton(page).click()
      await expect(dialog(page).getByRole('alert')).toHaveText('Connected.')
      await expect(dialog(page).getByRole('button', { name: 'Disconnect' })).toBeEnabled()
    })

    test('Disconnect ends the connection', async ({ page }) => {
      const server = await startRelay()
      await connect(page, { url: server.url })
      await expect(companionButton(page)).toHaveText('Companion: connected')
      await companionButton(page).click()
      await dialog(page).getByRole('button', { name: 'Disconnect' }).click()
      await expect(companionButton(page)).toHaveText('Companion: off')
      await expect.poll(() => server.editorConnected()).toBe(false)
    })

    test('accepts the right token and refuses a wrong or missing one', async ({ page }) => {
      const server = await startRelay({ token: 'open-sesame' })

      await connect(page, { url: server.url })
      await companionButton(page).click()
      await expect(dialog(page).getByRole('alert')).toContainText('refused the token')
      await expect(dialog(page).getByRole('alert')).toContainText('--token')
      expect(server.editorConnected()).toBe(false)

      await dialog(page).getByLabel('Token (optional)').fill('wrong')
      await dialog(page).getByRole('button', { name: 'Connect', exact: true }).click()
      await companionButton(page).click()
      await expect(dialog(page).getByRole('alert')).toContainText('refused the token')

      await dialog(page).getByLabel('Token (optional)').fill('open-sesame')
      await dialog(page).getByRole('button', { name: 'Connect', exact: true }).click()
      await expect(companionButton(page)).toHaveText('Companion: connected')
      await expect.poll(() => server.editorConnected()).toBe(true)
    })

    test('names the fix when the server does not allow this page', async ({ page }) => {
      const server = await startRelay({ allowedOrigins: ['http://example.test'] })
      await connect(page, { url: server.url })
      await companionButton(page).click()
      await expect(dialog(page).getByRole('alert')).toContainText(
        'pnpm dev:companion --allow-origin http://localhost:4173',
      )
      expect(server.editorConnected()).toBe(false)
    })

    test('keeps trying when nothing is listening, and Disconnect stops it', async ({
      page,
      problems,
    }) => {
      problems.allow(/WebSocket connection to .* failed/)
      // A port that was free a moment ago and now has nobody on it.
      const probe = await startCompanionServer({ port: 0 })
      const unused = probe.port
      await probe.close()
      await connect(page, { url: `ws://127.0.0.1:${unused}` })
      await companionButton(page).click()
      await expect(dialog(page).getByRole('alert')).toContainText(
        'Could not reach the companion server',
      )
      await expect(dialog(page).getByRole('alert')).toContainText('retrying')
      await dialog(page).getByRole('button', { name: 'Disconnect' }).click()
      await expect(dialog(page).getByRole('button', { name: 'Disconnect' })).toBeDisabled()
      await expect(companionButton(page)).toHaveText('Companion: off')
    })

    test('reconnects by itself when the relay comes back', async ({ page, problems }) => {
      test.setTimeout(60_000)
      problems.allow(/WebSocket connection to .* failed/)
      const first = await startRelay()
      const { port } = first
      await connect(page, { url: first.url })
      await expect(companionButton(page)).toHaveText('Companion: connected')

      await first.close()
      relay = null
      await expect(companionButton(page)).not.toHaveText('Companion: connected')

      relay = await startCompanionServer({ port })
      await expect(companionButton(page)).toHaveText('Companion: connected', { timeout: 30_000 })
      await expect.poll(() => relay?.editorConnected()).toBe(true)
    })
  })

  test.describe('an agent drives the editor', () => {
    test('reads the project', async ({ studio }) => {
      const connection = await connected(studio)
      const summary = (await connection.query({ type: 'GET_PROJECT_SUMMARY' })) as { name: string }
      expect(summary.name).toBe('My Game')
      const map = (await connection.query({ type: 'GET_MAP_DATA', id: 1 })) as { width: number }
      expect(map.width).toBe(20)
      const schema = (await connection.query({ type: 'GET_SCHEMA', name: 'actor' })) as {
        required?: string[]
      }
      expect(schema.required).toEqual(expect.arrayContaining(['id', 'name', 'classId']))
    })

    test('edits the map live, and one Undo reverts the whole batch', async ({ studio }) => {
      const connection = await connected(studio)
      await connection.batch([
        {
          type: 'project/fillArea',
          payload: { mapId: 1, layer: 0, tile: 3, startX: 2, startY: 2, endX: 6, endY: 4 },
        },
        { type: 'project/setCollision', payload: { mapId: 1, cells: [{ x: 2, y: 2, flags: 1 }] } },
      ])
      await expect.poll(() => studio.tileAt(4, 3)).toBe(3)
      expect(await studio.collisionAt(2, 2)).toBe(1)
      await expect(studio.projectTitle).toHaveText('My Game •')

      await studio.undo()
      expect(await studio.tileAt(4, 3)).toBe(1)
      expect(await studio.collisionAt(2, 2)).toBe(0)
    })

    test('changes the picture on the editor canvas', async ({ studio }) => {
      const connection = await connected(studio)
      const before = await studio.canvasImage()
      await connection.dispatch({
        type: 'project/fillArea',
        payload: { mapId: 1, layer: 0, tile: 3, startX: 2, startY: 2, endX: 12, endY: 9 },
      })
      await expect.poll(async () => (await studio.canvasImage()).equals(before)).toBe(false)
    })

    test('a refused action explains itself and changes nothing', async ({ studio }) => {
      const connection = await connected(studio)
      const before = (await studio.summary()).revision
      await expect(
        connection.dispatch({
          type: 'project/setTiles',
          payload: { mapId: 1, layer: 0, cells: [{ x: 99, y: 0, tile: 1 }] },
        }),
      ).rejects.toThrow(/outside/)
      expect((await studio.summary()).revision).toBe(before)
    })

    test('a batch with one bad action is applied as a whole or not at all', async ({ studio }) => {
      const connection = await connected(studio)
      await expect(
        connection.batch([
          {
            type: 'project/fillArea',
            payload: { mapId: 1, layer: 0, tile: 3, startX: 0, startY: 0, endX: 2, endY: 2 },
          },
          {
            type: 'project/setTiles',
            payload: { mapId: 1, layer: 0, cells: [{ x: 99, y: 0, tile: 1 }] },
          },
        ]),
      ).rejects.toThrow(CompanionError)
      expect(await studio.tileAt(1, 1)).toBe(1)
    })

    test('writes an image asset, which appears in the asset browser', async ({ studio, page }) => {
      const connection = await connected(studio)
      await connection.writeAsset('img/characters/robot.png', new Uint8Array(solidPng(16, 16)))
      await expect(
        page
          .getByRole('complementary', { name: 'Asset browser' })
          .getByRole('button', { name: 'robot.png' }),
      ).toBeVisible()
      const listed = (await connection.query({ type: 'LIST_ASSETS' })) as { path: string }[]
      expect(listed.map((asset) => asset.path)).toContain('img/characters/robot.png')
    })

    // Known bug: when an asset that is already loaded is replaced, the asset store's subscribers run
    // in registration order. The session's mirror (which makes the map canvas reload its tileset) is
    // registered before the texture provider's invalidation, so the canvas "reloads" the stale cached
    // texture and nothing asks again. Under load the map keeps showing the old tileset indefinitely.
    // Make this a plain `test` once the invalidation runs first (or the reload waits for it).
    test.fixme('replaces the tileset image and the map is redrawn without a reload', async ({
      studio,
    }) => {
      const connection = await connected(studio)
      const before = await studio.canvasImage()
      await connection.writeAsset(
        'img/tilesets/basic.png',
        new Uint8Array(solidPng(128, 32, [250, 0, 250, 255])),
      )
      await expect.poll(async () => (await studio.canvasImage()).equals(before)).toBe(false)
    })

    test('refuses to write anything but images and audio', async ({ studio }) => {
      const connection = await connected(studio)
      // The editor refuses project data and code: only images and audio may be written.
      await expect(
        connection.writeAsset('maps/map-001.json', new TextEncoder().encode('{}')),
      ).rejects.toThrow()
      await expect(
        connection.writeAsset('plugins/evil/engine.js', new TextEncoder().encode('alert(1)')),
      ).rejects.toThrow()
      // The agent library checks the path itself before anything is sent.
      expect(() => connection.writeAsset('../escape.png', new Uint8Array(solidPng(1, 1)))).toThrow()
      expect(await studio.map(1)).toMatchObject({ name: 'Map 1' })
    })

    test('finds a path on the map', async ({ studio }) => {
      const connection = await connected(studio)
      await studio.dispatch({
        type: 'project/setCollision',
        payload: { mapId: 1, cells: [{ x: 3, y: 0, flags: 1 }] },
      })
      const result = (await connection.query({
        type: 'FIND_PATH',
        mapId: 1,
        from: { x: 0, y: 0 },
        to: { x: 5, y: 0 },
      })) as { found: boolean; path: unknown[] }
      expect(result.found).toBe(true)
      expect(result.path.length).toBeGreaterThan(5)
    })

    test('several agents can share one editor', async ({ studio }) => {
      const first = await connected(studio)
      const second = await connectAgent({ url: relay?.url ?? '' })
      try {
        const [a, b] = await Promise.all([
          first.query({ type: 'GET_PROJECT_SUMMARY' }),
          second.query({ type: 'GET_TABLE', table: 'actors' }),
        ])
        expect(a).toMatchObject({ name: 'My Game' })
        expect(b).toEqual([expect.objectContaining({ name: 'Hero' })])
      } finally {
        second.close()
      }
    })

    test('an agent connection is refused when the browser connects with the agent role', async ({
      studio,
    }) => {
      await connected(studio)
      // The relay accepts the editor only from an allowed web origin; a plain Node client with
      // no origin cannot pose as the editor (covered by the bridge's own tests), but a browser
      // page on any origin must not be able to act as an agent.
      const outcome = await studio.page.evaluate(
        (url) =>
          new Promise<string>((resolve) => {
            const socket = new WebSocket(url)
            socket.addEventListener('open', () =>
              socket.send(JSON.stringify({ kind: 'hello', role: 'agent', protocol: 1 })),
            )
            socket.addEventListener('close', (event) => resolve(`closed ${event.code}`))
            setTimeout(() => resolve('still open'), 3_000)
          }),
        relay?.url ?? '',
      )
      expect(outcome).toMatch(/^closed 44\d\d$/)
    })

    test('the reference agent finishes its whole tour against the real editor', async ({
      studio,
    }) => {
      test.setTimeout(60_000)
      const connection = await connected(studio)
      const summary = await runDemo(connection, { editorTimeoutMs: 5_000 })
      expect(summary).toBeDefined()

      const assets = (await studio.assets()).map((asset) => asset.path)
      expect(assets.length).toBeGreaterThan(1)
      expect((await studio.table('actors')).length).toBeGreaterThan(1)
      // The demo reshapes the first map in one batch; its edits are in the editor.
      const map = await studio.map(1)
      expect(map.layers[0]?.data.some((tile) => tile !== 1)).toBe(true)
    })
  })
})
