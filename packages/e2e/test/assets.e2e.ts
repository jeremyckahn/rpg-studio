import { type Page } from '@playwright/test'

import { fakeAudio, solidPng } from '../support/files.ts'
import { expect, test } from '../support/fixtures.ts'

const browser = (page: Page) => page.getByRole('complementary', { name: 'Asset browser' })

/** Chooses an upload kind from the Add menu and answers the file picker it opens. */
const upload = async (
  page: Page,
  kind: string,
  files: readonly { name: string; mimeType: string; buffer: Buffer }[],
): Promise<void> => {
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: kind }).click()
  await (await chooser).setFiles([...files])
}

const png = (name: string, width = 16, height = 16) => ({
  name,
  mimeType: 'image/png',
  buffer: solidPng(width, height),
})

test.describe('asset browser', () => {
  test('lists the starter tileset under its folder', async ({ page, studio }) => {
    await expect(browser(page).getByText('img/tilesets')).toBeVisible()
    await expect(browser(page).getByRole('button', { name: 'basic.png' })).toBeVisible()
    await expect(page.getByText('No assets yet.')).toBeHidden()
    expect(await studio.assets()).toEqual([
      { path: 'img/tilesets/basic.png', bytes: expect.any(Number) },
    ])
  })

  test('offers every kind of asset in the Add menu', async ({ page }) => {
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByRole('menuitem')).toHaveText([
      'Tileset image',
      'Character sheet',
      'Picture',
      'Music (BGM)',
      'Ambience (BGS)',
      'Jingle (ME)',
      'Sound effect (SE)',
    ])
  })

  test('the picker for images accepts images and the one for sound accepts audio', async ({
    page,
  }) => {
    const input = page.locator('input[aria-label="Upload assets"]')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    let chooser = page.waitForEvent('filechooser')
    await page.getByRole('menuitem', { name: 'Tileset image' }).click()
    await chooser
    await expect(input).toHaveAttribute('accept', 'image/png,image/gif,image/webp')

    await page.getByRole('button', { name: 'Add', exact: true }).click()
    chooser = page.waitForEvent('filechooser')
    await page.getByRole('menuitem', { name: 'Sound effect (SE)' }).click()
    await chooser
    await expect(input).toHaveAttribute('accept', 'audio/*')
  })

  const kinds = [
    ['Tileset image', 'img/tilesets', 'forest.png'],
    ['Character sheet', 'img/characters', 'hero.png'],
    ['Picture', 'img/pictures', 'title.png'],
  ] as const
  for (const [kind, folder, name] of kinds) {
    test(`uploads a ${kind.toLowerCase()} into ${folder}`, async ({ studio, page }) => {
      await upload(page, kind, [png(name)])
      await expect(browser(page).getByRole('button', { name })).toBeVisible()
      await expect(browser(page).getByText(folder, { exact: true })).toBeVisible()
      expect((await studio.assets()).map((asset) => asset.path)).toContain(`${folder}/${name}`)
    })
  }

  const sounds = [
    ['Music (BGM)', 'audio/bgm', 'theme.ogg'],
    ['Ambience (BGS)', 'audio/bgs', 'rain.ogg'],
    ['Jingle (ME)', 'audio/me', 'fanfare.ogg'],
    ['Sound effect (SE)', 'audio/se', 'hit.wav'],
  ] as const
  for (const [kind, folder, name] of sounds) {
    test(`uploads ${kind} into ${folder}`, async ({ studio, page }) => {
      await upload(page, kind, [{ name, mimeType: 'audio/ogg', buffer: fakeAudio() }])
      await expect(browser(page).getByRole('button', { name })).toBeVisible()
      expect((await studio.assets()).map((asset) => asset.path)).toContain(`${folder}/${name}`)
    })
  }

  test('uploads several files at once', async ({ studio, page }) => {
    await upload(page, 'Character sheet', [png('a.png'), png('b.png'), png('c.png')])
    await expect(browser(page).getByRole('button', { name: /^[abc]\.png$/ })).toHaveCount(3)
    expect(
      (await studio.assets()).filter((asset) => asset.path.startsWith('img/characters/')),
    ).toHaveLength(3)
  })

  test('replaces a file uploaded under the same name', async ({ studio, page }) => {
    await upload(page, 'Picture', [
      { name: 'title.png', mimeType: 'image/png', buffer: solidPng(8, 8) },
    ])
    await expect(browser(page).getByRole('button', { name: 'title.png' })).toBeVisible()
    const first = (await studio.assets()).find((asset) => asset.path === 'img/pictures/title.png')
    await upload(page, 'Picture', [
      { name: 'title.png', mimeType: 'image/png', buffer: solidPng(64, 64, [1, 2, 3, 255]) },
    ])
    await expect
      .poll(
        async () =>
          (await studio.assets()).find((asset) => asset.path === 'img/pictures/title.png')?.bytes,
      )
      .not.toBe(first?.bytes)
    expect(
      (await studio.assets()).filter((asset) => asset.path === 'img/pictures/title.png'),
    ).toHaveLength(1)
  })

  test('makes unsafe file names safe', async ({ studio, page }) => {
    await upload(page, 'Picture', [
      png('my pic (final).png'),
      png('.hidden.png'),
      png('Ünï cødé!.png'),
    ])
    await expect
      .poll(async () => (await studio.assets()).map((asset) => asset.path).toSorted())
      .toEqual(
        [
          'img/pictures/hidden.png',
          'img/pictures/my_pic_final_.png',
          'img/pictures/_n_c_d_.png',
          'img/tilesets/basic.png',
        ].toSorted(),
      )
  })

  test('shows a different icon for images and for audio', async ({ page }) => {
    await upload(page, 'Sound effect (SE)', [
      { name: 'hit.ogg', mimeType: 'audio/ogg', buffer: fakeAudio() },
    ])
    const image = browser(page).getByRole('button', { name: 'basic.png' }).locator('svg')
    const audio = browser(page).getByRole('button', { name: 'hit.ogg' }).locator('svg')
    const [imageShape, audioShape] = await Promise.all([image.innerHTML(), audio.innerHTML()])
    expect(imageShape).not.toBe('')
    expect(audioShape).not.toBe('')
    expect(imageShape).not.toBe(audioShape)
  })

  test('uploaded images are listed by the console API too', async ({ studio, page }) => {
    await upload(page, 'Picture', [png('title.png', 4, 4)])
    await expect
      .poll(async () => (await studio.assets()).map((asset) => asset.path))
      .toContain('img/pictures/title.png')
  })
})
