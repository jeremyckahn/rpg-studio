import {
  ActorSchema,
  CollisionFlags,
  type Actor,
  type Point,
  type ProjectAction,
  type Tilemap,
  PixelMatrixSchema,
  TilemapSchema,
  matricesToPiskel,
  matricesToPng,
} from '@rpgstudio/core'
import { z } from 'zod'

import { type AgentConnection } from './agent.ts'

/** Tile ids of the built-in tileset (id n is cell n - 1). */
const TILE = { grass: 1, dirt: 2, water: 3, wall: 6, flowers: 8 } as const

export interface DemoSummary {
  readonly mapId: number
  readonly mapSize: { readonly width: number; readonly height: number }
  readonly tilesPlaced: number
  readonly solidCells: number
  readonly actor: Actor
  readonly spritePath: string
  readonly pathLength: number | null
}

export interface DemoOptions {
  readonly log?: (message: string) => void
  /** How long to wait for the editor to connect. */
  readonly editorTimeoutMs?: number
}

const range = (start: number, end: number): number[] =>
  Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i)

/** A 16x16 character: a hooded figure with a red tunic, drawn as an indexed colour matrix. */
const heroSprite = (() => {
  const rows = [
    '................',
    '.....dddddd.....',
    '....dddddddd....',
    '....dsssssdd....',
    '....dssbsbsd....',
    '....dsssssdd....',
    '.....dssssd.....',
    '....rrrrrrrr....',
    '...rrrrrrrrrr...',
    '...rrrrrrrrrr...',
    '...srrrrrrrrs...',
    '....rrrrrrrr....',
    '....rrr..rrr....',
    '....ddd..ddd....',
    '...ddd....ddd...',
    '................',
  ]
  const palette = ['#00000000', '#2b2b6b', '#ffd9a0', '#d62f4b', '#1a1a1a']
  const lookup: Readonly<Record<string, number>> = { '.': 0, d: 1, s: 2, r: 3, b: 4 }
  return PixelMatrixSchema.parse({
    palette,
    width: 16,
    height: 16,
    pixels: rows.flatMap((row) => [...row].map((char) => lookup[char] ?? 0)),
  })
})()

const asRecords = (value: unknown): readonly { id: number }[] =>
  z.array(z.looseObject({ id: z.number() })).parse(value)

/**
 * A scripted tour of what an AI agent can do through the companion bridge:
 * read the project, discover schemas, reshape a map, generate a validated
 * database record, create pixel art and hot-reload it into the editor. Each
 * step uses only the public agent API.
 */
export const runDemo = async (
  agent: AgentConnection,
  options: DemoOptions = {},
): Promise<DemoSummary> => {
  const log = options.log ?? (() => undefined)

  log('Waiting for the editor…')
  await agent.waitForEditor(options.editorTimeoutMs)

  // 1. Read the project.
  const summary = z
    .looseObject({ maps: z.array(z.looseObject({ id: z.number() })) })
    .parse(await agent.query({ type: 'GET_PROJECT_SUMMARY' }))
  const first = summary.maps[0]
  if (!first) throw new Error('The project has no maps')
  const map: Tilemap = TilemapSchema.parse(
    await agent.query({ type: 'GET_MAP_DATA', id: first.id }),
  )
  log(
    `Project has ${summary.maps.length} map(s); editing "${map.name}" (${map.width}×${map.height}).`,
  )

  // 2. Discover what an actor looks like instead of guessing.
  const actorSchema = (await agent.query({ type: 'GET_SCHEMA', name: 'actor' })) as {
    required?: string[]
  }
  log(`An actor requires: ${(actorSchema.required ?? []).join(', ')}.`)

  // 3. Reshape the map in one all-or-nothing batch (one Undo reverts it all).
  const { width, height } = map
  const cells = (xs: readonly number[], ys: readonly number[]): Point[] =>
    ys.flatMap((y) => xs.map((x) => ({ x, y })))
  const border = [
    ...range(0, width - 1).flatMap((x) => [
      { x, y: 0 },
      { x, y: height - 1 },
    ]),
    ...range(1, height - 2).flatMap((y) => [
      { x: 0, y },
      { x: width - 1, y },
    ]),
  ]
  const lake = cells(
    range(Math.floor(width / 3), Math.floor(width / 2)),
    range(Math.floor(height / 3), Math.floor(height / 2)),
  )
  const road = range(1, width - 2).map((x) => ({ x, y: Math.floor(height * 0.75) }))
  // Flowers are scattered on open grass only: not on walls, water or the road.
  const taken = new Set([...border, ...lake, ...road].map((c) => `${c.x},${c.y}`))
  const flowers = range(0, Math.floor((width * height) / 12))
    .map((i) => ({
      x: 1 + ((i * 7) % Math.max(1, width - 2)),
      y: 1 + ((i * 5) % Math.max(1, height - 2)),
    }))
    .filter(
      (c, i, all) =>
        !taken.has(`${c.x},${c.y}`) && all.findIndex((o) => o.x === c.x && o.y === c.y) === i,
    )
  const solid = [...border, ...lake]
  const terrain: ProjectAction[] = [
    {
      type: 'project/setTiles',
      payload: { mapId: map.id, layer: 0, cells: border.map((c) => ({ ...c, tile: TILE.wall })) },
    },
    {
      type: 'project/setTiles',
      payload: { mapId: map.id, layer: 0, cells: lake.map((c) => ({ ...c, tile: TILE.water })) },
    },
    {
      type: 'project/setTiles',
      payload: { mapId: map.id, layer: 0, cells: road.map((c) => ({ ...c, tile: TILE.dirt })) },
    },
    {
      type: 'project/setTiles',
      payload: {
        mapId: map.id,
        layer: 1,
        cells: flowers.map((c) => ({ ...c, tile: TILE.flowers })),
      },
    },
    {
      type: 'project/setCollision',
      payload: { mapId: map.id, cells: solid.map((c) => ({ ...c, flags: CollisionFlags.SOLID })) },
    },
  ]
  await agent.batch(terrain)
  const tilesPlaced = border.length + lake.length + road.length + flowers.length
  log(`Placed ${tilesPlaced} tiles and ${solid.length} solid cells.`)

  // 4. Draw pixel art and hot-reload it into the project.
  const spritePath = 'img/characters/aria.png'
  await agent.writeAsset(spritePath, matricesToPng([heroSprite]))
  await agent.writeAsset(
    'img/characters/aria.piskel',
    new TextEncoder().encode(matricesToPiskel('aria', [heroSprite])),
  )
  log(`Wrote ${spritePath} and its .piskel source.`)

  // 5. Generate a database record and validate it with Zod before sending it.
  const classes = asRecords(await agent.query({ type: 'GET_TABLE', table: 'classes' }))
  const actors = asRecords(await agent.query({ type: 'GET_TABLE', table: 'actors' }))
  const classId = classes[0]?.id
  if (classId === undefined) throw new Error('The project has no classes to give the new actor')
  const actor = ActorSchema.parse({
    id: Math.max(0, ...actors.map((a) => a.id)) + 1,
    name: 'Aria',
    nickname: 'the Pathfinder',
    classId,
    initialLevel: 3,
    description: 'Created by an AI agent over the companion bridge.',
    sprite: { sheet: spritePath, frameWidth: 16, frameHeight: 16 },
  })
  await agent.dispatch({
    type: 'project/upsertRecord',
    payload: { table: 'actors', record: actor },
  })
  log(`Created actor #${actor.id} "${actor.name}".`)

  // 6. Test the result: can the player walk across the new terrain?
  const walk = z
    .looseObject({
      found: z.boolean(),
      path: z.array(z.looseObject({ x: z.number(), y: z.number() })).optional(),
    })
    .parse(
      await agent.query({
        type: 'FIND_PATH',
        mapId: map.id,
        from: { x: 1, y: 1 },
        to: { x: width - 2, y: height - 2 },
      }),
    )
  const pathLength = walk.found ? (walk.path?.length ?? null) : null
  log(walk.found ? `A ${pathLength}-step path crosses the map.` : 'No path crosses the map!')

  return {
    mapId: map.id,
    mapSize: { width, height },
    tilesPlaced,
    solidCells: solid.length,
    actor,
    spritePath,
    pathLength,
  }
}
