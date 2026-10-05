import {
  type AddLayerPayload,
  type CreateMapPayload,
  type DeleteMapPayload,
  type DeleteRecordPayload,
  type FillAreaPayload,
  type FloodFillPayload,
  type Project,
  type ProjectAction,
  ProjectSchema,
  type RemoveLayerPayload,
  type RemoveMapEventPayload,
  type RenameMapPayload,
  type ResizeMapPayload,
  type Result,
  type SetCollisionPayload,
  type SetLayerPropsPayload,
  type SetTilesPayload,
  type Tilemap,
  type UpdateMetaPayload,
  type UpsertMapEventPayload,
  type UpsertRecordPayload,
  MAX_LAYERS,
  cellIndex,
  cellsInRect,
  createEmptyMap,
  fail,
  flattenCommands,
  inBounds,
  ok,
} from '@rpgstudio/core'

import { floodFillCells } from './floodFill.ts'

/**
 * Pure project transformations. Every project-editing action is applied by one
 * of these functions: the Redux reducers call them, and so does the companion
 * bridge, which can therefore report *why* an AI action was rejected without
 * dispatching it. Each returns a new project (sharing untouched parts with the
 * old one) or an error message; none mutates its input.
 */

const nextId = (ids: readonly number[]): number => Math.max(0, ...ids) + 1

const findMap = (project: Project, mapId: number): Tilemap | undefined =>
  project.maps.find((map) => map.id === mapId)

const replaceMap = (project: Project, map: Tilemap): Project => ({
  ...project,
  maps: project.maps.map((candidate) => (candidate.id === map.id ? map : candidate)),
})

const withMap = (
  project: Project,
  mapId: number,
  change: (map: Tilemap) => Result<Tilemap>,
): Result<Project> => {
  const map = findMap(project, mapId)
  if (!map) return fail(`Map ${mapId} does not exist`)
  const changed = change(map)
  return changed.success ? ok(replaceMap(project, changed.data)) : changed
}

/** For operations that touch relationships: accept only a project that is wholly valid. */
const validated = (candidate: Project): Result<Project> => {
  const parsed = ProjectSchema.safeParse(candidate)
  return parsed.success
    ? ok(candidate)
    : fail(
        parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join('.') || 'project'}: ${issue.message}`)
          .join('; '),
      )
}

const setLayerTiles = (
  map: Tilemap,
  layerIndex: number,
  cells: readonly { readonly x: number; readonly y: number; readonly tile: number }[],
): Result<Tilemap> => {
  const layer = map.layers[layerIndex]
  if (!layer) return fail(`Map ${map.id} has no layer ${layerIndex}`)
  const outside = cells.find((cell) => !inBounds(map, cell))
  if (outside) {
    return fail(`Cell (${outside.x}, ${outside.y}) is outside the ${map.width}x${map.height} map`)
  }
  const updates = new Map(cells.map((cell) => [cellIndex(map, cell), cell.tile]))
  return ok({
    ...map,
    layers: map.layers.map((candidate, index) =>
      index === layerIndex
        ? { ...candidate, data: candidate.data.map((tile, i) => updates.get(i) ?? tile) }
        : candidate,
    ),
  })
}

const setTiles = (project: Project, { mapId, layer, cells }: SetTilesPayload): Result<Project> =>
  withMap(project, mapId, (map) => setLayerTiles(map, layer, cells))

const fillArea = (project: Project, p: FillAreaPayload): Result<Project> =>
  withMap(project, p.mapId, (map) => {
    const corners = [
      { x: p.startX, y: p.startY },
      { x: p.endX, y: p.endY },
    ]
    const outside = corners.find((corner) => !inBounds(map, corner))
    if (outside) {
      return fail(
        `Corner (${outside.x}, ${outside.y}) is outside the ${map.width}x${map.height} map`,
      )
    }
    const [a, b] = corners as [(typeof corners)[number], (typeof corners)[number]]
    return setLayerTiles(
      map,
      p.layer,
      cellsInRect(map, a, b).map((cell) => ({ ...cell, tile: p.tile })),
    )
  })

const floodFill = (project: Project, p: FloodFillPayload): Result<Project> =>
  withMap(project, p.mapId, (map) => {
    const layer = map.layers[p.layer]
    if (!layer) return fail(`Map ${map.id} has no layer ${p.layer}`)
    if (!inBounds(map, p)) return fail(`Cell (${p.x}, ${p.y}) is outside the map`)
    const region = floodFillCells(map, layer.data, p)
    return setLayerTiles(
      map,
      p.layer,
      region.map((index) => ({
        x: index % map.width,
        y: Math.floor(index / map.width),
        tile: p.tile,
      })),
    )
  })

const setCollision = (project: Project, { mapId, cells }: SetCollisionPayload): Result<Project> =>
  withMap(project, mapId, (map) => {
    const outside = cells.find((cell) => !inBounds(map, cell))
    if (outside) {
      return fail(`Cell (${outside.x}, ${outside.y}) is outside the ${map.width}x${map.height} map`)
    }
    const updates = new Map(cells.map((cell) => [cellIndex(map, cell), cell.flags]))
    return ok({ ...map, collision: map.collision.map((flags, i) => updates.get(i) ?? flags) })
  })

const createMap = (project: Project, p: CreateMapPayload): Result<Project> => {
  const id = p.id ?? nextId(project.maps.map((map) => map.id))
  if (findMap(project, id)) return fail(`Map ${id} already exists`)
  const map = createEmptyMap({
    id,
    name: p.name,
    width: p.width,
    height: p.height,
    ...(p.tileSize === undefined ? {} : { tileSize: p.tileSize }),
    ...(p.tileset === undefined ? {} : { tileset: p.tileset }),
  })
  return ok({ ...project, maps: [...project.maps, map] })
}

const resizeMap = (
  project: Project,
  { mapId, width, height }: ResizeMapPayload,
): Result<Project> => {
  const resized = withMap(project, mapId, (map) => {
    const cell = (data: readonly number[], i: number): number => {
      const x = i % width
      const y = Math.floor(i / width)
      return x < map.width && y < map.height ? (data[y * map.width + x] ?? 0) : 0
    }
    const cells = width * height
    return ok({
      ...map,
      width,
      height,
      layers: map.layers.map((layer) => ({
        ...layer,
        data: Array.from({ length: cells }, (_, i) => cell(layer.data, i)),
      })),
      collision: Array.from({ length: cells }, (_, i) => cell(map.collision, i)),
      events: map.events.filter((event) => event.x < width && event.y < height),
    })
  })
  if (!resized.success) return resized
  // Keep the start position on the map; transfers into the map are checked below.
  const { meta } = resized.data
  const clampedStart =
    meta.startMapId === mapId
      ? {
          ...meta,
          startX: Math.min(meta.startX, width - 1),
          startY: Math.min(meta.startY, height - 1),
        }
      : meta
  return validated({ ...resized.data, meta: clampedStart })
}

const renameMap = (project: Project, { mapId, name }: RenameMapPayload): Result<Project> =>
  withMap(project, mapId, (map) => ok({ ...map, name }))

const deleteMap = (project: Project, { mapId }: DeleteMapPayload): Result<Project> => {
  if (!findMap(project, mapId)) return fail(`Map ${mapId} does not exist`)
  if (project.meta.startMapId === mapId) return fail('Cannot delete the map the game starts on')
  const transfers = project.maps.flatMap((map) =>
    map.events.flatMap((event) =>
      event.pages.some((page) =>
        flattenCommands(page.commands).some(
          (command) => command.command === 'TransferPlayer' && command.mapId === mapId,
        ),
      )
        ? [`event ${event.id} on map ${map.id}`]
        : [],
    ),
  )
  if (transfers.length > 0) {
    return fail(`Map ${mapId} is still the destination of ${transfers.join(', ')}`)
  }
  return ok({ ...project, maps: project.maps.filter((map) => map.id !== mapId) })
}

const addLayer = (project: Project, { mapId, name }: AddLayerPayload): Result<Project> =>
  withMap(project, mapId, (map) =>
    map.layers.length >= MAX_LAYERS
      ? fail(`A map can have at most ${MAX_LAYERS} layers`)
      : ok({
          ...map,
          layers: [
            ...map.layers,
            {
              name,
              visible: true,
              above: false,
              data: Array.from({ length: map.width * map.height }, () => 0),
            },
          ],
        }),
  )

const removeLayer = (project: Project, { mapId, layer }: RemoveLayerPayload): Result<Project> =>
  withMap(project, mapId, (map) => {
    if (!map.layers[layer]) return fail(`Map ${map.id} has no layer ${layer}`)
    if (map.layers.length === 1) return fail('A map needs at least one layer')
    return ok({ ...map, layers: map.layers.filter((_, index) => index !== layer) })
  })

const setLayerProps = (project: Project, p: SetLayerPropsPayload): Result<Project> =>
  withMap(project, p.mapId, (map) => {
    if (!map.layers[p.layer]) return fail(`Map ${map.id} has no layer ${p.layer}`)
    const { mapId: _mapId, layer: _layer, ...changes } = p
    const defined = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined),
    )
    return ok({
      ...map,
      layers: map.layers.map((candidate, index) =>
        index === p.layer ? { ...candidate, ...defined } : candidate,
      ),
    })
  })

const upsertRecord = (
  project: Project,
  { table, record }: UpsertRecordPayload,
): Result<Project> => {
  const rows = project.database[table] as readonly { readonly id: number }[]
  const exists = rows.some((row) => row.id === record.id)
  const next = exists ? rows.map((row) => (row.id === record.id ? record : row)) : [...rows, record]
  return validated({ ...project, database: { ...project.database, [table]: next } })
}

const deleteRecord = (project: Project, { table, id }: DeleteRecordPayload): Result<Project> => {
  const rows = project.database[table] as readonly { readonly id: number }[]
  if (!rows.some((row) => row.id === id)) return fail(`No record ${id} in ${table}`)
  return validated({
    ...project,
    database: { ...project.database, [table]: rows.filter((row) => row.id !== id) },
  })
}

const upsertMapEvent = (
  project: Project,
  { mapId, event }: UpsertMapEventPayload,
): Result<Project> => {
  const map = findMap(project, mapId)
  if (!map) return fail(`Map ${mapId} does not exist`)
  const exists = map.events.some((candidate) => candidate.id === event.id)
  const events = exists
    ? map.events.map((candidate) => (candidate.id === event.id ? event : candidate))
    : [...map.events, event]
  // Validated as a whole: the event must fit the map and its transfers must be real.
  return validated(replaceMap(project, { ...map, events }))
}

const removeMapEvent = (
  project: Project,
  { mapId, eventId }: RemoveMapEventPayload,
): Result<Project> =>
  withMap(project, mapId, (map) =>
    map.events.some((event) => event.id === eventId)
      ? ok({ ...map, events: map.events.filter((event) => event.id !== eventId) })
      : fail(`Map ${mapId} has no event ${eventId}`),
  )

const updateMeta = (project: Project, { changes }: UpdateMetaPayload): Result<Project> => {
  const defined = Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  )
  return validated({ ...project, meta: { ...project.meta, ...defined } })
}

/**
 * Applies a project action to a project. Returns the new project, or an error
 * describing why the action was refused (a missing map, an out-of-bounds cell,
 * a dangling reference...). The input project is never modified.
 */
export const applyProjectAction = (project: Project, action: ProjectAction): Result<Project> => {
  switch (action.type) {
    case 'project/setTiles':
      return setTiles(project, action.payload)
    case 'project/fillArea':
      return fillArea(project, action.payload)
    case 'project/floodFill':
      return floodFill(project, action.payload)
    case 'project/setCollision':
      return setCollision(project, action.payload)
    case 'project/createMap':
      return createMap(project, action.payload)
    case 'project/resizeMap':
      return resizeMap(project, action.payload)
    case 'project/renameMap':
      return renameMap(project, action.payload)
    case 'project/deleteMap':
      return deleteMap(project, action.payload)
    case 'project/addLayer':
      return addLayer(project, action.payload)
    case 'project/removeLayer':
      return removeLayer(project, action.payload)
    case 'project/setLayerProps':
      return setLayerProps(project, action.payload)
    case 'project/upsertRecord':
      return upsertRecord(project, action.payload)
    case 'project/deleteRecord':
      return deleteRecord(project, action.payload)
    case 'project/upsertMapEvent':
      return upsertMapEvent(project, action.payload)
    case 'project/removeMapEvent':
      return removeMapEvent(project, action.payload)
    case 'project/updateMeta':
      return updateMeta(project, action.payload)
  }
}
