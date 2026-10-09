import {
  type AgentConnection,
  type CompanionServer,
  connectAgent,
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
  })

  test.describe('an agent drives the editor', () => {
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

    test('replaces the tileset image and the map is redrawn without a reload', async ({
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
  })
})
