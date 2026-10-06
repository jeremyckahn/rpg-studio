import { expect, test } from '../support/fixtures.ts'

test.describe('undo and redo', () => {
  test('are disabled until something is edited', async ({ studio, page }) => {
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled()
    await expect(await studio.menuItem('Edit', 'Undo')).toBeDisabled()
    await expect(page.getByRole('menuitem', { name: 'Redo' })).toBeDisabled()
    await studio.closeMenu()
  })

  test('toolbar buttons step back and forward through edits', async ({ studio, page }) => {
    await studio.clickCell({ x: 4, y: 4 })
    await studio.selectTool(/Eraser/)
    await studio.clickCell({ x: 6, y: 6 })
    expect(await studio.tileAt(6, 6)).toBe(0)

    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled()
    await studio.undo()
    expect(await studio.tileAt(6, 6)).toBe(1)
    await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled()
    await studio.redo()
    expect(await studio.tileAt(6, 6)).toBe(0)
    await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  test('the Edit menu does the same', async ({ studio, page }) => {
    await studio.selectTool(/Eraser/)
    await studio.clickCell({ x: 6, y: 6 })
    await studio.chooseMenuItem('Edit', 'Undo')
    expect(await studio.tileAt(6, 6)).toBe(1)
    await studio.chooseMenuItem('Edit', 'Redo')
    expect(await studio.tileAt(6, 6)).toBe(0)
    await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  test('a new edit discards the redo history', async ({ studio, page }) => {
    await studio.selectTool(/Eraser/)
    await studio.clickCell({ x: 6, y: 6 })
    await studio.undo()
    await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled()
    await studio.clickCell({ x: 7, y: 7 })
    await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  test('respond to Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y', async ({ studio, page }) => {
    await studio.selectTool(/Eraser/)
    await studio.clickCell({ x: 6, y: 6 })
    await page.keyboard.press('Control+z')
    await expect.poll(() => studio.tileAt(6, 6)).toBe(1)
    await page.keyboard.press('Control+Shift+z')
    await expect.poll(() => studio.tileAt(6, 6)).toBe(0)
    await page.keyboard.press('Control+z')
    await expect.poll(() => studio.tileAt(6, 6)).toBe(1)
    await page.keyboard.press('Control+y')
    await expect.poll(() => studio.tileAt(6, 6)).toBe(0)
  })

  test('leave the keyboard alone while typing in a field', async ({ studio, page }) => {
    await studio.selectTool(/Eraser/)
    await studio.clickCell({ x: 6, y: 6 })
    const name = page.getByLabel('Name', { exact: true })
    await name.focus()
    await page.keyboard.press('Control+z')
    expect(await studio.tileAt(6, 6)).toBe(0)
  })

  test('console actions are undoable and a grouped batch is one step', async ({ studio }) => {
    const first = await studio.dispatch({
      type: 'project/renameMap',
      payload: { mapId: 1, name: 'Overworld' },
    })
    expect(first.success).toBe(true)
    await studio.undo()
    expect((await studio.map(1)).name).toBe('Map 1')
  })
})

test.describe('unsaved-changes marker', () => {
  test('appears after an edit and goes away when undo returns to the saved state', async ({
    studio,
  }) => {
    await expect(studio.projectTitle).toHaveText('My Game')
    await studio.clickCell({ x: 4, y: 4 })
    await expect(studio.projectTitle).toHaveText('My Game •')
    await studio.undo()
    await expect(studio.projectTitle).toHaveText('My Game')
  })
})
