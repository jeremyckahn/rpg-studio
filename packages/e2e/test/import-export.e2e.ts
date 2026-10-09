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
})
