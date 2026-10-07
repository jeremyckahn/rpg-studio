import {
  DEFAULT_TILESET_PATH,
  GameBundleSchema,
  PROJECT_FILE,
  createDefaultTilesetPng,
  projectToFiles,
} from '@rpgstudio/core'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { createAssetStore } from '../src/project/assetStore'
import { createMemoryFileSystem } from '../src/project/fileSystem'
import { createProjectSession } from '../src/project/session'
import { createEditorStore, projectActions, selectIsDirty } from '../src/store'
import { recorder, sampleProject } from './helpers'

const decode = (bytes: Uint8Array | undefined): string => new TextDecoder().decode(bytes)

const setup = (
  options: {
    fetchOk?: boolean
    picker?: () => Promise<ReturnType<typeof createMemoryFileSystem>>
  } = {},
) => {
  const handle = createEditorStore()
  const assets = createAssetStore()
  const downloads = recorder<{ filename: string; bytes: Uint8Array }>()
  const requested = recorder<string>()
  const session = createProjectSession({
    handle,
    assets,
    baseUrl: '/app/',
    download: (filename, bytes) => {
      downloads.record({ filename, bytes })
    },
    fetchFile: (url) => {
      requested.record(url)
      return Promise.resolve(
        options.fetchOk === false
          ? new Response('', { status: 404 })
          : new Response(new TextEncoder().encode('export const startPlayer = () => {}')),
      )
    },
    ...(options.picker ? { pickDirectory: options.picker } : {}),
  })
  const status = () => handle.store.getState().editorUi.status
  return { handle, assets, session, downloads, requested, status }
}

const projectFolder = (name = 'my-game') =>
  createMemoryFileSystem(
    { ...projectToFiles(sampleProject()), [DEFAULT_TILESET_PATH]: createDefaultTilesetPng() },
    name,
  )

describe('new project', () => {
  it('starts a valid project with the built-in tileset and nothing unsaved', () => {
    const { handle, assets, session, status } = setup()
    session.newProject('Quest')
    const state = handle.store.getState()
    expect(state.project.data.meta.name).toBe('Quest')
    expect(assets.has(DEFAULT_TILESET_PATH)).toBe(true)
    expect(state.assets.paths).toEqual([DEFAULT_TILESET_PATH])
    expect(selectIsDirty(state)).toBe(false)
    expect(status()).toMatchObject({ severity: 'info' })
  })

  it('discards the previous project, its history and its assets', () => {
    const { handle, assets, session } = setup()
    session.newProject('One')
    assets.write('img/extra.png', 'x')
    handle.store.dispatch(projectActions.renameMap({ mapId: 1, name: 'Edited' }))
    session.newProject('Two')
    expect(handle.store.getState().history.past).toEqual([])
    expect(assets.list()).toEqual([DEFAULT_TILESET_PATH])
  })
})

describe('open and save', () => {
  it('opens a project folder, loading data and assets', async () => {
    const { handle, assets, session, status } = setup()
    expect(await session.openFileSystem(projectFolder())).toBe(true)
    expect(handle.store.getState().project.data.meta.name).toBe('Sample')
    expect(handle.store.getState().editorUi.folderName).toBe('my-game')
    expect(assets.has(DEFAULT_TILESET_PATH)).toBe(true)
    expect(status()).toMatchObject({ severity: 'success' })
  })

  it('refuses a folder that is not a project, leaving the current project alone', async () => {
    const { handle, session, status } = setup()
    session.newProject('Keep me')
    const opened = await session.openFileSystem(createMemoryFileSystem({ 'README.md': 'hi' }))
    expect(opened).toBe(false)
    expect(handle.store.getState().project.data.meta.name).toBe('Keep me')
    expect(status()).toMatchObject({ severity: 'error' })
    expect(status()?.text).toMatch(/project\.json is missing/)
  })

  it('counts asset-only changes as unsaved, until saved or the project is replaced', async () => {
    const { handle, assets, session } = setup()
    await session.openFileSystem(projectFolder())
    expect(selectIsDirty(handle.store.getState())).toBe(false)

    assets.write('img/pictures/new.png', Uint8Array.of(9))
    expect(selectIsDirty(handle.store.getState())).toBe(true)
    await session.save()
    expect(selectIsDirty(handle.store.getState())).toBe(false)

    assets.remove('img/pictures/new.png')
    expect(selectIsDirty(handle.store.getState())).toBe(true)
    session.newProject()
    expect(selectIsDirty(handle.store.getState())).toBe(false)
  })

  it('saves edits back to the opened folder, writing only what changed', async () => {
    const fs = projectFolder()
    const { handle, assets, session } = setup()
    await session.openFileSystem(fs)
    expect(selectIsDirty(handle.store.getState())).toBe(false)

    handle.store.dispatch(projectActions.renameMap({ mapId: 1, name: 'Edited Town' }))
    assets.write('img/characters/hero.png', Uint8Array.of(1, 2, 3))
    expect(selectIsDirty(handle.store.getState())).toBe(true)

    expect(await session.save()).toBe(true)
    expect(selectIsDirty(handle.store.getState())).toBe(false)
    expect(decode(fs.snapshot()['maps/map-001.json'])).toContain('Edited Town')
    expect([...(fs.snapshot()['img/characters/hero.png'] ?? [])]).toEqual([1, 2, 3])

    // Saving again with nothing new changes nothing.
    const before = fs.snapshot()
    await session.save()
    expect(fs.snapshot()).toEqual(before)
  })

  it('asks for a folder on the first save of a new project, then keeps using it', async () => {
    const target = createMemoryFileSystem({}, 'chosen')
    let picks = 0
    const { handle, session } = setup({
      picker: () => {
        picks += 1
        return Promise.resolve(target)
      },
    })
    session.newProject('Fresh')
    await session.save()
    expect(picks).toBe(1)
    expect(Object.keys(target.snapshot())).toContain(PROJECT_FILE)
    expect(handle.store.getState().editorUi.folderName).toBe('chosen')
    handle.store.dispatch(projectActions.renameMap({ mapId: 1, name: 'Again' }))
    await session.save()
    expect(picks).toBe(1)
  })

  it('writes the starter tileset on the first save of a new project', async () => {
    const target = createMemoryFileSystem({}, 'chosen')
    const { session } = setup({ picker: () => Promise.resolve(target) })
    session.newProject('Fresh')
    await session.save()
    expect(Object.keys(target.snapshot())).toContain(DEFAULT_TILESET_PATH)
    // The folder is a complete project that opens again with its tileset.
    const reopened = setup()
    expect(await reopened.session.openFileSystem(target)).toBe(true)
    expect(reopened.assets.list()).toContain(DEFAULT_TILESET_PATH)
  })

  it('writes the whole project when saving an imported archive to a folder', async () => {
    const source = setup()
    source.session.newProject('Round trip')
    await source.session.downloadProjectArchive()
    const archive = source.downloads.values.at(-1)?.bytes
    if (!archive) throw new Error('no archive was downloaded')

    const target = createMemoryFileSystem({}, 'chosen')
    const { session } = setup({ picker: () => Promise.resolve(target) })
    expect(await session.openArchive(archive)).toBe(true)
    await session.save()
    expect(Object.keys(target.snapshot())).toEqual(
      expect.arrayContaining([PROJECT_FILE, 'maps/map-001.json', DEFAULT_TILESET_PATH]),
    )
  })

  it('saves a complete copy when saving to another folder, even with nothing changed', async () => {
    const first = createMemoryFileSystem({}, 'first')
    const second = createMemoryFileSystem({}, 'second')
    const folders = [first, second]
    let picks = 0
    const { session, handle } = setup({
      picker: () => {
        const next = folders[picks] ?? second
        picks += 1
        return Promise.resolve(next)
      },
    })
    session.newProject('Fresh')
    await session.save()
    await session.saveAs()
    expect(Object.keys(second.snapshot()).toSorted()).toEqual(
      Object.keys(first.snapshot()).toSorted(),
    )
    expect(handle.store.getState().editorUi.folderName).toBe('second')

    // From then on the second folder is the one that is kept in step.
    handle.store.dispatch(projectActions.renameMap({ mapId: 1, name: 'Later' }))
    await session.save()
    expect(decode(second.snapshot()['maps/map-001.json'])).toContain('Later')
    expect(decode(first.snapshot()['maps/map-001.json'])).not.toContain('Later')
  })

  it('says what a save did: files written, files removed, or nothing to do', async () => {
    const fs = projectFolder()
    const { handle, assets, session, status } = setup()
    await session.openFileSystem(fs)
    await session.save()
    expect(status()?.text).toBe('Already saved')

    handle.store.dispatch(projectActions.renameMap({ mapId: 1, name: 'Edited' }))
    await session.save()
    expect(status()?.text).toBe('Saved 1 file(s) to my-game')

    assets.write('img/pictures/title.png', Uint8Array.of(1))
    await session.save()
    assets.remove('img/pictures/title.png')
    await session.save()
    expect(status()?.text).toBe('Removed 1 file(s) from my-game')
  })

  it('treats cancelling the folder picker as a quiet no-op, not an error', async () => {
    const { session, status, handle } = setup({
      picker: () => Promise.reject(new DOMException('cancelled', 'AbortError')),
    })
    session.newProject('Fresh')
    const before = status()
    expect(await session.save()).toBe(false)
    expect(await session.openFolder()).toBe(false)
    expect(status()).toBe(before)
    expect(selectIsDirty(handle.store.getState())).toBe(false)
  })

  it('reports a write failure instead of throwing', async () => {
    const failing = {
      ...createMemoryFileSystem({}, 'ro'),
      writeFile: () => Promise.reject(new Error('disk full')),
    }
    const { session, status, handle } = setup({ picker: () => Promise.resolve(failing) })
    session.newProject('Fresh')
    handle.store.dispatch(projectActions.renameMap({ mapId: 1, name: 'x' }))
    expect(await session.save()).toBe(false)
    expect(status()).toMatchObject({ severity: 'error', text: 'disk full' })
    expect(selectIsDirty(handle.store.getState())).toBe(true) // still unsaved
  })
})

describe('export', () => {
  it('downloads a game zip with the engine and without .piskel sources', async () => {
    const { assets, session, downloads, requested, status } = setup()
    session.newProject('Epic Quest')
    assets.write('img/characters/hero.png', 'png')
    assets.write('img/characters/hero.piskel', 'SOURCE-ART')
    expect(await session.exportGame()).toBe(true)

    expect(requested.values).toEqual(['/app/engine/player.js'])
    const [download] = downloads.values
    expect(download?.filename).toBe('epic-quest.zip')
    const files = unzipSync(download?.bytes ?? new Uint8Array())
    expect(Object.keys(files)).toContain('index.html')
    expect(Object.keys(files)).toContain('engine/player.js')
    expect(Object.keys(files).some((path) => path.includes('piskel'))).toBe(false)
    const bundle = GameBundleSchema.parse(JSON.parse(decode(files['game.json'])))
    expect(bundle.name).toBe('Epic Quest')
    expect(status()).toMatchObject({ severity: 'success' })
    expect(status()?.text).toMatch(/left out 1 authoring file/)
  })

  it('explains how to fix a missing engine build', async () => {
    const { session, downloads, status } = setup({ fetchOk: false })
    session.newProject('Q')
    expect(await session.exportGame()).toBe(false)
    expect(downloads.values).toEqual([])
    expect(status()?.text).toMatch(/pnpm build/)
  })

  it('refuses to export a game whose tileset is missing', async () => {
    const { assets, session, downloads, status } = setup()
    session.newProject('Q')
    assets.remove(DEFAULT_TILESET_PATH)
    expect(await session.exportGame()).toBe(false)
    expect(downloads.values).toEqual([])
    expect(status()?.text).toMatch(/basic\.png, which is not in the project/)
  })
})

describe('project archives', () => {
  it('downloads the whole project and imports it back', async () => {
    const source = setup()
    source.session.newProject('Portable')
    source.assets.write('img/characters/hero.piskel', '{"modelVersion":2}')
    await source.session.downloadProjectArchive()
    const [download] = source.downloads.values
    expect(download?.filename).toBe('portable-project.zip')

    const target = setup()
    expect(await target.session.openArchive(download?.bytes ?? new Uint8Array())).toBe(true)
    expect(target.handle.store.getState().project.data.meta.name).toBe('Portable')
    expect(target.assets.readText('img/characters/hero.piskel')).toBe('{"modelVersion":2}')
  })

  it('reports an invalid archive', async () => {
    const { session, status } = setup()
    expect(await session.openArchive(Uint8Array.of(1, 2, 3))).toBe(false)
    expect(status()).toMatchObject({ severity: 'error' })
  })
})
