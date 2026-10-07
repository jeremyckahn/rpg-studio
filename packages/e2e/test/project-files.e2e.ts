import { type Page } from '@playwright/test'

import { downloadZip, makeZip } from '../support/downloads.ts'
import { expect, test } from '../support/fixtures.ts'
import { SAVE } from '../support/studio.ts'
import {
  pickerCalls,
  readFolder,
  removeDirectoryPicker,
  seedFolder,
  stubDirectoryPicker,
} from '../support/filesystem.ts'

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Discard unsaved changes?' })

test.describe('with folder support', () => {
  test.use({ openEditor: false })

  test.beforeEach(async ({ page }) => {
    await stubDirectoryPicker(page, ['my-game'])
  })

  test('Save asks for a folder once and writes the whole project into it', async ({
    studio,
    page,
  }) => {
    await studio.open()
    await expect(await studio.menuItem('File', SAVE)).toBeEnabled()
    await page.getByRole('menuitem', { name: SAVE }).click()

    await expect(studio.status).toContainText(/^Saved \d+ file\(s\) to my-game$/)
    expect(await pickerCalls(page)).toBe(1)
    const files = Object.keys(await readFolder(page, 'my-game'))
    expect(files).toEqual(
      expect.arrayContaining([
        'project.json',
        'data/actors.json',
        'data/classes.json',
        'data/items.json',
        'data/skills.json',
        'data/enemies.json',
        'maps/map-001.json',
      ]),
    )
    await expect(studio.projectTitle).toHaveText('My Game — my-game')
  })

  test('the first Save of a new project includes the starter tileset', async ({ studio, page }) => {
    await studio.open()
    await studio.chooseMenuItem('File', SAVE)
    await expect(studio.status).toContainText('Saved')
    expect(Object.keys(await readFolder(page, 'my-game'))).toContain('img/tilesets/basic.png')
  })

  test('writes strict, readable JSON', async ({ studio, page }) => {
    await studio.open()
    await studio.chooseMenuItem('File', SAVE)
    await expect(studio.status).toContainText('Saved')
    const folder = await readFolder(page, 'my-game')
    const meta = JSON.parse(folder['project.json']?.text ?? '') as { name: string; format: string }
    expect(meta).toMatchObject({ name: 'My Game', format: 'rpgstudio-project' })
    expect(folder['project.json']?.text?.endsWith('\n')).toBe(true)
    expect(folder['project.json']?.text).toContain('\n  "name"')
  })

  test('saving clears the unsaved marker', async ({ studio, page }) => {
    await studio.open()
    await studio.clickCell({ x: 5, y: 5 })
    await expect(studio.projectTitle).toHaveText('My Game •')
    await studio.chooseMenuItem('File', SAVE)
    await expect(studio.projectTitle).toHaveText('My Game — my-game')
    await page.getByRole('tab', { name: 'Map' }).click()
  })

  test('saving again without changes says so and does not ask for a folder', async ({
    studio,
    page,
  }) => {
    await studio.open()
    await studio.chooseMenuItem('File', SAVE)
    await expect(studio.status).toContainText('Saved')
    await studio.dismissStatus()
    await studio.chooseMenuItem('File', SAVE)
    await expect(studio.status).toHaveText('Already saved')
    expect(await pickerCalls(page)).toBe(1)
  })

  test('says what a save removed when it only deleted files', async ({ studio, page }) => {
    await studio.open()
    await studio.dispatch({
      type: 'project/createMap',
      payload: { name: 'Cellar', width: 8, height: 6, tileSize: 16 },
    })
    await studio.chooseMenuItem('File', SAVE)
    await expect(studio.status).toContainText('Saved')
    await studio.dismissStatus()

    await page.getByRole('button', { name: 'Delete Cellar', exact: true }).click()
    await studio.chooseMenuItem('File', SAVE)
    await expect(studio.status).toHaveText('Removed 1 file(s) from my-game')
  })

  test('a saved copy of an imported project includes its assets', async ({ studio, page }) => {
    await studio.open()
    const zip = await downloadZip(page, () => studio.chooseMenuItem('File', /Download project/))
    const chooser = page.waitForEvent('filechooser')
    await studio.chooseMenuItem('File', /Import project/)
    await (
      await chooser
    ).setFiles({
      name: zip.filename,
      mimeType: 'application/zip',
      buffer: makeZip({ ...zip.entries }),
    })
    await expect(studio.status).toContainText('Imported')
    await studio.dismissStatus()
    await studio.chooseMenuItem('File', SAVE)
    await expect(studio.status).toContainText('Saved')
    expect(Object.keys(await readFolder(page, 'my-game'))).toContain('img/tilesets/basic.png')
  })

  test('only rewrites what changed', async ({ studio, page }) => {
    await studio.open()
    await studio.chooseMenuItem('File', SAVE)
    await expect(studio.status).toContainText('Saved')
    await studio.dismissStatus()

    await studio.pickTile(3)
    await studio.clickCell({ x: 6, y: 6 })
    await studio.chooseMenuItem('File', SAVE)
    await expect(studio.status).toHaveText('Saved 1 file(s) to my-game')
    const folder = await readFolder(page, 'my-game')
    expect(folder['maps/map-001.json']?.text).toContain('3')
  })

  test('Ctrl+S saves from the keyboard, even while typing in a field', async ({ studio, page }) => {
    await studio.open()
    await page.getByLabel('Name', { exact: true }).focus()
    await page.keyboard.press('Control+s')
    await expect(studio.status).toContainText('Saved')
    expect(Object.keys(await readFolder(page, 'my-game'))).toContain('project.json')
  })

  test('Save to another folder switches to it, and later saves go there without asking', async ({
    studio,
    page,
  }) => {
    await stubDirectoryPicker(page, ['my-game', 'second-copy'])
    await studio.open()
    await studio.chooseMenuItem('File', SAVE)
    await expect(studio.projectTitle).toHaveText('My Game — my-game')
    await studio.chooseMenuItem('File', 'Save to another folder…')
    await expect(studio.projectTitle).toHaveText('My Game — second-copy')
    expect(await pickerCalls(page)).toBe(2)

    await studio.pickTile(3)
    await studio.clickCell({ x: 5, y: 5 })
    await studio.chooseMenuItem('File', SAVE)
    await expect
      .poll(async () => (await readFolder(page, 'second-copy'))['maps/map-001.json']?.text)
      .toContain('3')
    await expect(studio.projectTitle).toHaveText('My Game — second-copy')
    expect(await pickerCalls(page)).toBe(2)
  })

  test('Save to another folder writes a complete copy', async ({ studio, page }) => {
    await stubDirectoryPicker(page, ['my-game', 'second-copy'])
    await studio.open()
    await studio.chooseMenuItem('File', SAVE)
    await expect(studio.projectTitle).toHaveText('My Game — my-game')
    await studio.chooseMenuItem('File', 'Save to another folder…')
    await expect(studio.projectTitle).toHaveText('My Game — second-copy')
    expect(Object.keys(await readFolder(page, 'second-copy'))).toEqual(
      expect.arrayContaining([
        'project.json',
        'maps/map-001.json',
        'data/actors.json',
        'img/tilesets/basic.png',
      ]),
    )
  })

  test('saves new, changed and removed assets and maps', async ({ studio, page }) => {
    await studio.open()
    await studio.dispatch({
      type: 'project/createMap',
      payload: { name: 'Cellar', width: 8, height: 6, tileSize: 16 },
    })
    await studio.chooseMenuItem('File', SAVE)
    await expect(studio.status).toContainText('Saved')
    expect(Object.keys(await readFolder(page, 'my-game'))).toContain('maps/map-002.json')

    await page.getByRole('button', { name: 'Delete Cellar', exact: true }).click()
    await studio.dismissStatus()
    await studio.chooseMenuItem('File', SAVE)
    await expect
      .poll(async () => Object.keys(await readFolder(page, 'my-game')))
      .not.toContain('maps/map-002.json')
  })

  test('Open folder loads a saved project with its assets', async ({ studio, page }) => {
    await studio.open()
    await studio.pickTile(4)
    await studio.clickCell({ x: 5, y: 5 })
    const projectName = page
      .getByRole('complementary', { name: 'right panels' })
      .getByLabel('Project name')
    await projectName.fill('Saved Quest')
    await projectName.press('Enter')
    await studio.chooseMenuItem('File', SAVE)
    await expect(studio.status).toContainText('Saved')

    // A fresh editor opening that folder gets the same project back.
    await studio.reload()
    await expect(studio.projectTitle).toHaveText('My Game')
    await studio.chooseMenuItem('File', 'Open folder…')
    await expect(studio.status).toHaveText('Opened “Saved Quest” from my-game')
    await expect(studio.projectTitle).toHaveText('Saved Quest — my-game')
    expect(await studio.tileAt(5, 5)).toBe(4)
    expect((await studio.assets()).map((asset) => asset.path)).toEqual(['img/tilesets/basic.png'])
    await expect(page.getByRole('img', { name: /^Tileset / })).toBeVisible()
    // Opening a project is not an edit.
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })

  test('an opened project saves back to the same folder without asking', async ({
    studio,
    page,
  }) => {
    await studio.open()
    await studio.chooseMenuItem('File', SAVE)
    await expect(studio.status).toContainText('Saved')
    await studio.reload()
    await studio.chooseMenuItem('File', 'Open folder…')
    await expect(studio.status).toContainText('Opened')
    const asked = await pickerCalls(page)
    await studio.pickTile(3)
    await studio.clickCell({ x: 5, y: 5 })
    await studio.chooseMenuItem('File', SAVE)
    await expect(studio.status).toHaveText('Saved 1 file(s) to my-game')
    expect(await pickerCalls(page)).toBe(asked)
  })

  test('explains why a folder that is not a project cannot be opened', async ({ studio, page }) => {
    await studio.open()
    await seedFolder(page, 'my-game', { 'notes.txt': 'hello' })
    await studio.chooseMenuItem('File', 'Open folder…')
    await expect(studio.status).toContainText('not an RPG Studio project')
    // Nothing was replaced.
    await expect(studio.projectTitle).toHaveText('My Game')
  })

  test('names the file when a project file is broken', async ({ studio, page }) => {
    await studio.open()
    await studio.chooseMenuItem('File', SAVE)
    await expect(studio.status).toContainText('Saved')
    await seedFolder(page, 'my-game', { 'maps/map-001.json': '{ not json' })
    await studio.dismissStatus()
    await studio.chooseMenuItem('File', 'Open folder…')
    await expect(studio.status).toContainText('maps/map-001.json')
  })
})

test.describe('cancelling the folder picker', () => {
  test.use({ openEditor: false })

  test('is quiet and changes nothing', async ({ studio, page }) => {
    await stubDirectoryPicker(page, ['cancel'])
    await studio.open()
    await studio.dismissStatus()
    await studio.clickCell({ x: 5, y: 5 })
    await studio.chooseMenuItem('File', SAVE)
    await expect.poll(() => pickerCalls(page)).toBe(1)
    await expect(studio.status).toBeHidden()
    await expect(studio.projectTitle).toHaveText('My Game •')
  })
})

test.describe('replacing a project', () => {
  test.use({ openEditor: false })

  test.beforeEach(async ({ page }) => {
    await stubDirectoryPicker(page, ['my-game'])
  })

  test('New project replaces a clean project at once', async ({ studio, page }) => {
    await studio.open()
    await studio.dispatch({ type: 'project/renameMap', payload: { mapId: 1, name: 'Overworld' } })
    await studio.chooseMenuItem('File', SAVE)
    await expect(studio.status).toContainText('Saved')
    await studio.chooseMenuItem('File', 'New project')
    await expect(dialog(page)).toBeHidden()
    expect((await studio.map(1)).name).toBe('Map 1')
    await expect(studio.status).toHaveText('Created “My Game”')
  })

  test('New project asks first when there are unsaved changes', async ({ studio, page }) => {
    await studio.open()
    await studio.clickCell({ x: 5, y: 5 })
    await studio.chooseMenuItem('File', 'New project')
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page)).toContainText('Creating a new project replaces the open project')
    // Nothing has happened yet.
    expect(await studio.tileAt(5, 5)).toBe(1)
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(studio.projectTitle).toHaveText('My Game •')
  })

  test('Escape cancels the question', async ({ studio, page }) => {
    await studio.open()
    await studio.pickTile(4)
    await studio.clickCell({ x: 5, y: 5 })
    await studio.chooseMenuItem('File', 'New project')
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    expect(await studio.tileAt(5, 5)).toBe(4)
  })

  test('Discard changes goes ahead and throws the edits away', async ({ studio, page }) => {
    await studio.open()
    await studio.pickTile(4)
    await studio.clickCell({ x: 5, y: 5 })
    await studio.chooseMenuItem('File', 'New project')
    await dialog(page).getByRole('button', { name: 'Discard changes' }).click()
    await expect(dialog(page)).toBeHidden()
    expect(await studio.tileAt(5, 5)).toBe(1)
    await expect(studio.projectTitle).toHaveText('My Game')
    expect(await pickerCalls(page)).toBe(0)
  })

  test('Save, then continue saves first and then replaces the project', async ({
    studio,
    page,
  }) => {
    await studio.open()
    await studio.pickTile(4)
    await studio.clickCell({ x: 5, y: 5 })
    await studio.chooseMenuItem('File', 'New project')
    await dialog(page).getByRole('button', { name: 'Save, then continue' }).click()
    await expect(studio.status).toHaveText('Created “My Game”')
    expect(await studio.tileAt(5, 5)).toBe(1)
    const saved = await readFolder(page, 'my-game')
    expect(saved['maps/map-001.json']?.text).toContain('4')
  })

  test('does not replace the project when saving first is cancelled', async ({ studio, page }) => {
    await page.addInitScript(() => undefined)
    await studio.open()
    await page.evaluate(() => {
      Reflect.set(window, 'showDirectoryPicker', () =>
        Promise.reject(new DOMException('The user aborted a request.', 'AbortError')),
      )
    })
    await studio.pickTile(4)
    await studio.clickCell({ x: 5, y: 5 })
    await studio.chooseMenuItem('File', 'New project')
    await dialog(page).getByRole('button', { name: 'Save, then continue' }).click()
    await expect(dialog(page)).toBeHidden()
    expect(await studio.tileAt(5, 5)).toBe(4)
    await expect(studio.projectTitle).toHaveText('My Game •')
  })

  test('Open folder asks before the picker opens', async ({ studio, page }) => {
    await studio.open()
    await seedFolder(page, 'other', { 'project.json': '{}' })
    await studio.clickCell({ x: 5, y: 5 })
    await studio.chooseMenuItem('File', 'Open folder…')
    await expect(dialog(page)).toContainText('Opening a folder replaces the open project')
    expect(await pickerCalls(page)).toBe(0)
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
    expect(await pickerCalls(page)).toBe(0)
  })

  test('Import project asks before the file chooser opens', async ({ studio, page }) => {
    await studio.open()
    await studio.clickCell({ x: 5, y: 5 })
    let chooserOpened = false
    page.on('filechooser', () => {
      chooserOpened = true
    })
    await studio.chooseMenuItem('File', /Import project/)
    await expect(dialog(page)).toContainText('Importing a project replaces the open project')
    expect(chooserOpened).toBe(false)
    const chooser = page.waitForEvent('filechooser')
    await dialog(page).getByRole('button', { name: 'Discard changes' }).click()
    await chooser
  })
})

test.describe('leaving the page', () => {
  test('warns before closing a tab with unsaved changes', async ({ studio, page }) => {
    await studio.clickCell({ x: 5, y: 5 })
    await expect(studio.projectTitle).toHaveText('My Game •')
    const dialogSeen = page.waitForEvent('dialog')
    await page.close({ runBeforeUnload: true })
    expect((await dialogSeen).type()).toBe('beforeunload')
  })

  test('does not warn when everything is saved', async ({ studio, page }) => {
    let warned = false
    page.on('dialog', () => {
      warned = true
    })
    await expect(studio.projectTitle).toHaveText('My Game')
    await page.close({ runBeforeUnload: true })
    expect(warned).toBe(false)
  })

  test('stops warning once undo returns to the saved state', async ({ studio, page }) => {
    await studio.clickCell({ x: 5, y: 5 })
    await studio.undo()
    await expect(studio.projectTitle).toHaveText('My Game')
    let warned = false
    page.on('dialog', () => {
      warned = true
    })
    await page.close({ runBeforeUnload: true })
    expect(warned).toBe(false)
  })
})

test.describe('without folder support (Firefox, Safari)', () => {
  test.use({ openEditor: false })

  test.beforeEach(async ({ page }) => {
    await removeDirectoryPicker(page)
  })

  test('disables the folder commands and says why', async ({ studio, page }) => {
    await studio.open()
    await studio.menuButton('File').click()
    const open = page.getByRole('menuitem', { name: /Open folder/ })
    await expect(open).toBeDisabled()
    await expect(open).toContainText('Not supported in this browser')
    await expect(page.getByRole('menuitem', { name: SAVE })).toBeDisabled()
    await expect(page.getByRole('menuitem', { name: 'Save to another folder…' })).toBeDisabled()
    // The zip commands do not need the picker.
    await expect(page.getByRole('menuitem', { name: 'New project' })).toBeEnabled()
    await expect(page.getByRole('menuitem', { name: /Import project/ })).toBeEnabled()
    await expect(page.getByRole('menuitem', { name: /Download project/ })).toBeEnabled()
    await expect(page.getByRole('menuitem', { name: /Export game/ })).toBeEnabled()
  })

  test('Ctrl+S points to the zip commands instead of failing silently', async ({
    studio,
    page,
  }) => {
    await studio.open()
    await page.keyboard.press('Control+s')
    await expect(studio.status).toContainText('This browser cannot open folders')
    await expect(studio.status).toContainText('Download project (.zip)')
  })

  test('the unsaved-changes question offers a download instead of a save', async ({
    studio,
    page,
  }) => {
    await studio.open()
    await studio.clickCell({ x: 5, y: 5 })
    await studio.chooseMenuItem('File', 'New project')
    await expect(dialog(page)).toContainText('File ▸ Download project (.zip)')
    await expect(dialog(page).getByRole('button', { name: 'Save, then continue' })).toBeHidden()
    await expect(dialog(page).getByRole('button', { name: 'Discard changes' })).toBeVisible()
  })
})
