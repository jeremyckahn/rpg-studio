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

  test('renames the map when the field loses focus', async ({ studio, page }) => {
    await right(page).getByLabel('Name', { exact: true }).fill('Forest')
    await right(page).getByLabel('Width', { exact: true }).focus()
    await expect.poll(async () => (await studio.map(1)).name).toBe('Forest')
  })

  test('typing does not create undo steps until the value is committed', async ({
    studio,
    page,
  }) => {
    await right(page).getByLabel('Name', { exact: true }).pressSequentially('abc')
    expect((await studio.summary()).revision).toBe(0)
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })

  test('keeps the old name when the new one is blank', async ({ studio, page }) => {
    await enter(page, 'Name', '   ')
    expect((await studio.map(1)).name).toBe('Map 1')
  })

  test('grows the map, keeping what was painted', async ({ studio, page }) => {
    await studio.dispatch({
      type: 'project/setTiles',
      payload: { mapId: 1, layer: 0, cells: [{ x: 19, y: 14, tile: 4 }] },
    })
    await enter(page, 'Width', '24')
    await enter(page, 'Height', '18')
    const map = await studio.map(1)
    expect(map).toMatchObject({ width: 24, height: 18 })
    expect(map.layers[0]?.data).toHaveLength(24 * 18)
    expect(await studio.tileAt(19, 14)).toBe(4)
    // New cells are empty, not grass.
    expect(await studio.tileAt(23, 17)).toBe(0)
    await expect(page.getByText('24×18')).toBeVisible()
  })

  test('shrinks the map and drops events that fall outside', async ({ studio, page }) => {
    await studio.dispatch({
      type: 'project/upsertMapEvent',
      payload: {
        mapId: 1,
        event: { id: 1, name: 'Far', x: 18, y: 2, pages: [{ commands: [] }] },
      },
    })
    await studio.dispatch({
      type: 'project/upsertMapEvent',
      payload: {
        mapId: 1,
        event: { id: 2, name: 'Near', x: 2, y: 2, pages: [{ commands: [] }] },
      },
    })
    await enter(page, 'Width', '12')
    const map = await studio.map(1)
    expect(map.width).toBe(12)
    expect(map.events.map((event) => event.name)).toEqual(['Near'])
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

  test('a valid size afterwards clears the warning', async ({ page }) => {
    await enter(page, 'Width', '600')
    await expect(right(page).getByRole('alert')).toBeVisible()
    await enter(page, 'Width', '22')
    await expect(right(page).getByRole('alert')).toBeHidden()
  })

  test('refuses a size a door would be left outside of', async ({ studio, page }) => {
    await studio.dispatch({
      type: 'project/createMap',
      payload: { name: 'Cellar', width: 10, height: 10, tileSize: 16 },
    })
    await studio.dispatch({
      type: 'project/upsertMapEvent',
      payload: {
        mapId: 1,
        event: {
          id: 1,
          name: 'Door',
          x: 2,
          y: 2,
          pages: [
            { trigger: 'touch', commands: [{ command: 'TransferPlayer', mapId: 2, x: 8, y: 8 }] },
          ],
        },
      },
    })
    await page.getByRole('complementary', { name: 'Asset browser' }).getByText('2. Cellar').click()
    await enter(page, 'Width', '5')
    await expect(right(page).getByRole('alert')).toBeVisible()
    expect((await studio.map(2)).width).toBe(10)
  })
})

test.describe('game start', () => {
  test('shows the start map and position', async ({ page }) => {
    await expect(right(page).getByRole('combobox', { name: 'Start map' })).toHaveText('1. Map 1')
    await expect(right(page).getByLabel('Start X')).toHaveValue('10')
    await expect(right(page).getByLabel('Start Y')).toHaveValue('7')
    await expect(right(page).getByLabel('Project name')).toHaveValue('My Game')
  })

  test('changes the start position', async ({ studio, page }) => {
    await enter(page, 'Start X', '3')
    await enter(page, 'Start Y', '4')
    const summary = await studio.summary()
    expect([summary.startX, summary.startY]).toEqual([3, 4])
  })

  test('clamps a negative start position to zero', async ({ studio, page }) => {
    await enter(page, 'Start X', '-5')
    expect((await studio.summary()).startX).toBe(0)
  })

  test('refuses a start position off the map', async ({ studio, page }) => {
    await enter(page, 'Start X', '99')
    expect((await studio.summary()).startX).toBe(10)
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
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

  test('reports text that is not JSON', async ({ studio, page }) => {
    await events(page).fill('[{')
    await apply(page).click()
    await expect(right(page).getByRole('alert')).toContainText('Not valid JSON')
    expect((await studio.map(1)).events).toHaveLength(0)
  })

  test('reports schema problems with the path of the bad field', async ({ studio, page }) => {
    await events(page).fill(JSON.stringify([{ ...npc, colour: 'red' }]))
    await apply(page).click()
    await expect(right(page).getByRole('alert')).toContainText('events.0')
    expect((await studio.map(1)).events).toHaveLength(0)

    await events(page).fill(JSON.stringify([{ ...npc, pages: [] }]))
    await apply(page).click()
    await expect(right(page).getByRole('alert')).toContainText('events.0.pages')
  })

  test('refuses an event that would break the project', async ({ studio, page }) => {
    const door = {
      id: 1,
      name: 'Door',
      x: 2,
      y: 2,
      pages: [
        { trigger: 'touch', commands: [{ command: 'TransferPlayer', mapId: 42, x: 1, y: 1 }] },
      ],
    }
    await events(page).fill(JSON.stringify([door]))
    await apply(page).click()
    await expect(right(page).getByRole('alert')).toContainText('Event 1')
    expect((await studio.map(1)).events).toHaveLength(0)
  })

  test('refuses an event outside the map', async ({ studio, page }) => {
    await events(page).fill(JSON.stringify([{ ...npc, x: 50 }]))
    await apply(page).click()
    await expect(right(page).getByRole('alert')).toBeVisible()
    expect((await studio.map(1)).events).toHaveLength(0)
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
