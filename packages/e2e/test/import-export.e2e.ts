import { type Page } from '@playwright/test'

import { downloadZip, makeZip } from '../support/downloads.ts'
import { solidPng } from '../support/files.ts'
import { expect, test } from '../support/fixtures.ts'

const projectNameField = (page: Page) =>
  page.getByRole('complementary', { name: 'right panels' }).getByLabel('Project name')

const rename = async (page: Page, name: string): Promise<void> => {
  await projectNameField(page).fill(name)
  await projectNameField(page).press('Enter')
}

/** Picks a file in the import chooser that File ▸ Import project opens. */
const importZip = async (
  page: Page,
  file: { name: string; buffer: Buffer },
  open: () => Promise<void>,
): Promise<void> => {
  const chooser = page.waitForEvent('filechooser')
  await open()
  await (await chooser).setFiles({ ...file, mimeType: 'application/zip' })
}

test.describe('download project (.zip)', () => {
  test('packs every project file and asset into one archive', async ({ studio, page }) => {
    const zip = await downloadZip(page, () => studio.chooseMenuItem('File', /Download project/))
    expect(zip.filename).toBe('my-game-project.zip')
    expect(Object.keys(zip.entries)).toEqual(
      expect.arrayContaining([
        'project.json',
        'data/actors.json',
        'data/classes.json',
        'data/items.json',
        'data/skills.json',
        'data/enemies.json',
        'maps/map-001.json',
        'img/tilesets/basic.png',
      ]),
    )
    expect(JSON.parse(zip.text('project.json'))).toMatchObject({ name: 'My Game' })
    expect(zip.entries['img/tilesets/basic.png']?.length).toBeGreaterThan(100)
    await expect(studio.status).toHaveText('Downloaded the project archive')
  })

  test('includes sprite sources, which the exported game leaves out', async ({ studio, page }) => {
    await studio.dispatch({ type: 'project/renameMap', payload: { mapId: 1, name: 'Overworld' } })
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('menuitem', { name: 'Picture' }).click()
    await (
      await chooser
    ).setFiles({ name: 'title.png', mimeType: 'image/png', buffer: solidPng(4, 4) })
    await expect.poll(async () => (await studio.assets()).length).toBe(2)

    const zip = await downloadZip(page, () => studio.chooseMenuItem('File', /Download project/))
    expect(Object.keys(zip.entries)).toContain('img/pictures/title.png')
    expect(JSON.parse(zip.text('maps/map-001.json'))).toMatchObject({ name: 'Overworld' })
  })

  test('names the file after the project', async ({ studio, page }) => {
    await rename(page, 'Quest of Tests!')
    const zip = await downloadZip(page, () => studio.chooseMenuItem('File', /Download project/))
    expect(zip.filename).toBe('quest-of-tests-project.zip')
  })

  test('is a backup: it does not clear the unsaved marker', async ({ studio, page }) => {
    await studio.clickCell({ x: 5, y: 5 })
    await downloadZip(page, () => studio.chooseMenuItem('File', /Download project/))
    await expect(studio.projectTitle).toHaveText('My Game •')
  })
})

test.describe('import project (.zip)', () => {
  test('restores a downloaded project exactly, assets included', async ({ studio, page }) => {
    await studio.pickTile(5)
    await studio.clickCell({ x: 5, y: 5 })
    await rename(page, 'Round Trip')
    const zip = await downloadZip(page, () => studio.chooseMenuItem('File', /Download project/))
    const buffer = makeZip(Object.fromEntries(Object.entries(zip.entries)))

    await studio.chooseMenuItem('File', 'New project')
    await page.getByRole('dialog').getByRole('button', { name: 'Discard changes' }).click()
    expect((await studio.summary()).name).toBe('My Game')
    expect(await studio.tileAt(5, 5)).toBe(1)

    await importZip(page, { name: zip.filename, buffer }, () =>
      studio.chooseMenuItem('File', /Import project/),
    )
    await expect(studio.status).toHaveText('Imported “Round Trip”')
    expect((await studio.summary()).name).toBe('Round Trip')
    expect(await studio.tileAt(5, 5)).toBe(5)
    expect((await studio.assets()).map((asset) => asset.path)).toEqual(['img/tilesets/basic.png'])
    // An imported project is a fresh start: clean, not tied to a folder, nothing to undo.
    await expect(studio.projectTitle).toHaveText('Round Trip')
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
    await expect(page.getByRole('img', { name: /^Tileset / })).toBeVisible()
  })

  test('can import the same file twice in a row', async ({ studio, page }) => {
    const zip = await downloadZip(page, () => studio.chooseMenuItem('File', /Download project/))
    const file = { name: zip.filename, buffer: makeZip({ ...zip.entries }) }
    await importZip(page, file, () => studio.chooseMenuItem('File', /Import project/))
    await expect(studio.status).toContainText('Imported')
    await studio.dismissStatus()
    await importZip(page, file, () => studio.chooseMenuItem('File', /Import project/))
    await expect(studio.status).toContainText('Imported')
  })

  test('refuses a file that is not a zip', async ({ studio, page }) => {
    const chooser = page.waitForEvent('filechooser')
    await studio.chooseMenuItem('File', /Import project/)
    await (
      await chooser
    ).setFiles({
      name: 'notes.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('this is not a zip file'),
    })
    await expect(studio.status).toBeVisible()
    await expect(studio.status).not.toContainText('Imported')
    expect((await studio.summary()).name).toBe('My Game')
  })

  test('refuses an archive that is not an RPG Studio project', async ({ studio, page }) => {
    await importZip(page, { name: 'other.zip', buffer: makeZip({ 'readme.txt': 'hello' }) }, () =>
      studio.chooseMenuItem('File', /Import project/),
    )
    await expect(studio.status).toContainText('project.json is missing')
    expect((await studio.summary()).name).toBe('My Game')
  })

  test('names the broken file when the data is invalid', async ({ studio, page }) => {
    const zip = await downloadZip(page, () => studio.chooseMenuItem('File', /Download project/))
    const broken = makeZip({ ...zip.entries, 'maps/map-001.json': '{"id": "one"}' })
    await importZip(page, { name: 'broken.zip', buffer: broken }, () =>
      studio.chooseMenuItem('File', /Import project/),
    )
    await expect(studio.status).toContainText('maps/map-001.json')
    expect((await studio.summary()).name).toBe('My Game')
  })

  test('refuses an archive with a path that escapes the project', async ({ studio, page }) => {
    const zip = await downloadZip(page, () => studio.chooseMenuItem('File', /Download project/))
    const hostile = makeZip({ ...zip.entries, '../evil.txt': 'owned' })
    await importZip(page, { name: 'hostile.zip', buffer: hostile }, () =>
      studio.chooseMenuItem('File', /Import project/),
    )
    await expect(studio.status).toContainText('unsafe path')
    await expect(studio.status).toContainText('../evil.txt')
  })

  test('ignores files outside the project folders', async ({ studio, page }) => {
    const zip = await downloadZip(page, () => studio.chooseMenuItem('File', /Download project/))
    const noisy = makeZip({
      ...zip.entries,
      'notes/todo.txt': 'later',
      'img/pictures/title.png': solidPng(4, 4),
    })
    await importZip(page, { name: 'noisy.zip', buffer: noisy }, () =>
      studio.chooseMenuItem('File', /Import project/),
    )
    await expect(studio.status).toContainText('Imported')
    expect((await studio.assets()).map((asset) => asset.path).toSorted()).toEqual([
      'img/pictures/title.png',
      'img/tilesets/basic.png',
    ])
  })
})

test.describe('export game (.zip)', () => {
  test('builds a static web game', async ({ studio, page }) => {
    const zip = await downloadZip(page, () => studio.chooseMenuItem('File', /Export game/))
    expect(zip.filename).toBe('my-game.zip')
    expect(Object.keys(zip.entries).toSorted()).toEqual(
      [
        'data/actors.json',
        'data/classes.json',
        'data/enemies.json',
        'data/items.json',
        'data/skills.json',
        'engine/player.js',
        'game.json',
        'img/tilesets/basic.png',
        'index.html',
        'maps/map-001.json',
        'project.json',
      ].toSorted(),
    )
    await expect(studio.status).toHaveText('Exported 11 files')
  })

  test('lists exactly the shipped files in game.json', async ({ studio, page }) => {
    const zip = await downloadZip(page, () => studio.chooseMenuItem('File', /Export game/))
    const bundle = JSON.parse(zip.text('game.json')) as {
      name: string
      files: string[]
      plugins: string[]
    }
    expect(bundle.name).toBe('My Game')
    expect(bundle.plugins).toEqual([])
    expect(bundle.files.toSorted()).toEqual(
      Object.keys(zip.entries)
        .filter(
          (path) => path !== 'index.html' && path !== 'game.json' && !path.startsWith('engine/'),
        )
        .toSorted(),
    )
  })

  test('boots the player from index.html and never references editor code', async ({
    studio,
    page,
  }) => {
    const zip = await downloadZip(page, () => studio.chooseMenuItem('File', /Export game/))
    const html = zip.text('index.html')
    expect(html).toContain("import { startPlayer } from './engine/player.js'")
    expect(html).not.toMatch(/editor|piskel/i)
    expect(zip.text('engine/player.js').length).toBeGreaterThan(100_000)
  })

  test('escapes the project name in the page title', async ({ studio, page }) => {
    await rename(page, '<b>Hi</b> & "you"')
    const zip = await downloadZip(page, () => studio.chooseMenuItem('File', /Export game/))
    const html = zip.text('index.html')
    expect(html).not.toContain('<b>Hi</b>')
    expect(html).toMatch(/<title>&#60;b&#62;Hi&#60;\/b&#62; &#38; &#34;you&#34;<\/title>/)
  })

  test('leaves out sprite sources and says so', async ({ studio, page }) => {
    await page.getByRole('button', { name: 'basic.png' }).dblclick()
    await expect(page.getByRole('button', { name: 'Save to project' }).first()).toBeEnabled()
    await page.getByRole('button', { name: 'Save to project' }).first().click()
    await expect(page.getByRole('button', { name: 'basic.piskel' })).toBeVisible()
    await studio.dismissStatus()

    const zip = await downloadZip(page, () => studio.chooseMenuItem('File', /Export game/))
    expect(Object.keys(zip.entries).some((path) => path.endsWith('.piskel'))).toBe(false)
    expect(Object.keys(zip.entries)).toContain('img/tilesets/basic.png')
    await expect(studio.status).toHaveText('Exported 11 files (left out 1 authoring file(s))')
  })

  test('ships audio and pictures but not unknown file types', async ({ studio, page }) => {
    const add = async (kind: string, file: { name: string; mimeType: string; buffer: Buffer }) => {
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      const chooser = page.waitForEvent('filechooser')
      await page.getByRole('menuitem', { name: kind }).click()
      await (await chooser).setFiles(file)
    }
    await add('Music (BGM)', {
      name: 'theme.ogg',
      mimeType: 'audio/ogg',
      buffer: Buffer.from('OggS fake'),
    })
    await add('Picture', { name: 'title.png', mimeType: 'image/png', buffer: solidPng(4, 4) })
    await expect.poll(async () => (await studio.assets()).length).toBe(3)

    const zip = await downloadZip(page, () => studio.chooseMenuItem('File', /Export game/))
    expect(Object.keys(zip.entries)).toEqual(
      expect.arrayContaining(['audio/bgm/theme.ogg', 'img/pictures/title.png']),
    )
    const bundle = JSON.parse(zip.text('game.json')) as { files: string[] }
    expect(bundle.files).toEqual(
      expect.arrayContaining(['audio/bgm/theme.ogg', 'img/pictures/title.png']),
    )
  })

  test('includes every map', async ({ studio, page }) => {
    await studio.dispatch({
      type: 'project/createMap',
      payload: { name: 'Cellar', width: 8, height: 6, tileSize: 16 },
    })
    const zip = await downloadZip(page, () => studio.chooseMenuItem('File', /Export game/))
    expect(Object.keys(zip.entries)).toEqual(
      expect.arrayContaining(['maps/map-001.json', 'maps/map-002.json']),
    )
  })

  test('does not clear the unsaved marker', async ({ studio, page }) => {
    await studio.clickCell({ x: 5, y: 5 })
    await downloadZip(page, () => studio.chooseMenuItem('File', /Export game/))
    await expect(studio.projectTitle).toHaveText('My Game •')
  })

  test('says why when the engine player cannot be loaded', async ({ studio, page, problems }) => {
    problems.allow(/status of 404/)
    await page.route('**/engine/player.js', (route) => route.fulfill({ status: 404, body: 'nope' }))
    await studio.chooseMenuItem('File', /Export game/)
    await expect(studio.status).toContainText('Could not load the game engine')
    await expect(studio.status).toContainText('engine/player.js: 404')
  })
})
