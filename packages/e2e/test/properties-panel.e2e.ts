import { type Page } from '@playwright/test'

import { expect, test } from '../support/fixtures.ts'

const right = (page: Page) => page.getByRole('complementary', { name: 'right panels' })

/** Types into a commit-on-blur field and leaves it. */
const enter = async (page: Page, label: string, value: string): Promise<void> => {
  const field = right(page).getByLabel(label, { exact: true })
  await field.fill(value)
  await field.press('Enter')
}

test.describe('map properties', () => {
  test('shows the selected map', async ({ page }) => {
    await expect(right(page).getByLabel('Name', { exact: true })).toHaveValue('Map 1')
    await expect(right(page).getByLabel('Width', { exact: true })).toHaveValue('20')
    await expect(right(page).getByLabel('Height', { exact: true })).toHaveValue('15')
    await expect(page.getByText('Tileset: img/tilesets/basic.png · 16px tiles')).toBeVisible()
  })

  test('renames the map when Enter is pressed', async ({ studio, page }) => {
    await enter(page, 'Name', 'Overworld')
    expect((await studio.map(1)).name).toBe('Overworld')
    await expect(
      page.getByRole('complementary', { name: 'Asset browser' }).getByText('1. Overworld'),
    ).toBeVisible()
    await expect(page.getByText(/^Overworld · layer/)).toBeVisible()
  })

  test('keeps the old name when the new one is blank', async ({ studio, page }) => {
    await enter(page, 'Name', '   ')
    expect((await studio.map(1)).name).toBe('Map 1')
  })

  test('moves the start position onto the map when the start map shrinks', async ({
    studio,
    page,
  }) => {
    await enter(page, 'Width', '5')
    await enter(page, 'Height', '4')
    const summary = await studio.summary()
    expect(summary.startX).toBe(4)
    expect(summary.startY).toBe(3)
    await expect(right(page).getByLabel('Start X')).toHaveValue('4')
  })

  test('explains why an impossible size is refused and leaves the map alone', async ({
    studio,
    page,
  }) => {
    await enter(page, 'Width', '600')
    await expect(right(page).getByRole('alert')).toBeVisible()
    expect((await studio.map(1)).width).toBe(20)

    await enter(page, 'Width', '0')
    await expect(right(page).getByRole('alert')).toBeVisible()
    expect((await studio.map(1)).width).toBe(20)
  })

  test('puts the stored size back in the field when a size is refused', async ({ page }) => {
    await enter(page, 'Width', '600')
    await expect(right(page).getByRole('alert')).toBeVisible()
    await expect(right(page).getByLabel('Width', { exact: true })).toHaveValue('20')
  })

  test('a refused size does not discard what was typed in the other size field', async ({
    page,
  }) => {
    await right(page).getByLabel('Height', { exact: true }).fill('12')
    await enter(page, 'Width', '600')
    await expect(right(page).getByRole('alert')).toBeVisible()
    await expect(right(page).getByLabel('Height', { exact: true })).toHaveValue('12')
  })

  test('a size warning does not follow you to another map', async ({ studio, page }) => {
    await studio.dispatch({
      type: 'project/createMap',
      payload: { name: 'Cellar', width: 8, height: 6, tileSize: 16 },
    })
    await enter(page, 'Width', '600')
    await expect(right(page).getByRole('alert')).toBeVisible()
    await page.getByRole('complementary', { name: 'Asset browser' }).getByText('2. Cellar').click()
    await expect(right(page).getByLabel('Name', { exact: true })).toHaveValue('Cellar')
    await expect(right(page).getByRole('alert')).toBeHidden()
  })

  test('a valid size afterwards clears the warning', async ({ page }) => {
    await enter(page, 'Width', '600')
    await expect(right(page).getByRole('alert')).toBeVisible()
    await enter(page, 'Width', '22')
    await expect(right(page).getByRole('alert')).toBeHidden()
  })
})

test.describe('game start', () => {
  test('shows the start map and position', async ({ page }) => {
    await expect(right(page).getByRole('combobox', { name: 'Start map' })).toHaveText('1. Map 1')
    await expect(right(page).getByLabel('Start X')).toHaveValue('10')
    await expect(right(page).getByLabel('Start Y')).toHaveValue('7')
    await expect(right(page).getByLabel('Project name')).toHaveValue('My Game')
  })

  test('clamps a negative start position to zero', async ({ studio, page }) => {
    await enter(page, 'Start X', '-5')
    expect((await studio.summary()).startX).toBe(0)
  })

  test('refuses a start position off the map, says why and restores the field', async ({
    studio,
    page,
  }) => {
    await enter(page, 'Start X', '99')
    expect((await studio.summary()).startX).toBe(10)
    await expect(right(page).getByRole('alert')).toBeVisible()
    await expect(right(page).getByLabel('Start X')).toHaveValue('10')
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()

    // A valid position afterwards clears the warning.
    await enter(page, 'Start X', '4')
    await expect(right(page).getByRole('alert')).toBeHidden()
    expect((await studio.summary()).startX).toBe(4)
  })

  test('moves the start to another map and resets the position', async ({ studio, page }) => {
    await studio.dispatch({
      type: 'project/createMap',
      payload: { name: 'Cellar', width: 8, height: 6, tileSize: 16 },
    })
    await right(page).getByRole('combobox', { name: 'Start map' }).click()
    await page.getByRole('option', { name: '2. Cellar' }).click()
    const summary = await studio.summary()
    expect([summary.startMapId, summary.startX, summary.startY]).toEqual([2, 0, 0])
    // The new start map is protected from deletion; the old one is no longer.
    await expect(page.getByRole('button', { name: 'Delete Cellar', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Delete Map 1', exact: true })).toBeEnabled()
  })

  test('renames the project, which updates the title bar', async ({ studio, page }) => {
    await enter(page, 'Project name', 'Quest of Tests')
    expect((await studio.summary()).name).toBe('Quest of Tests')
    await expect(studio.projectTitle).toContainText('Quest of Tests')
  })

  test('keeps the project name when the new one is blank', async ({ studio, page }) => {
    await enter(page, 'Project name', '  ')
    expect((await studio.summary()).name).toBe('My Game')
  })
})

test.describe('events (JSON)', () => {
  const events = (page: Page) => page.getByLabel('Map events JSON')
  const apply = (page: Page) => page.getByRole('button', { name: 'Apply events' })

  const npc = {
    id: 1,
    name: 'Elder',
    x: 10,
    y: 8,
    pages: [{ commands: [{ command: 'ShowText', text: 'Hello, traveller.' }] }],
  }

  test('starts as an empty list with Apply disabled', async ({ page }) => {
    await expect(events(page)).toHaveValue('[]')
    await expect(apply(page)).toBeDisabled()
  })

  test('adds an event from JSON', async ({ studio, page }) => {
    await events(page).fill(JSON.stringify([npc]))
    await expect(apply(page)).toBeEnabled()
    await apply(page).click()
    const map = await studio.map(1)
    expect(map.events).toHaveLength(1)
    expect(map.events[0]).toMatchObject({ name: 'Elder', x: 10, y: 8 })
    // Defaults are filled in and the editor shows the canonical form.
    await expect(events(page)).toHaveValue(/"trigger": "action"/)
    await expect(apply(page)).toBeDisabled()
  })

  test('replaces and removes events, all as one undo step', async ({ studio, page }) => {
    await studio.dispatch({
      type: 'project/upsertMapEvent',
      payload: { mapId: 1, event: { id: 1, name: 'Old', x: 1, y: 1, pages: [{ commands: [] }] } },
    })
    await expect(events(page)).toHaveValue(/Old/)
    const second = { ...npc, id: 2, x: 3, y: 3 }
    await events(page).fill(JSON.stringify([second]))
    await apply(page).click()
    expect((await studio.map(1)).events.map((event) => event.id)).toEqual([2])

    await studio.undo()
    expect((await studio.map(1)).events.map((event) => event.name)).toEqual(['Old'])
  })

  test('clears every event with an empty list', async ({ studio, page }) => {
    await events(page).fill(JSON.stringify([npc]))
    await apply(page).click()
    await expect.poll(async () => (await studio.map(1)).events.length).toBe(1)
    await events(page).fill('[]')
    await apply(page).click()
    await expect.poll(async () => (await studio.map(1)).events.length).toBe(0)
  })

  test('shows each map its own events', async ({ studio, page }) => {
    await studio.dispatch({
      type: 'project/createMap',
      payload: { name: 'Cellar', width: 8, height: 6, tileSize: 16 },
    })
    await events(page).fill(JSON.stringify([npc]))
    await apply(page).click()
    await page.getByRole('complementary', { name: 'Asset browser' }).getByText('2. Cellar').click()
    await expect(events(page)).toHaveValue('[]')
    await page.getByRole('complementary', { name: 'Asset browser' }).getByText('1. Map 1').click()
    await expect(events(page)).toHaveValue(/Elder/)
  })

  test('draws event boxes on the canvas', async ({ studio, page }) => {
    const before = await studio.canvasImage()
    await events(page).fill(JSON.stringify([npc]))
    await apply(page).click()
    await expect.poll(async () => (await studio.canvasImage()).equals(before)).toBe(false)
  })
})
