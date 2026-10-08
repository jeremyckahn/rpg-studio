import { type Page } from '@playwright/test'

import { downloadZip, makeZip } from '../support/downloads.ts'
import { expect, test } from '../support/fixtures.ts'
import { serveFiles } from '../support/gameServer.ts'
import { type Studio } from '../support/studio.ts'

const MANIFEST = {
  id: 'acme.badge',
  name: 'Badge',
  version: '1.0.0',
  description: 'Marks the page so a test can tell the plugin ran.',
  capabilities: [],
  dependencies: [],
  schemas: [],
  entries: { shared: 'shared.js', editor: 'editor.js', engine: 'engine.js' },
}

const PLUGIN_FILES = {
  'plugins/acme.badge/manifest.json': JSON.stringify(MANIFEST),
  'plugins/acme.badge/shared.js': 'export default () => ({ greeting: "hello from shared" })',
  'plugins/acme.badge/engine.js': `export default {
    initialize(ctx, shared) {
      document.body.setAttribute('data-plugin', ctx.pluginId + ': ' + shared.greeting)
    },
  }`,
  'plugins/acme.badge/editor.js': `export default {
    initialize() {
      document.body.setAttribute('data-editor-plugin', 'the editor head must never run in a game')
    },
  }`,
}

/** Downloads the open project, enables plugins in its `project.json` and adds files, then imports it. */
const importWithPlugins = async (
  studio: Studio,
  enabled: readonly string[],
  files: Readonly<Record<string, string>>,
): Promise<void> => {
  const { page } = studio
  const zip = await downloadZip(page, () => studio.chooseMenuItem('File', /Download project/))
  const meta = JSON.parse(zip.text('project.json')) as Record<string, unknown>
  const archive = makeZip({
    ...zip.entries,
    'project.json': JSON.stringify({ ...meta, plugins: enabled }),
    ...files,
  })
  const chooser = page.waitForEvent('filechooser')
  await studio.chooseMenuItem('File', /Import project/)
  await (
    await chooser
  ).setFiles({ name: 'with-plugins.zip', mimeType: 'application/zip', buffer: archive })
  await expect(studio.status).toContainText('Imported')
  await studio.dismissStatus()
}

const exportGame = (studio: Studio) =>
  downloadZip(studio.page, () => studio.chooseMenuItem('File', /Export game/))

test.describe('plugins in exported games', () => {
  test('ships the shared and engine heads, and strips the editor head', async ({ studio }) => {
    await importWithPlugins(studio, ['acme.badge'], PLUGIN_FILES)
    const zip = await exportGame(studio)
    const paths = Object.keys(zip.entries)
    expect(paths).toEqual(
      expect.arrayContaining([
        'plugins/acme.badge/manifest.json',
        'plugins/acme.badge/shared.js',
        'plugins/acme.badge/engine.js',
      ]),
    )
    expect(paths).not.toContain('plugins/acme.badge/editor.js')
    expect(JSON.parse(zip.text('game.json'))).toMatchObject({ plugins: ['acme.badge'] })
    // The editor head is reported as left out of the game.
    await expect(studio.status).toContainText('left out 1 authoring file(s)')
  })

  test('the player runs the plugin and never requests its editor head', async ({
    studio,
    context,
  }) => {
    await importWithPlugins(studio, ['acme.badge'], PLUGIN_FILES)
    const zip = await exportGame(studio)
    const served = await serveFiles(zip.entries)
    try {
      const game = await context.newPage()
      await game.goto(served.url)
      await expect(game.locator('canvas')).toBeVisible()
      await expect(game.locator('body')).toHaveAttribute(
        'data-plugin',
        'acme.badge: hello from shared',
      )
      await expect(game.locator('body')).not.toHaveAttribute('data-editor-plugin', /.*/)
      const requested = served.requests()
      expect(requested).toEqual(
        expect.arrayContaining([
          '/plugins/acme.badge/manifest.json',
          '/plugins/acme.badge/shared.js',
          '/plugins/acme.badge/engine.js',
        ]),
      )
      expect(requested).not.toContain('/plugins/acme.badge/editor.js')
    } finally {
      await served.close()
    }
  })

  test('a game without plugins loads none', async ({ studio, context }) => {
    const zip = await exportGame(studio)
    expect(Object.keys(zip.entries).some((path) => path.startsWith('plugins/'))).toBe(false)
    const served = await serveFiles(zip.entries)
    try {
      const game = await context.newPage()
      await game.goto(served.url)
      await expect(game.locator('canvas')).toBeVisible()
      await expect(game.locator('body')).not.toHaveAttribute('data-plugin', /.*/)
    } finally {
      await served.close()
    }
  })

  const refuse = async (
    studio: Studio,
    page: Page,
    enabled: readonly string[],
    files: Readonly<Record<string, string>>,
    message: string,
  ): Promise<void> => {
    await importWithPlugins(studio, enabled, files)
    await studio.chooseMenuItem('File', /Export game/)
    await expect(studio.status).toContainText('The game cannot be exported')
    await expect(studio.status).toContainText(message)
    await expect(page.getByRole('button', { name: 'basic.png' })).toBeVisible()
  }

  test('refuses to export when an enabled plugin has no manifest', async ({ studio, page }) => {
    await refuse(
      studio,
      page,
      ['acme.badge'],
      {},
      'Plugin "acme.badge" is enabled but plugins/acme.badge/manifest.json is missing',
    )
  })
})
