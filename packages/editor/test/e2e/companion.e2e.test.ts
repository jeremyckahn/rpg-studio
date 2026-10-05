import {
  CollisionFlags,
  type Project,
  createStarterProject,
  decodePng,
  parsePiskel,
} from '@rpgstudio/core'
import {
  type CompanionServer,
  connectAgent,
  rawDataToString,
  runDemo,
  startCompanionServer,
} from '@rpgstudio/companion-bridge'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'

import {
  type CompanionClient,
  type SocketLike,
  createCompanionClient,
  createCompanionHandler,
} from '../../src/bridge'
import { connectTextureInvalidation } from '../../src/piskel/textureInvalidation'
import { createAssetStore } from '../../src/project/assetStore'
import { createEditorStore, redo, undo } from '../../src/store'
import { recorder } from '../helpers'

const EDITOR_ORIGIN = 'http://localhost:5173'

let cleanups: readonly (() => void | Promise<void>)[] = []
const onCleanup = (cleanup: () => void | Promise<void>): void => {
  cleanups = [...cleanups, cleanup]
}
afterEach(async () => {
  const pending = cleanups.toReversed()
  cleanups = []
  for (const cleanup of pending) await cleanup()
})

/** A browser-like socket: the origin header is what the server's security checks look at. */
const browserSocket =
  (origin: string) =>
  (url: string): SocketLike => {
    const socket = new WebSocket(url, { origin })
    // A browser reports connection failures as a `close` event; `ws` would throw on a bare `error`.
    socket.on('error', () => undefined)
    return {
      get readyState() {
        return socket.readyState
      },
      send: (data) => {
        socket.send(data)
      },
      close: (code, reason) => {
        socket.close(code, reason)
      },
      addEventListener: (type, listener) => {
        socket.addEventListener(type as 'message', (event) => {
          listener(event)
        })
      },
    }
  }

/** A running editor (store, assets, handler, client) connected to a fresh companion server. */
const startSession = async (project: Project = createStarterProject('E2E')) => {
  const server: CompanionServer = await startCompanionServer({ port: 0 })
  onCleanup(() => server.close())

  const handle = createEditorStore({ project })
  const assets = createAssetStore()
  const invalidate = vi.fn()
  connectTextureInvalidation(assets, invalidate)
  const client: CompanionClient = createCompanionClient({
    handler: createCompanionHandler({ handle, assets }),
    createSocket: browserSocket(EDITOR_ORIGIN),
  })
  onCleanup(() => {
    client.disconnect()
  })
  const connected = new Promise<void>((resolve) => {
    client.onStatus((status) => {
      if (status === 'connected') resolve()
    })
  })
  client.connect({ url: server.url })
  await connected

  const agent = await connectAgent({ url: server.url })
  onCleanup(() => {
    agent.close()
  })
  return { server, handle, assets, client, agent, invalidate }
}

describe('companion bridge end to end', () => {
  it('lets an external agent query the live editor state', async () => {
    const { agent } = await startSession()
    expect(agent.editorConnected()).toBe(true)

    const summary = (await agent.query({ type: 'GET_PROJECT_SUMMARY' })) as {
      name: string
      maps: { id: number; width: number }[]
    }
    expect(summary.name).toBe('E2E')
    expect(summary.maps[0]).toMatchObject({ id: 1, width: 20 })

    const map = (await agent.query({ type: 'GET_MAP_DATA', id: 1 })) as {
      name: string
      layers: unknown[]
    }
    expect(map.layers).toHaveLength(3)

    const schema = (await agent.query({ type: 'GET_SCHEMA', name: 'actor' })) as {
      required: string[]
    }
    expect(schema.required).toEqual(expect.arrayContaining(['id', 'name', 'classId']))
  })

  it('applies map edits sent by the agent to the editor’s Redux store', async () => {
    const { agent, handle } = await startSession()
    const tiles = () => handle.store.getState().project.data.maps[0]?.layers[0]?.data

    await agent.dispatch({
      type: 'project/fillArea',
      payload: { mapId: 1, layer: 0, tile: 3, startX: 2, startY: 2, endX: 4, endY: 3 },
    })
    const painted = [2, 3, 4].flatMap((x) => [2, 3].map((y) => tiles()?.[y * 20 + x]))
    expect(painted).toEqual([3, 3, 3, 3, 3, 3])
    expect(tiles()?.[2 * 20 + 5]).toBe(1) // neighbours untouched

    await agent.dispatch({
      type: 'project/setTiles',
      payload: { mapId: 1, layer: 1, cells: [{ x: 7, y: 7, tile: 8 }] },
    })
    expect(handle.store.getState().project.data.maps[0]?.layers[1]?.data[7 * 20 + 7]).toBe(8)
    expect(handle.store.getState().project.revision).toBe(2)
  })

  it('reverts everything an agent did in one request with a single Undo', async () => {
    const { agent, handle } = await startSession()
    const before = handle.store.getState().project.data.maps[0]
    await agent.batch([
      {
        type: 'project/setTiles',
        payload: { mapId: 1, layer: 0, cells: [{ x: 0, y: 0, tile: 6 }] },
      },
      {
        type: 'project/setTiles',
        payload: { mapId: 1, layer: 0, cells: [{ x: 1, y: 0, tile: 6 }] },
      },
      {
        type: 'project/setCollision',
        payload: { mapId: 1, cells: [{ x: 0, y: 0, flags: CollisionFlags.SOLID }] },
      },
    ])
    expect(handle.store.getState().project.data.maps[0]).not.toEqual(before)
    handle.store.dispatch(undo())
    expect(handle.store.getState().project.data.maps[0]).toEqual(before)
    handle.store.dispatch(redo())
    expect(handle.store.getState().project.data.maps[0]?.layers[0]?.data[0]).toBe(6)
  })

  it('refuses bad input without changing the project, and tells the agent why', async () => {
    const { agent, handle, server } = await startSession()
    const before = handle.store.getState().project
    // Out-of-bounds: valid shape, refused by the editor.
    await expect(
      agent.dispatch({
        type: 'project/setTiles',
        payload: { mapId: 1, layer: 0, cells: [{ x: 99, y: 0, tile: 1 }] },
      }),
    ).rejects.toThrow(/refused: .*outside/)
    // A batch with one bad action applies none of them.
    await expect(
      agent.batch([
        {
          type: 'project/setTiles',
          payload: { mapId: 1, layer: 0, cells: [{ x: 0, y: 0, tile: 9 }] },
        },
        {
          type: 'project/setTiles',
          payload: { mapId: 9, layer: 0, cells: [{ x: 0, y: 0, tile: 9 }] },
        },
      ]),
    ).rejects.toThrow(/Action 2 .* refused: Map 9 does not exist/)
    // A hand-rolled request bypassing the agent library's own validation is still caught by the editor.
    const raw = new WebSocket(server.url)
    onCleanup(() => {
      raw.terminate()
    })
    const answer = new Promise<{ ok: boolean; error?: string }>((resolve) => {
      raw.on('message', (data) => {
        const message = JSON.parse(rawDataToString(data)) as {
          kind: string
          ok?: boolean
          error?: string
        }
        if (message.kind === 'result')
          resolve({ ok: message.ok === true, ...(message.error ? { error: message.error } : {}) })
      })
      raw.on('open', () => {
        raw.send(JSON.stringify({ kind: 'hello', protocol: 1, role: 'agent' }))
        raw.send(
          JSON.stringify({
            kind: 'action',
            id: 'evil',
            action: { type: 'project/deleteMap', payload: { mapId: 1, extra: true } },
          }),
        )
      })
    })
    expect(await answer).toMatchObject({
      ok: false,
      error: expect.stringMatching(/invalid/) as string,
    })
    expect(handle.store.getState().project).toBe(before)
  })

  it('runs the reference agent: terrain, a Zod-validated actor, pixel art with live hot-reload', async () => {
    const { agent, handle, assets, invalidate } = await startSession()
    const log = recorder<string>()
    const original = handle.store.getState().project.data.maps[0]
    const summary = await runDemo(agent, { log: log.record, editorTimeoutMs: 2_000 })

    // Terrain landed in the store: border walls, a lake, a road, with matching collision.
    const map = handle.store.getState().project.data.maps[0]
    if (!map || !original) throw new Error('no map')
    const at = (x: number, y: number) => map.layers[0]?.data[y * map.width + x]
    expect(at(0, 0)).toBe(6)
    expect(at(map.width - 1, map.height - 1)).toBe(6)
    expect(at(Math.floor(map.width / 3), Math.floor(map.height / 3))).toBe(3)
    expect(at(5, Math.floor(map.height * 0.75))).toBe(2)
    expect(map.collision[0]).toBe(CollisionFlags.SOLID)
    expect(map.collision[Math.floor(map.height / 3) * map.width + Math.floor(map.width / 3)]).toBe(
      CollisionFlags.SOLID,
    )
    expect(map.collision[5 * map.width + 3]).toBe(CollisionFlags.PASSABLE)
    // Decoration never covers the lake: every cell of layer 1 above water or road is empty.
    const decoration = map.layers[1]?.data ?? []
    const lakeCell = Math.floor(map.height / 3) * map.width + Math.floor(map.width / 3)
    expect(decoration[lakeCell]).toBe(0)
    expect(decoration.some((tile) => tile === 8)).toBe(true)
    expect(summary.solidCells).toBe(
      map.collision.filter((flags) => flags === CollisionFlags.SOLID).length,
    )

    // A new actor, validated against the real schema, with the generated sprite attached.
    const actor = handle.store
      .getState()
      .project.data.database.actors.find((a) => a.name === 'Aria')
    expect(actor).toMatchObject({
      id: 2,
      classId: 1,
      initialLevel: 3,
      sprite: { sheet: 'img/characters/aria.png' },
    })
    expect(summary.actor).toEqual(actor)

    // The generated art is a real 16x16 PNG with a matching .piskel source, written into the project.
    const png = decodePng(assets.readBytes('img/characters/aria.png') ?? new Uint8Array())
    expect(png).toMatchObject({ width: 16, height: 16 })
    expect([...png.data.subarray((8 * 16 + 8) * 4, (8 * 16 + 8) * 4 + 4)]).toEqual([
      214, 47, 75, 255,
    ]) // the red tunic
    expect(parsePiskel(assets.readText('img/characters/aria.piskel') ?? '')).toMatchObject({
      name: 'aria',
      width: 16,
      height: 16,
    })

    // Writing the sprite reset the texture cache, which is what refreshes open canvases.
    expect(invalidate).toHaveBeenCalled()

    // The agent verified its own work with a path query, and narrated each step.
    expect(summary.pathLength).toBeGreaterThan(10)
    expect(log.values.join('\n')).toMatch(/An actor requires: .*classId/)
    expect(log.values.at(-1)).toMatch(/-step path crosses the map/)

    // Two undo steps (the terrain batch, then the actor) restore the original project data.
    handle.store.dispatch(undo())
    handle.store.dispatch(undo())
    expect(handle.store.getState().project.data.maps[0]).toEqual(original)
    expect(handle.store.getState().project.data.database.actors.map((a) => a.name)).toEqual([
      'Hero',
    ])
  })

  it('gives a clear failure when the editor goes away mid-conversation', async () => {
    const { agent, client } = await startSession()
    client.disconnect()
    await vi.waitFor(() => {
      expect(agent.editorConnected()).toBe(false)
    })
    await expect(agent.query({ type: 'LIST_ASSETS' })).rejects.toThrow('No editor is connected')
  })

  it('reconnects the editor automatically when the server comes back', async () => {
    const server = await startCompanionServer({ port: 0 })
    const { port } = server
    const handle = createEditorStore({ project: createStarterProject('R') })
    const client = createCompanionClient({
      handler: createCompanionHandler({ handle, assets: createAssetStore() }),
      createSocket: browserSocket(EDITOR_ORIGIN),
      backoffMs: [20],
    })
    onCleanup(() => {
      client.disconnect()
    })
    const statuses = recorder<string>()
    client.onStatus((status) => {
      statuses.record(status)
    })
    client.connect({ url: `ws://127.0.0.1:${port}` })
    await vi.waitFor(() => {
      expect(client.status()).toBe('connected')
    })

    await server.close()
    await vi.waitFor(() => {
      expect(client.status()).toBe('connecting')
    })
    const restarted = await startCompanionServer({ port })
    onCleanup(() => restarted.close())
    await vi.waitFor(
      () => {
        expect(client.status()).toBe('connected')
      },
      { timeout: 3_000 },
    )
    expect(statuses.values.filter((s) => s === 'connected')).toHaveLength(2)
  })
})
