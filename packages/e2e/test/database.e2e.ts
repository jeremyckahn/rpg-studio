import { type Page } from '@playwright/test'

import { expect, test } from '../support/fixtures.ts'

const TABLES = ['actors', 'classes', 'items', 'skills', 'enemies'] as const

test.beforeEach(async ({ page, studio }) => {
  await page.getByRole('tab', { name: 'Database' }).click()
  await expect(page.getByRole('grid')).toBeVisible()
  // The "Created …" toast would otherwise share the alert role with grid errors.
  await studio.dismissStatus()
})

/** A row's checkbox. Its accessible name flips between "Select row" and "Unselect row", so go by position. */
const rowCheckbox = (page: Page, id: number) =>
  page.locator(`[role="row"][data-id="${id}"]`).getByRole('checkbox')

const selectRow = async (page: Page, id: number): Promise<void> => {
  await rowCheckbox(page, id).click()
  await expect(rowCheckbox(page, id)).toBeChecked()
}

const cell = (page: Page, id: number, field: string) =>
  page.locator(`[role="row"][data-id="${id}"] [data-field="${field}"]`)

/** Opens a cell's editor, replaces its text and commits with Enter. */
const edit = async (page: Page, id: number, field: string, text: string): Promise<void> => {
  await cell(page, id, field).dblclick()
  const input = cell(page, id, field).locator('input')
  await input.fill(text)
  await input.press('Enter')
}

const tab = (page: Page, table: string, count: number) =>
  page.getByRole('tab', { name: `${table} (${count})` })

const error = (page: Page) => page.getByRole('alert')

test.describe('tables', () => {
  test('has one tab per table showing how many records it holds', async ({ page }) => {
    await expect(tab(page, 'Actors', 1)).toHaveAttribute('aria-selected', 'true')
    await expect(tab(page, 'Classes', 1)).toBeVisible()
    await expect(tab(page, 'Items', 1)).toBeVisible()
    await expect(tab(page, 'Skills', 1)).toBeVisible()
    await expect(tab(page, 'Enemies', 0)).toBeVisible()
  })

  test('builds the columns of each table from its schema', async ({ page }) => {
    const headers = page.getByRole('columnheader')
    await expect(
      headers.filter({ hasText: /^(id|name|nickname|classId|initialLevel)$/ }),
    ).toHaveCount(5)
    await tab(page, 'Items', 1).click()
    await expect(headers.filter({ hasText: /^(kind|price|effects)$/ })).toHaveCount(3)
    await tab(page, 'Skills', 1).click()
    await expect(headers.filter({ hasText: /^(mpCost|target|element)$/ })).toHaveCount(3)
    await tab(page, 'Classes', 1).click()
    await expect(headers.filter({ hasText: /^(baseStats|growth|learnings)$/ })).toHaveCount(3)
  })

  test('shows the starter records', async ({ page }) => {
    await expect(cell(page, 1, 'name')).toHaveText('Hero')
    await tab(page, 'Classes', 1).click()
    await expect(cell(page, 1, 'name')).toHaveText('Warrior')
    await tab(page, 'Items', 1).click()
    await expect(cell(page, 1, 'name')).toHaveText('Potion')
    await expect(cell(page, 1, 'kind')).toHaveText('consumable')
    await expect(cell(page, 1, 'effects')).toHaveText('[{"type":"recoverHp","value":50}]')
    await tab(page, 'Skills', 1).click()
    await expect(cell(page, 1, 'name')).toHaveText('Power Strike')
  })

  test('opens on the table you left it on when you come back from another workspace', async ({
    page,
  }) => {
    await tab(page, 'Items', 1).click()
    await page.getByRole('tab', { name: 'Map' }).click()
    await page.getByRole('tab', { name: 'Database' }).click()
    await expect(tab(page, 'Items', 1)).toHaveAttribute('aria-selected', 'true')
  })
})

test.describe('adding records', () => {
  for (const table of TABLES) {
    test(`adds a valid ${table} record with the next free id`, async ({ studio, page }) => {
      await tab(
        page,
        table.charAt(0).toUpperCase() + table.slice(1),
        table === 'enemies' ? 0 : 1,
      ).click()
      const before = (await studio.table(table)).length
      await page.getByRole('button', { name: /^Add / }).click()
      await expect.poll(async () => (await studio.table(table)).length).toBe(before + 1)
      const rows = await studio.table<{ id: number }>(table)
      expect(rows.at(-1)?.id).toBe(before + 1)
      await expect(cell(page, before + 1, 'id')).toBeVisible()
    })
  }

  test('labels the Add button with the singular of each table', async ({ page }) => {
    const labels = ['actor', 'class', 'item', 'skill', 'enemy']
    const tabs = ['Actors', 'Classes', 'Items', 'Skills', 'Enemies']
    for (const [index, label] of labels.entries()) {
      await page.getByRole('tab', { name: new RegExp(`^${tabs[index] ?? ''} \\(`, 'i') }).click()
      await expect(page.getByRole('button', { name: `Add ${label}`, exact: true })).toBeVisible()
    }
  })

  test('names new records after their id', async ({ studio, page }) => {
    await page.getByRole('button', { name: /^Add / }).click()
    await expect(cell(page, 2, 'name')).toHaveText('Actor 2')
    expect(await studio.table('actors')).toEqual([
      expect.objectContaining({ id: 1, name: 'Hero' }),
      expect.objectContaining({ id: 2, name: 'Actor 2', classId: 1 }),
    ])
  })

  test('is undoable', async ({ studio, page }) => {
    await page.getByRole('button', { name: /^Add / }).click()
    await expect(tab(page, 'Actors', 2)).toBeVisible()
    await studio.undo()
    await expect(tab(page, 'Actors', 1)).toBeVisible()
  })

  test('explains that an actor needs a class when none exists', async ({ studio, page }) => {
    // The starting party uses the hero, and the hero uses the class: free them in order.
    await studio.dispatch({ type: 'project/updateMeta', payload: { changes: { startParty: [] } } })
    await selectRow(page, 1)
    await page.getByRole('button', { name: 'Delete selected' }).click()
    await expect(tab(page, 'Actors', 0)).toBeVisible()
    await tab(page, 'Classes', 1).click()
    await selectRow(page, 1)
    await page.getByRole('button', { name: 'Delete selected' }).click()
    await expect(tab(page, 'Classes', 0)).toBeVisible()

    await tab(page, 'Actors', 0).click()
    await page.getByRole('button', { name: /^Add / }).click()
    await expect(error(page)).toContainText('Create a class first')
    await expect(tab(page, 'Actors', 0)).toBeVisible()
  })
})

test.describe('editing cells', () => {
  test('edits a text cell and the project follows', async ({ studio, page }) => {
    await edit(page, 1, 'name', 'Aria')
    await expect(cell(page, 1, 'name')).toHaveText('Aria')
    expect(await studio.table('actors')).toEqual([expect.objectContaining({ id: 1, name: 'Aria' })])
    await expect(studio.projectTitle).toHaveText('My Game •')
  })

  test('edits an optional text cell, and clearing it works', async ({ studio, page }) => {
    await edit(page, 1, 'nickname', 'The Brave')
    expect(await studio.table('actors')).toEqual([
      expect.objectContaining({ nickname: 'The Brave' }),
    ])
    await edit(page, 1, 'nickname', '')
    expect(await studio.table('actors')).toEqual([expect.objectContaining({ nickname: '' })])
  })

  test('edits a number cell', async ({ studio, page }) => {
    await edit(page, 1, 'initialLevel', '5')
    expect(await studio.table('actors')).toEqual([expect.objectContaining({ initialLevel: 5 })])
  })

  test('edits an enum cell from a list of choices', async ({ studio, page }) => {
    await tab(page, 'Items', 1).click()
    await cell(page, 1, 'kind').dblclick()
    await expect(page.getByRole('option')).toHaveText(['consumable', 'weapon', 'armor', 'key'])
    await page.getByRole('option', { name: 'weapon' }).click()
    // Picking a choice only fills the editor; leaving the cell commits it.
    await cell(page, 1, 'id').click()
    await expect
      .poll(async () => (await studio.table('items'))[0])
      .toMatchObject({ kind: 'weapon' })
  })

  test('edits a JSON cell', async ({ studio, page }) => {
    await tab(page, 'Items', 1).click()
    await edit(page, 1, 'effects', '[{"type":"recoverMp","value":9}]')
    expect(await studio.table('items')).toEqual([
      expect.objectContaining({ effects: [{ type: 'recoverMp', value: 9 }] }),
    ])
  })

  test('does not edit the id', async ({ page }) => {
    await cell(page, 1, 'id').dblclick()
    await expect(cell(page, 1, 'id').locator('input')).toHaveCount(0)
  })

  test('undo reverts a cell edit', async ({ studio, page }) => {
    await edit(page, 1, 'name', 'Aria')
    await expect(cell(page, 1, 'name')).toHaveText('Aria')
    await studio.undo()
    await expect(cell(page, 1, 'name')).toHaveText('Hero')
  })

  test('the console API sees the same data as the grid', async ({ studio, page }) => {
    await studio.dispatch({
      type: 'project/upsertRecord',
      payload: {
        table: 'actors',
        record: { id: 1, name: 'Renamed', classId: 1 },
      },
    })
    await expect(cell(page, 1, 'name')).toHaveText('Renamed')
  })
})

test.describe('refused edits', () => {
  test('a value the schema rejects reverts the cell and explains why', async ({ studio, page }) => {
    await edit(page, 1, 'name', '')
    await expect(error(page)).toBeVisible()
    // The grid keeps the bad value in the editor so it can be fixed; Escape gives the old one back.
    await page.keyboard.press('Escape')
    await expect(cell(page, 1, 'name')).toHaveText('Hero')
    expect(await studio.table('actors')).toEqual([expect.objectContaining({ name: 'Hero' })])
  })

  test('a number outside its range is refused', async ({ studio, page }) => {
    await edit(page, 1, 'initialLevel', '0')
    await expect(error(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(cell(page, 1, 'initialLevel')).toHaveText('1')
    expect(await studio.table('actors')).toEqual([expect.objectContaining({ initialLevel: 1 })])
  })

  test('a reference to something that does not exist is refused', async ({ studio, page }) => {
    await edit(page, 1, 'classId', '99')
    await expect(error(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(cell(page, 1, 'classId')).toHaveText('1')
    expect(await studio.table('actors')).toEqual([expect.objectContaining({ classId: 1 })])
  })

  test('JSON that does not parse is refused', async ({ studio, page }) => {
    await tab(page, 'Items', 1).click()
    await edit(page, 1, 'effects', '[{oops')
    await expect(error(page)).toBeVisible()
    expect(await studio.table('items')).toEqual([
      expect.objectContaining({ effects: [{ type: 'recoverHp', value: 50 }] }),
    ])
  })

  test('JSON of the wrong shape is refused with the schema message', async ({ studio, page }) => {
    await tab(page, 'Items', 1).click()
    await edit(page, 1, 'effects', '[{"type":"explode","value":1}]')
    await expect(error(page)).toBeVisible()
    expect(await studio.table('items')).toEqual([
      expect.objectContaining({ effects: [{ type: 'recoverHp', value: 50 }] }),
    ])
  })

  test('a refusal can be dismissed', async ({ page }) => {
    await edit(page, 1, 'name', '')
    await error(page).getByRole('button', { name: 'Close' }).click()
    await expect(error(page)).toBeHidden()
  })

  test('a later good edit clears the old error', async ({ page }) => {
    await edit(page, 1, 'name', '')
    await expect(error(page)).toBeVisible()
    await edit(page, 1, 'name', 'Aria')
    await expect(error(page)).toBeHidden()
  })
})

test.describe('deleting records', () => {
  test('Delete selected is disabled until a row is selected', async ({ page }) => {
    const remove = page.getByRole('button', { name: 'Delete selected' })
    await expect(remove).toBeDisabled()
    await selectRow(page, 1)
    await expect(remove).toBeEnabled()
    await rowCheckbox(page, 1).click()
    await expect(rowCheckbox(page, 1)).not.toBeChecked()
    await expect(remove).toBeDisabled()
  })

  test('selecting a row by clicking its cell does not select it', async ({ page }) => {
    await cell(page, 1, 'name').click()
    await expect(page.getByRole('button', { name: 'Delete selected' })).toBeDisabled()
  })

  test('deletes the selected records', async ({ studio, page }) => {
    await page.getByRole('button', { name: /^Add / }).click()
    await expect(tab(page, 'Actors', 2)).toBeVisible()
    await selectRow(page, 2)
    await page.getByRole('button', { name: 'Delete selected' }).click()
    await expect(tab(page, 'Actors', 1)).toBeVisible()
    expect(await studio.table('actors')).toEqual([expect.objectContaining({ id: 1 })])
    await expect(page.getByRole('button', { name: 'Delete selected' })).toBeDisabled()
  })

  test('select-all selects every row, and all of them can go', async ({ studio, page }) => {
    await studio.dispatch({ type: 'project/updateMeta', payload: { changes: { startParty: [] } } })
    await page.getByRole('button', { name: /^Add / }).click()
    await expect(tab(page, 'Actors', 2)).toBeVisible()
    await page.getByRole('columnheader').getByRole('checkbox').click()
    await expect(rowCheckbox(page, 1)).toBeChecked()
    await expect(rowCheckbox(page, 2)).toBeChecked()
    await page.getByRole('button', { name: 'Delete selected' }).click()
    await expect(tab(page, 'Actors', 0)).toBeVisible()
    expect(await studio.table('actors')).toEqual([])
  })

  test('refuses to delete a record that something still uses, and says what', async ({
    studio,
    page,
  }) => {
    await tab(page, 'Classes', 1).click()
    await selectRow(page, 1)
    await page.getByRole('button', { name: 'Delete selected' }).click()
    await expect(error(page)).toContainText('#1')
    await expect(tab(page, 'Classes', 1)).toBeVisible()
    expect(await studio.table('classes')).toHaveLength(1)
  })

  test('deleting is undoable', async ({ studio, page }) => {
    await page.getByRole('button', { name: /^Add / }).click()
    await selectRow(page, 2)
    await page.getByRole('button', { name: 'Delete selected' }).click()
    await expect(tab(page, 'Actors', 1)).toBeVisible()
    await studio.undo()
    await expect(tab(page, 'Actors', 2)).toBeVisible()
  })

  test('forgets the selection when you change table', async ({ page }) => {
    await selectRow(page, 1)
    await tab(page, 'Items', 1).click()
    await expect(page.getByRole('button', { name: 'Delete selected' })).toBeDisabled()
  })
})
