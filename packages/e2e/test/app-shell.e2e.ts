import { expect, test } from '../support/fixtures.ts'
import { recordAlerts, shownAlerts } from '../support/studio.ts'

test.describe('app shell', () => {
  test('boots into a starter project with the three workspaces', async ({ studio, page }) => {
    await expect(page).toHaveTitle('RPG Studio')
    await expect(page.getByRole('tab', { name: 'Map' })).toHaveAttribute('aria-selected', 'true')
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

  test('links the ? button to the user guide in a new tab', async ({ page }) => {
    const guide = page.getByRole('link', { name: 'User guide' })
    await expect(guide).toHaveAttribute('href', 'https://github.com/jeremyckahn/rpg-studio/wiki')
    await expect(guide).toHaveAttribute('target', '_blank')
    await expect(guide).toHaveAttribute('rel', /noopener/)
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
  test('is installed but not enumerable', async ({ page }) => {
    const info = await page.evaluate(() => ({
      version: window.RPGStudio ? Number(Reflect.get(window.RPGStudio, 'version')) : null,
      enumerable: Object.keys(window).includes('RPGStudio'),
    }))
    expect(info).toEqual({ version: 1, enumerable: false })
  })

  test('answers queries', async ({ studio }) => {
    const map = await studio.map(1)
    expect(map).toMatchObject({ id: 1, name: 'Map 1', width: 20, height: 15, tileSize: 16 })
    expect(await studio.table('actors')).toEqual([expect.objectContaining({ name: 'Hero' })])
    expect(await studio.assets()).toEqual([
      expect.objectContaining({ path: 'img/tilesets/basic.png' }),
    ])
  })

  test('rejects an invalid query with the reason', async ({ page }) => {
    const message = await page.evaluate(() => {
      try {
        window.RPGStudio?.query({ type: 'NOPE' })
        return null
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    })
    expect(message).toMatch(/^Invalid query/)
  })

  test('applies a valid action and refuses an invalid one without changing the project', async ({
    studio,
  }) => {
    const accepted = await studio.dispatch({
      type: 'project/renameMap',
      payload: { mapId: 1, name: 'Overworld' },
    })
    expect(accepted.success).toBe(true)
    expect((await studio.map(1)).name).toBe('Overworld')

    const before = (await studio.summary()).revision
    const refused = await studio.dispatch({
      type: 'project/setTiles',
      payload: { mapId: 1, layer: 0, cells: [{ x: 99, y: 0, tile: 1 }] },
    })
    expect(refused.success).toBe(false)
    expect(refused.error).toContain('outside')
    expect((await studio.summary()).revision).toBe(before)
  })

  test('actions from the console appear in the UI and can be undone', async ({ studio, page }) => {
    await studio.dispatch({ type: 'project/renameMap', payload: { mapId: 1, name: 'Overworld' } })
    await expect(page.getByRole('button', { name: /1\. Overworld/ })).toBeVisible()
    await studio.undo()
    await expect(page.getByRole('button', { name: /1\. Map 1/ })).toBeVisible()
  })
})
