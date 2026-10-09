import { expect, test } from '../support/fixtures.ts'
import { recordAlerts, shownAlerts } from '../support/studio.ts'

test.describe('app shell', () => {
  test('boots into a starter project with its workspaces', async ({ studio, page }) => {
    await expect(page).toHaveTitle('RPG Studio')
    await expect(page.getByRole('tab', { name: 'Map' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: 'Play' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Database' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Sprite Editor' })).toBeVisible()
    await expect(studio.projectTitle).toHaveText('My Game')

    const summary = await studio.summary()
    expect(summary.name).toBe('My Game')
    expect(summary.maps).toEqual([expect.objectContaining({ id: 1, width: 20, height: 15 })])
    expect(summary.counts).toMatchObject({ actors: 1, classes: 1, items: 1, skills: 1, enemies: 0 })
  })

  test('shows the docked panels for the map workspace', async ({ page }) => {
    await expect(page.getByRole('complementary', { name: 'Asset browser' })).toBeVisible()
    await expect(page.getByText('Maps', { exact: true })).toBeVisible()
    await expect(page.getByText('Layers', { exact: true })).toBeVisible()
    await expect(page.getByText('Tileset', { exact: true })).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'right panels' })).toBeVisible()
    await expect(page.getByText('Game start')).toBeVisible()
    await expect(page.getByText('Events (JSON)')).toBeVisible()
  })

  test('hides the map-only panels on other workspaces', async ({ page }) => {
    await page.getByRole('tab', { name: 'Database' }).click()
    await expect(page.getByRole('complementary', { name: 'right panels' })).toBeHidden()
    await expect(page.getByText('Tileset', { exact: true })).toBeHidden()
    await page.getByRole('tab', { name: 'Map' }).click()
    await expect(page.getByText('Tileset', { exact: true })).toBeVisible()
  })

  test('announces a new project in a toast that can be dismissed', async ({ studio }) => {
    await studio.chooseMenuItem('File', 'New project')
    await expect(studio.status).toHaveText('Created “My Game”')
    await studio.status.getByRole('button', { name: 'Close' }).click()
    await expect(studio.status).toBeHidden()
  })
})

test.describe('first launch', () => {
  test.use({ openEditor: false })

  test('says it created the starter project', async ({ studio, page }) => {
    await recordAlerts(page)
    await studio.open()
    expect(await shownAlerts(page)).toContain('Created “My Game”')
  })
})

test.describe('console API (window.RPGStudio)', () => {
  test('actions from the console appear in the UI and can be undone', async ({ studio, page }) => {
    await studio.dispatch({ type: 'project/renameMap', payload: { mapId: 1, name: 'Overworld' } })
    await expect(page.getByRole('button', { name: /1\. Overworld/ })).toBeVisible()
    await studio.undo()
    await expect(page.getByRole('button', { name: /1\. Map 1/ })).toBeVisible()
  })
})
