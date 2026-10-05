import { describe, expect, it } from 'vitest'

import {
  GameBundleSchema,
  PROJECT_FILE,
  ProjectSchema,
  createEmptyMap,
  createStarterProject,
  databaseFilePath,
  filesToProject,
  mapFilePath,
  projectToFiles,
  TilemapSchema,
} from '../src'

describe('project templates', () => {
  it('creates a starter project that satisfies the project schema', () => {
    expect(ProjectSchema.safeParse(createStarterProject('Quest')).success).toBe(true)
  })

  it('creates valid maps of any supported shape', () => {
    const map = createEmptyMap({ id: 3, name: 'Cave', width: 5, height: 4, tileSize: 32, fill: 2 })
    expect(TilemapSchema.safeParse(map).success).toBe(true)
    expect(map.layers).toHaveLength(3)
    expect(map.layers[0]?.data.every((tile) => tile === 2)).toBe(true)
  })
})

describe('project files', () => {
  const project = createStarterProject('Quest')

  it('uses the documented layout of strict JSON files', () => {
    const files = projectToFiles(project)
    expect(Object.keys(files).toSorted()).toEqual(
      [
        PROJECT_FILE,
        databaseFilePath('actors'),
        databaseFilePath('classes'),
        databaseFilePath('enemies'),
        databaseFilePath('items'),
        databaseFilePath('skills'),
        mapFilePath(1),
      ].toSorted(),
    )
    expect(mapFilePath(7)).toBe('maps/map-007.json')
    Object.values(files).forEach((text) => {
      expect(() => {
        JSON.parse(text)
      }).not.toThrow()
      expect(text.endsWith('\n')).toBe(true)
    })
  })

  it('round-trips a project exactly', () => {
    const result = filesToProject(projectToFiles(project))
    expect(result).toEqual({ success: true, data: project })
  })

  it('is deterministic', () => {
    expect(projectToFiles(project)).toEqual(projectToFiles(project))
  })

  it('treats missing database tables as empty but requires project.json', () => {
    const files = projectToFiles(project)
    const { [databaseFilePath('items')]: _items, ...withoutItems } = files
    const result = filesToProject(withoutItems)
    expect(result.success && result.data.database.items).toEqual([])
    const { [PROJECT_FILE]: _meta, ...withoutMeta } = files
    const missing = filesToProject(withoutMeta)
    expect(missing).toEqual({ success: false, error: ['project.json: file is missing'] })
  })

  it('names the offending file for syntax and schema errors', () => {
    const files = projectToFiles(project)
    const syntax = filesToProject({ ...files, [mapFilePath(1)]: '{oops' })
    expect(!syntax.success && syntax.error[0]).toMatch(/^maps\/map-001\.json: not valid JSON/)

    const hallucinated = filesToProject({
      ...files,
      [databaseFilePath('actors')]: JSON.stringify([
        { id: 1, name: 'Hero', classId: 1, superpower: true },
      ]),
    })
    expect(!hallucinated.success && hallucinated.error[0]).toMatch(/^data\/actors\.json:/)
  })

  it('reports cross-reference problems after per-file validation', () => {
    const files = projectToFiles(project)
    const dangling = filesToProject({
      ...files,
      [databaseFilePath('actors')]: JSON.stringify([{ id: 1, name: 'Hero', classId: 99 }]),
    })
    expect(dangling.success).toBe(false)
    expect(!dangling.success && dangling.error.join('\n')).toMatch(/missing class 99/)
  })

  it('ignores unrelated files', () => {
    const files = { ...projectToFiles(project), 'maps/notes.txt': 'hi', 'img/x.png': 'binary' }
    expect(filesToProject(files).success).toBe(true)
  })
})

describe('GameBundleSchema', () => {
  const bundle = {
    format: 'rpgstudio-game',
    formatVersion: 1,
    name: 'Quest',
    files: ['project.json', 'maps/map-001.json', 'img/tilesets/basic.png'],
  }

  it('accepts a bundle manifest and defaults plugins to none', () => {
    expect(GameBundleSchema.parse(bundle).plugins).toEqual([])
  })

  it('rejects traversal, unknown fields and the wrong format', () => {
    expect(GameBundleSchema.safeParse({ ...bundle, files: ['../etc/passwd'] }).success).toBe(false)
    expect(GameBundleSchema.safeParse({ ...bundle, extra: 1 }).success).toBe(false)
    expect(GameBundleSchema.safeParse({ ...bundle, format: 'other' }).success).toBe(false)
  })
})
