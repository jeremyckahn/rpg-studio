import {
  type Project,
  GameBundleSchema,
  ProjectSchema,
  createDefaultTilesetPng,
  createStarterProject,
  projectToFiles,
} from '@rpgstudio/core'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import {
  ArchiveError,
  ExportError,
  MAX_UNZIPPED_BYTES,
  buildExportEntries,
  exportProjectArchive,
  findGameProblems,
  gameIndexHtml,
  importProjectArchive,
  loadEngineFiles,
  slugify,
  unzipEntries,
  zipEntries,
} from '../src/export'
import { createAssetStore } from '../src/project/assetStore'

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array | undefined): string => new TextDecoder().decode(bytes)

const engine = { 'player.js': encode('export const startPlayer = () => {}') }

const projectWith = (changes: Partial<Project['meta']> = {}): Project =>
  ProjectSchema.parse({
    ...createStarterProject('My <Game> & "More"'),
    meta: { ...createStarterProject().meta, name: 'My <Game> & "More"', ...changes },
  })

const newAssets = (files: Record<string, Uint8Array | string> = {}) => {
  const assets = createAssetStore()
  assets.write('img/tilesets/basic.png', createDefaultTilesetPng())
  Object.entries(files).forEach(([path, data]) => {
    assets.write(path, data)
  })
  return assets
}

const pluginManifest = (id: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    id,
    name: id,
    version: '1.0.0',
    entries: { shared: 'shared.js', editor: 'editor.js', engine: 'engine.js' },
    ...extra,
  })

describe('buildExportEntries', () => {
  it('assembles a static bundle: page, manifest, data, assets and the engine', () => {
    const assets = newAssets({
      'audio/bgm/town.ogg': 'ogg-bytes',
      'img/characters/hero.png': 'png-bytes',
    })
    const { entries } = buildExportEntries({ project: projectWith(), assets, engine })
    expect(Object.keys(entries).toSorted()).toEqual(
      [
        'audio/bgm/town.ogg',
        'data/actors.json',
        'data/classes.json',
        'data/enemies.json',
        'data/items.json',
        'data/skills.json',
        'engine/player.js',
        'game.json',
        'img/characters/hero.png',
        'img/tilesets/basic.png',
        'index.html',
        'maps/map-001.json',
        'project.json',
      ].toSorted(),
    )
    expect(decode(entries['engine/player.js'])).toBe('export const startPlayer = () => {}')
  })

  it('strips raw .piskel sources while keeping the exported PNG', () => {
    const assets = newAssets({
      'img/characters/hero.png': 'png',
      'img/characters/hero.piskel': '{"modelVersion":2}',
      'img/tilesets/basic.piskel': '{}',
    })
    const { entries, omitted } = buildExportEntries({ project: projectWith(), assets, engine })
    expect(Object.keys(entries).filter((path) => path.endsWith('.piskel'))).toEqual([])
    expect(entries['img/characters/hero.png']).toBeDefined()
    expect(
      omitted
        .filter((o) => o.path.endsWith('.piskel'))
        .map((o) => o.path)
        .toSorted(),
    ).toEqual(['img/characters/hero.piskel', 'img/tilesets/basic.piskel'])
    // ...and nothing about them leaks into the manifest the player reads.
    const bundle = GameBundleSchema.parse(JSON.parse(decode(entries['game.json'])))
    expect(bundle.files.some((path) => path.includes('piskel'))).toBe(false)
  })

  it('leaves out files that are not game assets', () => {
    const assets = newAssets({
      'img/notes.txt': 'hi',
      'audio/notes.md': 'x',
      'misc/other.bin': 'y',
    })
    const { entries, omitted } = buildExportEntries({ project: projectWith(), assets, engine })
    expect(entries['img/notes.txt']).toBeUndefined()
    expect(entries['misc/other.bin']).toBeUndefined()
    expect(omitted.map((o) => o.path).toSorted()).toEqual([
      'audio/notes.md',
      'img/notes.txt',
      'misc/other.bin',
    ])
  })

  it('writes a game.json that lists exactly the shipped project files', () => {
    const assets = newAssets({ 'audio/se/coin.ogg': 'x' })
    const { entries } = buildExportEntries({ project: projectWith(), assets, engine })
    const bundle = GameBundleSchema.parse(JSON.parse(decode(entries['game.json'])))
    expect(bundle.name).toBe('My <Game> & "More"')
    expect(bundle.files.toSorted()).toEqual(
      [
        ...Object.keys(projectToFiles(projectWith())),
        'img/tilesets/basic.png',
        'audio/se/coin.ogg',
      ].toSorted(),
    )
    expect(bundle.files).not.toContain('index.html')
    expect(bundle.files.some((path) => path.startsWith('engine/'))).toBe(false)
  })

  it('escapes the game name in the page title and loads only the engine player', () => {
    const html = gameIndexHtml('<script>alert(1)</script> & "q"')
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&#60;script&#62;alert(1)&#60;/script&#62; &#38; &#34;q&#34;')
    expect(html).toContain("from './engine/player.js'")
    expect(html).not.toMatch(/editor|react|mui/i)
  })

  describe('plugins', () => {
    const withPlugin = (files: Record<string, string>, ids = ['acme.quests']) => ({
      project: projectWith({ plugins: ids }),
      assets: newAssets(files),
    })

    it('ships shared and engine entries and strips the editor entry and other files', () => {
      const { project, assets } = withPlugin({
        'plugins/acme.quests/manifest.json': pluginManifest('acme.quests'),
        'plugins/acme.quests/shared.js': 'export default {}',
        'plugins/acme.quests/editor.js': 'import "react"',
        'plugins/acme.quests/engine.js': 'export default {}',
        'plugins/acme.quests/README.md': 'docs',
      })
      const { entries, omitted } = buildExportEntries({ project, assets, engine })
      const shipped = Object.keys(entries)
        .filter((path) => path.startsWith('plugins/'))
        .toSorted()
      expect(shipped).toEqual([
        'plugins/acme.quests/engine.js',
        'plugins/acme.quests/manifest.json',
        'plugins/acme.quests/shared.js',
      ])
      expect(omitted.map((o) => o.path).toSorted()).toEqual([
        'plugins/acme.quests/README.md',
        'plugins/acme.quests/editor.js',
      ])
      const bundle = GameBundleSchema.parse(JSON.parse(decode(entries['game.json'])))
      expect(bundle.plugins).toEqual(['acme.quests'])
    })

    it('does not ship plugins that are installed but not enabled', () => {
      const assets = newAssets({
        'plugins/unused/manifest.json': pluginManifest('unused'),
        'plugins/unused/engine.js': 'export default {}',
      })
      const { entries } = buildExportEntries({ project: projectWith(), assets, engine })
      expect(Object.keys(entries).some((path) => path.startsWith('plugins/'))).toBe(false)
      const bundle = GameBundleSchema.parse(JSON.parse(decode(entries['game.json'])))
      expect(bundle.plugins).toEqual([])
    })

    it('refuses to export when an enabled plugin is broken', () => {
      const missing = withPlugin({})
      expect(() => buildExportEntries({ ...missing, engine })).toThrow(/manifest\.json is missing/)

      const mismatch = withPlugin({
        'plugins/acme.quests/manifest.json': pluginManifest('other.id'),
      })
      expect(() => buildExportEntries({ ...mismatch, engine })).toThrow(/declares id "other.id"/)

      const noEntry = withPlugin({
        'plugins/acme.quests/manifest.json': pluginManifest('acme.quests'),
      })
      expect(() => buildExportEntries({ ...noEntry, engine })).toThrow(
        /shared\.js but it is missing/,
      )

      const noEngine = withPlugin({
        'plugins/acme.quests/manifest.json': pluginManifest('acme.quests'),
        'plugins/acme.quests/shared.js': 'export default {}',
      })
      expect(() => buildExportEntries({ ...noEngine, engine })).toThrow(
        /engine\.js but it is missing/,
      )

      const badJson = withPlugin({ 'plugins/acme.quests/manifest.json': '{nope' })
      expect(() => buildExportEntries({ ...badJson, engine })).toThrow(ExportError)
    })

    it('reports every broken plugin at once, not just the first', () => {
      // acme.ghost has no manifest at all; acme.quests needs a plugin that is not enabled.
      const { project, assets } = withPlugin(
        {
          'plugins/acme.quests/manifest.json': pluginManifest('acme.quests', {
            dependencies: ['acme.core'],
          }),
          'plugins/acme.quests/shared.js': '',
          'plugins/acme.quests/engine.js': '',
        },
        ['acme.ghost', 'acme.quests'],
      )
      const error = (() => {
        try {
          buildExportEntries({ project, assets, engine })
          return undefined
        } catch (e) {
          return e as ExportError
        }
      })()
      expect(error).toBeInstanceOf(ExportError)
      expect(error?.problems).toHaveLength(2)
      expect(error?.problems.join('\n')).toMatch(/acme\.ghost.*manifest\.json is missing/)
      expect(error?.problems.join('\n')).toMatch(/needs "acme\.core"/)
    })

    it('requires a plugin’s dependencies to be enabled too', () => {
      const { project, assets } = withPlugin({
        'plugins/acme.quests/manifest.json': pluginManifest('acme.quests', {
          dependencies: ['acme.core'],
        }),
        'plugins/acme.quests/shared.js': '',
        'plugins/acme.quests/engine.js': '',
      })
      expect(() => buildExportEntries({ project, assets, engine })).toThrow(/needs "acme.core"/)
    })
  })

  it('refuses to export a game that would render nothing', () => {
    const assets = createAssetStore() // no tileset
    expect(() => buildExportEntries({ project: projectWith(), assets, engine })).toThrow(
      /uses img\/tilesets\/basic\.png, which is not in the project/,
    )
    expect(() =>
      buildExportEntries({ project: projectWith(), assets: newAssets(), engine: {} }),
    ).toThrow(/engine player is missing/)
  })

  it('reports every problem at once', () => {
    const error = (() => {
      try {
        buildExportEntries({ project: projectWith(), assets: createAssetStore(), engine: {} })
        return undefined
      } catch (e) {
        return e as ExportError
      }
    })()
    expect(error?.problems).toHaveLength(2)
  })
})

describe('findGameProblems', () => {
  it('finds nothing wrong with a complete project', () => {
    expect(findGameProblems(projectWith(), newAssets())).toEqual([])
  })

  it('names a missing tileset and a missing plugin, without needing the engine', () => {
    const problems = findGameProblems(projectWith({ plugins: ['acme.ghost'] }), createAssetStore())
    expect(problems).toHaveLength(2)
    expect(problems.join('\n')).toMatch(/acme\.ghost.*manifest\.json is missing/)
    expect(problems.join('\n')).toMatch(
      /A map uses img\/tilesets\/basic\.png, which is not in the project/,
    )
  })

  it('is exactly what the exporter refuses on, apart from the engine', () => {
    const project = projectWith({ plugins: ['acme.ghost'] })
    const assets = createAssetStore()
    const refused = (() => {
      try {
        buildExportEntries({ project, assets, engine })
        return []
      } catch (e) {
        return (e as ExportError).problems
      }
    })()
    expect(refused).toEqual(findGameProblems(project, assets))
  })
})

describe('zip packaging', () => {
  it('produces a standard zip with every entry intact', async () => {
    const assets = newAssets({ 'img/characters/hero.piskel': '{}' })
    const { entries } = buildExportEntries({ project: projectWith(), assets, engine })
    const zipped = await zipEntries(entries)
    expect([...zipped.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]) // "PK\3\4"
    const files = unzipSync(zipped)
    expect(Object.keys(files).toSorted()).toEqual(Object.keys(entries).toSorted())
    Object.entries(entries).forEach(([path, bytes]) => {
      expect([...(files[path] ?? [])], path).toEqual([...bytes])
    })
  })

  it('leaves the stripped .piskel sources out of the archive itself', async () => {
    const assets = newAssets({
      'img/characters/hero.png': 'png',
      'img/characters/hero.piskel': 'SECRET-SOURCE-ART',
    })
    const { entries } = buildExportEntries({ project: projectWith(), assets, engine })
    const files = unzipSync(await zipEntries(entries))
    expect(Object.keys(files).filter((path) => path.includes('piskel'))).toEqual([])
    expect(Object.values(files).some((bytes) => decode(bytes).includes('SECRET-SOURCE-ART'))).toBe(
      false,
    )
  })

  it('stores already-compressed images instead of deflating them', async () => {
    const png = createDefaultTilesetPng()
    const zipped = await zipEntries({ 'img/a.png': png, 'data/a.json': encode('x'.repeat(5000)) })
    const files = unzipSync(zipped)
    expect([...(files['img/a.png'] ?? [])]).toEqual([...png])
    expect(zipped.length).toBeLessThan(png.length + 5000) // the text compressed even though the PNG did not
  })

  it('round-trips through the async unzip', async () => {
    const zipped = await zipEntries({ 'a/b.txt': encode('hello'), 'c.txt': encode('world') })
    const files = await unzipEntries(zipped)
    expect(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, decode(v)]))).toEqual({
      'a/b.txt': 'hello',
      'c.txt': 'world',
    })
  })

  it('refuses archives with entries that escape the project folder', async () => {
    for (const path of ['../outside.txt', '/etc/passwd', 'a/../../b.txt', 'C:/x.txt']) {
      const archive = await zipEntries({ [path]: encode('x') })
      const refusal = unzipEntries(archive)
      await expect(refusal).rejects.toThrow(ArchiveError)
      // The message names the offending path, since it is what the person sees.
      await expect(refusal).rejects.toThrow(`The archive contains an unsafe path: ${path}`)
    }
  })

  it('has a sane limit on how large an archive may expand', () => {
    expect(MAX_UNZIPPED_BYTES).toBeGreaterThan(1024 * 1024)
  })
})

describe('project archives', () => {
  it('round-trips a whole project, keeping .piskel sources', async () => {
    const project = projectWith()
    const assets = newAssets({
      'img/characters/hero.piskel': '{"modelVersion":2}',
      'audio/se/x.ogg': 'ogg',
    })
    const archive = await exportProjectArchive(project, assets)
    const imported = await importProjectArchive(archive)
    expect(imported.success).toBe(true)
    if (!imported.success) return
    expect(imported.data.project).toEqual(project)
    expect(Object.keys(imported.data.assets).toSorted()).toEqual(assets.list().toSorted())
    expect(decode(imported.data.assets['img/characters/hero.piskel'])).toBe('{"modelVersion":2}')
  })

  it('rejects archives that are not projects, or whose data is invalid', async () => {
    const notProject = await zipEntries({ 'readme.txt': encode('hi') })
    expect(await importProjectArchive(notProject)).toEqual({
      success: false,
      error: ['This archive is not an RPG Studio project: project.json is missing'],
    })
    const broken = await zipEntries({ 'project.json': encode('{"format":"nope"}') })
    const result = await importProjectArchive(broken)
    expect(result.success).toBe(false)
    expect(!result.success && result.error[0]).toMatch(/^project\.json:/)

    // A broken data file is named too, not just a broken project.json.
    const brokenMap = await zipEntries({
      ...Object.fromEntries(
        Object.entries(projectToFiles(createStarterProject('Quest'))).map(([path, text]) => [
          path,
          encode(text),
        ]),
      ),
      'maps/map-001.json': encode('{"id":"one"}'),
    })
    const mapResult = await importProjectArchive(brokenMap)
    expect(mapResult.success).toBe(false)
    expect(!mapResult.success && mapResult.error[0]).toMatch(/maps\/map-001\.json/)
  })
})

describe('engine files and helpers', () => {
  it('loads the engine from the editor origin', async () => {
    const requested: string[] = []
    const files = await loadEngineFiles('/app/', (url) => {
      // eslint-disable-next-line functional/immutable-data -- records requests
      requested.push(url)
      return Promise.resolve(new Response(new Uint8Array([1, 2, 3])))
    })
    expect(requested).toEqual(['/app/engine/player.js'])
    expect([...(files['player.js'] ?? [])]).toEqual([1, 2, 3])
  })

  it('explains how to fix a missing engine build', async () => {
    await expect(
      loadEngineFiles('/', () => Promise.resolve(new Response('', { status: 404 }))),
    ).rejects.toThrow(/Could not load the game engine \(engine\/player\.js: 404\).*pnpm build/)
  })

  it('makes safe download file names', () => {
    expect(slugify('My <Game> & "More"!')).toBe('my-game-more')
    expect(slugify('???')).toBe('game')
  })
})
