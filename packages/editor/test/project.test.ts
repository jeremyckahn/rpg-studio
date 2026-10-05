import {
  PROJECT_FILE,
  createDefaultTilesetPng,
  createStarterProject,
  mapFilePath,
  projectToFiles,
} from '@rpgstudio/core'
import { describe, expect, it } from 'vitest'

import { createAssetStore } from '../src/project/assetStore'
import { createMemoryFileSystem } from '../src/project/fileSystem'
import {
  isAssetFile,
  isProjectDataFile,
  loadProject,
  saveProject,
} from '../src/project/persistence'
import { recorder, sampleProject } from './helpers'

const text = (bytes: Uint8Array | undefined): string => new TextDecoder().decode(bytes)

describe('asset store', () => {
  it('stores text and bytes and reads them back', () => {
    const assets = createAssetStore()
    assets.write('img/a.png', Uint8Array.of(1, 2, 3))
    assets.write('img/a.piskel', '{"x":1}')
    expect([...(assets.readBytes('img/a.png') ?? [])]).toEqual([1, 2, 3])
    expect(assets.readText('img/a.piskel')).toBe('{"x":1}')
    expect(assets.readBytes('missing')).toBeUndefined()
    expect(assets.readText('missing')).toBeUndefined()
    expect(assets.list()).toEqual(['img/a.piskel', 'img/a.png'])
    expect(assets.has('img/a.png')).toBe(true)
  })

  it('rejects unsafe paths', () => {
    const assets = createAssetStore()
    ;['../x.png', '/abs.png', 'a\\b.png', 'a//b.png', ''].forEach((path) => {
      expect(() => {
        assets.write(path, 'x')
      }, path).toThrow()
    })
    expect(assets.list()).toEqual([])
  })

  it('publishes change, removal and reset events', () => {
    const assets = createAssetStore()
    const events = recorder<unknown>()
    const stop = assets.subscribe(events.record)
    assets.write('img/a.png', 'x')
    assets.remove('img/a.png')
    assets.remove('img/a.png') // already gone: silent
    assets.replaceAll({ 'img/b.png': Uint8Array.of(1) })
    stop()
    assets.write('img/c.png', 'y')
    expect(events.values).toEqual([
      { type: 'changed', path: 'img/a.png' },
      { type: 'removed', path: 'img/a.png' },
      { type: 'reset' },
    ])
  })

  it('tracks unsaved writes and removals until marked saved', () => {
    const assets = createAssetStore()
    assets.replaceAll({ 'img/old.png': Uint8Array.of(1), 'img/keep.png': Uint8Array.of(2) })
    expect(assets.unsavedWrites()).toEqual([])
    assets.write('img/new.png', 'n')
    assets.remove('img/old.png')
    expect(assets.unsavedWrites()).toEqual(['img/new.png'])
    expect(assets.unsavedRemovals()).toEqual(['img/old.png'])
    assets.markSaved()
    expect(assets.unsavedWrites()).toEqual([])
    expect(assets.unsavedRemovals()).toEqual([])
  })

  it('does not report a rewritten file as removed, nor a removed file as written', () => {
    const assets = createAssetStore()
    assets.replaceAll({ 'img/a.png': Uint8Array.of(1) })
    assets.remove('img/a.png')
    assets.write('img/a.png', 'again')
    expect(assets.unsavedRemovals()).toEqual([])
    expect(assets.unsavedWrites()).toEqual(['img/a.png'])
    assets.write('img/b.png', 'b')
    assets.remove('img/b.png')
    expect(assets.unsavedWrites()).toEqual(['img/a.png'])
  })
})

describe('project file classification', () => {
  it('separates data files from assets and ignores everything else', () => {
    expect(['project.json', 'data/actors.json', 'maps/map-001.json'].every(isProjectDataFile)).toBe(
      true,
    )
    expect(['img/a.png', 'audio/se/x.ogg', 'plugins/p/manifest.json'].every(isAssetFile)).toBe(true)
    ;['README.md', 'maps/sub/x.json', 'data/x.txt', '.git/config', 'node_modules/x.js'].forEach(
      (path) => {
        expect(isProjectDataFile(path) || isAssetFile(path), path).toBe(false)
      },
    )
  })
})

describe('loading and saving projects', () => {
  const folder = () =>
    createMemoryFileSystem(
      {
        ...projectToFiles(sampleProject()),
        'img/tilesets/basic.png': createDefaultTilesetPng(),
        'img/characters/hero.piskel': '{"modelVersion":2}',
        'audio/bgm/town.ogg': Uint8Array.of(9, 9),
        'README.md': 'not part of the project',
        'src/notes.txt': 'ignored',
      },
      'my-game',
    )

  it('loads validated data and every asset, leaving unrelated files alone', async () => {
    const result = await loadProject(folder())
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.project).toEqual(sampleProject())
    expect(Object.keys(result.data.assets).toSorted()).toEqual([
      'audio/bgm/town.ogg',
      'img/characters/hero.piskel',
      'img/tilesets/basic.png',
    ])
    expect(result.data.cache.get(PROJECT_FILE)).toBe(projectToFiles(sampleProject())[PROJECT_FILE])
  })

  it('refuses a folder that is not a project', async () => {
    const result = await loadProject(createMemoryFileSystem({ 'README.md': 'hi' }))
    expect(result).toEqual({
      success: false,
      error: ['This folder is not an RPG Studio project: project.json is missing'],
    })
  })

  it('reports invalid data files by name', async () => {
    const fs = createMemoryFileSystem({
      ...projectToFiles(sampleProject()),
      [mapFilePath(1)]: '{"id":1}',
    })
    const result = await loadProject(fs)
    expect(result.success).toBe(false)
    expect(!result.success && result.error.join()).toMatch(/maps\/map-001\.json/)
  })

  it('writes only what changed since the last save', async () => {
    const fs = folder()
    const loaded = await loadProject(fs)
    if (!loaded.success) throw new Error('load failed')
    const assets = createAssetStore()
    assets.replaceAll(loaded.data.assets)

    const unchanged = await saveProject(fs, loaded.data.project, assets, loaded.data.cache)
    expect(unchanged.written).toEqual([])
    expect(unchanged.deleted).toEqual([])

    const edited = {
      ...loaded.data.project,
      meta: { ...loaded.data.project.meta, name: 'Renamed' },
    }
    assets.write('img/characters/hero.png', Uint8Array.of(7))
    const report = await saveProject(fs, edited, assets, unchanged.cache)
    expect(report.written.toSorted()).toEqual(['img/characters/hero.png', 'project.json'])
    expect(text(fs.snapshot()['project.json'])).toContain('"name": "Renamed"')
    expect([...(fs.snapshot()['img/characters/hero.png'] ?? [])]).toEqual([7])

    assets.markSaved()
    const again = await saveProject(fs, edited, assets, report.cache)
    expect(again.written).toEqual([])
  })

  it('deletes files for maps and assets that were removed, but not unrelated files', async () => {
    const fs = folder()
    const loaded = await loadProject(fs)
    if (!loaded.success) throw new Error('load failed')
    const assets = createAssetStore()
    assets.replaceAll(loaded.data.assets)
    const withoutCave = {
      ...loaded.data.project,
      maps: loaded.data.project.maps.filter((map) => map.id !== 2),
    }
    assets.remove('audio/bgm/town.ogg')
    const report = await saveProject(fs, withoutCave, assets, loaded.data.cache)
    expect(report.deleted.toSorted()).toEqual(['audio/bgm/town.ogg', mapFilePath(2)])
    const remaining = Object.keys(fs.snapshot())
    expect(remaining).not.toContain(mapFilePath(2))
    expect(remaining).not.toContain('audio/bgm/town.ogg')
    expect(remaining).toContain('README.md')
    expect(remaining).toContain('src/notes.txt')
  })

  it('saves a brand new project into an empty folder and loads it back identically', async () => {
    const fs = createMemoryFileSystem({}, 'new')
    const project = createStarterProject('Fresh')
    const assets = createAssetStore()
    assets.write('img/tilesets/basic.png', createDefaultTilesetPng())
    const report = await saveProject(fs, project, assets, new Map())
    expect(report.written).toContain(PROJECT_FILE)
    expect(report.written).toContain('img/tilesets/basic.png')
    const loaded = await loadProject(fs)
    expect(loaded.success && loaded.data.project).toEqual(project)
  })

  it('memory file system rejects reads of missing files and ignores deleting them', async () => {
    const fs = createMemoryFileSystem({ 'a.txt': 'a' })
    await expect(fs.readFile('nope')).rejects.toThrow(/No such file/)
    await expect(fs.deleteFile('nope')).resolves.toBeUndefined()
    await fs.writeFile('b.txt', 'b')
    expect(await fs.list()).toEqual(['a.txt', 'b.txt'])
  })
})
