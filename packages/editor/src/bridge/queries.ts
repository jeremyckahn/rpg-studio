import {
  DATABASE_TABLES,
  type JsonValue,
  type Project,
  type Query,
  type Result,
  canStep,
  fail,
  findPath,
  inBounds,
  isSolidCell,
  jsonSchemaFor,
  ok,
} from '@rpgstudio/core'

import { type AssetStore } from '../project/assetStore.ts'

/** What a query can see. Queries never change anything. */
export interface QuerySource {
  readonly project: Project
  readonly revision: number
  readonly assets: AssetStore
}

/** A deep copy that is guaranteed to be plain JSON. */
const toJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue

/**
 * Answers a structured read, e.g. `{ type: 'GET_MAP_DATA', id: 1 }`. Used for
 * both the WebSocket bridge and the in-page `RPGStudio.query` API.
 */
export const runQuery = (source: QuerySource, query: Query): Result<JsonValue> => {
  const { project, revision, assets } = source

  switch (query.type) {
    case 'GET_PROJECT_SUMMARY':
      return ok(
        toJson({
          name: project.meta.name,
          revision,
          startMapId: project.meta.startMapId,
          startX: project.meta.startX,
          startY: project.meta.startY,
          startParty: project.meta.startParty,
          plugins: project.meta.plugins,
          maps: project.maps.map((map) => ({
            id: map.id,
            name: map.name,
            width: map.width,
            height: map.height,
            tileSize: map.tileSize,
            tileset: map.tileset,
            layers: map.layers.map((layer) => layer.name),
            events: map.events.length,
          })),
          counts: Object.fromEntries(
            DATABASE_TABLES.map((table) => [table, project.database[table].length]),
          ),
        }),
      )

    case 'GET_MAP_DATA': {
      const map = project.maps.find((candidate) => candidate.id === query.id)
      return map ? ok(toJson(map)) : fail(`Map ${query.id} does not exist`)
    }

    case 'GET_TABLE':
      return ok(toJson(project.database[query.table]))

    case 'GET_RECORD': {
      const rows = project.database[query.table] as readonly { readonly id: number }[]
      const row = rows.find((candidate) => candidate.id === query.id)
      return row ? ok(toJson(row)) : fail(`No record ${query.id} in ${query.table}`)
    }

    case 'GET_SCHEMA':
      return ok(toJson(jsonSchemaFor(query.name)))

    case 'FIND_PATH': {
      const map = project.maps.find((candidate) => candidate.id === query.mapId)
      if (!map) return fail(`Map ${query.mapId} does not exist`)
      if (!inBounds(map, query.from))
        return fail(`Start (${query.from.x}, ${query.from.y}) is outside the map`)
      if (!inBounds(map, query.to))
        return fail(`Goal (${query.to.x}, ${query.to.y}) is outside the map`)
      const path = findPath({
        width: map.width,
        height: map.height,
        start: query.from,
        goal: query.to,
        goalReachable: (goal) => !isSolidCell(map, goal),
        canStep: (cell, direction) => canStep(map, cell, direction),
      })
      return ok(toJson({ found: path !== null, path: path ?? [] }))
    }

    case 'LIST_ASSETS':
      return ok(
        toJson(assets.list().map((path) => ({ path, bytes: assets.readBytes(path)?.length ?? 0 }))),
      )
  }
}
