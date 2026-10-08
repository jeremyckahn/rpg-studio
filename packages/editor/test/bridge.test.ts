/* eslint-disable functional/immutable-data --
   The fake socket and fake timers below are test doubles that record state by mutating it. */
import {
  type AgentRequest,
  COMPANION_PROTOCOL_VERSION,
  CollisionFlags,
  type JsonValue,
  encodePng,
  bytesToBase64,
} from '@rpgstudio/core'
import { describe, expect, it, vi } from 'vitest'

import {
  type SocketEvent,
  type SocketLike,
  createCompanionClient,
  createCompanionHandler,
  createRPGStudioApi,
  installRPGStudioGlobal,
  parseCompanionUrl,
  runQuery,
} from '../src/bridge'
import { createAssetStore } from '../src/project/assetStore'
import { createEditorStore, redo, undo } from '../src/store'
import { recorder, sampleProject } from './helpers'

const setup = () => {
  const handle = createEditorStore({ project: sampleProject() })
  const assets = createAssetStore()
  const handler = createCompanionHandler({ handle, assets })
  return { handle, assets, handler }
}

const asObject = (value: JsonValue | undefined): Record<string, JsonValue> =>
  value as Record<string, JsonValue>

describe('queries', () => {
  const { handle, assets } = setup()
  const source = () => ({
    project: handle.store.getState().project.data,
    revision: handle.store.getState().project.revision,
    assets,
  })

  it('summarises the project', () => {
    const result = runQuery(source(), { type: 'GET_PROJECT_SUMMARY' })
    expect(result.success).toBe(true)
    const data = asObject(result.success ? result.data : undefined)
    expect(data['name']).toBe('Sample')
    expect(data['counts']).toEqual({ actors: 1, classes: 1, items: 1, skills: 1, enemies: 0 })
    expect(data['maps']).toMatchObject([
      { id: 1, name: 'Town', width: 6, height: 4 },
      { id: 2, name: 'Cave' },
    ])
  })

  it('returns map data, table rows and single records as plain JSON', () => {
    const map = runQuery(source(), { type: 'GET_MAP_DATA', id: 2 })
    expect(map.success && asObject(map.data)['width']).toBe(4)
    expect(runQuery(source(), { type: 'GET_MAP_DATA', id: 9 })).toEqual({
      success: false,
      error: 'Map 9 does not exist',
    })
    const table = runQuery(source(), { type: 'GET_TABLE', table: 'actors' })
    expect(table.success && table.data).toMatchObject([{ id: 1, name: 'Hero' }])
    expect(runQuery(source(), { type: 'GET_RECORD', table: 'items', id: 1 }).success).toBe(true)
    expect(runQuery(source(), { type: 'GET_RECORD', table: 'items', id: 7 })).toEqual({
      success: false,
      error: 'No record 7 in items',
    })
  })

  it('serves JSON Schema so an agent can learn the shape of a model', () => {
    const result = runQuery(source(), { type: 'GET_SCHEMA', name: 'actor' })
    const schema = asObject(result.success ? result.data : undefined)
    expect(schema['additionalProperties']).toBe(false)
    expect(schema['required']).toEqual(expect.arrayContaining(['id', 'name', 'classId']))
  })

  it('finds paths using the map’s real collision', () => {
    const open = runQuery(source(), {
      type: 'FIND_PATH',
      mapId: 1,
      from: { x: 0, y: 0 },
      to: { x: 5, y: 3 },
    })
    const found = asObject(open.success ? open.data : undefined)
    expect(found['found']).toBe(true)
    expect((found['path'] as unknown[]).length).toBe(9)

    handle.store.dispatch({
      type: 'project/setCollision',
      payload: { mapId: 1, cells: [{ x: 5, y: 3, flags: CollisionFlags.SOLID }] },
    })
    const blocked = runQuery(source(), {
      type: 'FIND_PATH',
      mapId: 1,
      from: { x: 0, y: 0 },
      to: { x: 5, y: 3 },
    })
    expect(blocked.success && asObject(blocked.data)['found']).toBe(false)
    expect(
      runQuery(source(), { type: 'FIND_PATH', mapId: 1, from: { x: 9, y: 0 }, to: { x: 1, y: 1 } })
        .success,
    ).toBe(false)
    expect(
      runQuery(source(), { type: 'FIND_PATH', mapId: 8, from: { x: 0, y: 0 }, to: { x: 1, y: 1 } })
        .success,
    ).toBe(false)
  })

  it('lists assets with their sizes', () => {
    assets.write('img/a.png', Uint8Array.of(1, 2, 3))
    const result = runQuery(source(), { type: 'LIST_ASSETS' })
    expect(result.success && result.data).toEqual([{ path: 'img/a.png', bytes: 3 }])
  })
})

describe('request handler', () => {
  const action = (x: number, tile = 5) => ({
    type: 'project/setTiles',
    payload: { mapId: 1, layer: 0, cells: [{ x, y: 0, tile }] },
  })
  const tileAt = (handle: ReturnType<typeof setup>['handle'], x: number) =>
    handle.store.getState().project.data.maps[0]?.layers[0]?.data[x]

  it('applies a valid action and reports the new revision', () => {
    const { handle, handler } = setup()
    const result = handler({ kind: 'action', id: 'a', action: action(1) })
    expect(result).toEqual({ success: true, data: { applied: 1, revision: 1 } })
    expect(tileAt(handle, 1)).toBe(5)
  })

  it('rejects malformed or hallucinated actions with a reason and changes nothing', () => {
    const { handle, handler } = setup()
    const before = handle.store.getState().project
    const attempts: unknown[] = [
      {
        type: 'project/setTiles',
        payload: { mapId: 1, layer: 0, cells: [{ x: 1, y: 0, tile: 5, glow: true }] },
      },
      { type: 'project/dropEverything', payload: {} },
      { type: 'history/undo' },
      { type: 'project/projectLoaded', payload: sampleProject() },
      'rm -rf',
      null,
    ]
    attempts.forEach((attempt) => {
      const result = handler({ kind: 'action', id: 'a', action: attempt })
      expect(result.success, JSON.stringify(attempt)).toBe(false)
      expect(!result.success && result.error).toMatch(/Action 1 .* is invalid/)
    })
    expect(handle.store.getState().project).toBe(before)
  })

  it('explains why a well-formed action was refused', () => {
    const { handler } = setup()
    const result = handler({ kind: 'action', id: 'a', action: action(99) })
    expect(!result.success && result.error).toMatch(
      /Action 1 \(project\/setTiles\) was refused: .*outside/,
    )
  })

  it('applies a batch atomically: nothing changes if any action fails', () => {
    const { handle, handler } = setup()
    const before = handle.store.getState().project
    const result = handler({
      kind: 'batch',
      id: 'b',
      actions: [action(0), action(1), action(99), action(2)],
    })
    expect(!result.success && result.error).toMatch(/Action 3 /)
    expect(handle.store.getState().project).toBe(before)
    expect(tileAt(handle, 0)).toBe(1)
  })

  it('makes a whole batch one undo step', () => {
    const { handle, handler } = setup()
    handler({ kind: 'batch', id: 'b', actions: [action(0), action(1), action(2)] })
    expect([0, 1, 2].map((x) => tileAt(handle, x))).toEqual([5, 5, 5])
    handle.store.dispatch(undo())
    expect([0, 1, 2].map((x) => tileAt(handle, x))).toEqual([1, 1, 1])
    expect(handle.store.getState().history.past).toHaveLength(0)
    handle.store.dispatch(redo())
    expect([0, 1, 2].map((x) => tileAt(handle, x))).toEqual([5, 5, 5])
  })

  it('keeps separate requests as separate undo steps', () => {
    const { handle, handler } = setup()
    handler({ kind: 'action', id: 'a', action: action(0) })
    handler({ kind: 'action', id: 'b', action: action(1) })
    expect(handle.store.getState().history.past).toHaveLength(2)
  })

  it('validates database records with the schema of their table', () => {
    const { handle, handler } = setup()
    const good = handler({
      kind: 'action',
      id: 'a',
      action: {
        type: 'project/upsertRecord',
        payload: { table: 'actors', record: { id: 2, name: 'Mage', classId: 1 } },
      },
    })
    expect(good.success).toBe(true)
    expect(handle.store.getState().project.data.database.actors.map((a) => a.name)).toEqual([
      'Hero',
      'Mage',
    ])
    const hallucinated = handler({
      kind: 'action',
      id: 'b',
      action: {
        type: 'project/upsertRecord',
        payload: { table: 'actors', record: { id: 3, name: 'X', classId: 1, hp: 999 } },
      },
    })
    expect(hallucinated.success).toBe(false)
    const dangling = handler({
      kind: 'action',
      id: 'c',
      action: {
        type: 'project/upsertRecord',
        payload: { table: 'actors', record: { id: 3, name: 'X', classId: 42 } },
      },
    })
    expect(!dangling.success && dangling.error).toMatch(/missing class 42/)
  })

  it('answers queries', () => {
    const { handler } = setup()
    const result = handler({ kind: 'query', id: 'q', query: { type: 'GET_PROJECT_SUMMARY' } })
    expect(result.success).toBe(true)
  })

  describe('writeAsset', () => {
    const write = (path: string, bytes: Uint8Array): AgentRequest => ({
      kind: 'writeAsset',
      id: 'w',
      path,
      data: bytesToBase64(bytes),
    })

    it('writes images and audio into the project', () => {
      const { handler, assets } = setup()
      const png = encodePng({ width: 1, height: 1, data: Uint8Array.of(1, 2, 3, 255) })
      expect(handler(write('img/characters/aria.png', png))).toEqual({
        success: true,
        data: { path: 'img/characters/aria.png', bytes: png.length },
      })
      expect([...(assets.readBytes('img/characters/aria.png') ?? [])]).toEqual([...png])
      expect(handler(write('audio/se/zap.ogg', Uint8Array.of(1))).success).toBe(true)
      expect(handler(write('img/characters/aria.piskel', Uint8Array.of(123))).success).toBe(true)
    })

    it('refuses project data, scripts, plugin code and unknown file types', () => {
      const { handler, assets } = setup()
      ;[
        'project.json',
        'data/actors.json',
        'maps/map-001.json',
        'plugins/x/engine.js',
        'img/evil.js',
        'img/evil.html',
        'audio/x.exe',
      ].forEach((path) => {
        const result = handler(write(path, Uint8Array.of(1)))
        expect(result.success, path).toBe(false)
        expect(!result.success && result.error, path).toMatch(/only write images, audio/)
      })
      expect(assets.list()).toEqual([])
    })

    it('makes written textures show up through the asset store events (hot reload)', () => {
      const { handler, assets } = setup()
      const changes = recorder<unknown>()
      assets.subscribe(changes.record)
      handler(write('img/characters/aria.png', Uint8Array.of(1)))
      expect(changes.values).toEqual([{ type: 'changed', path: 'img/characters/aria.png' }])
    })
  })
})

describe('RPGStudio global API', () => {
  it('answers RPGStudio.query({ type: "GET_MAP_DATA", id: 1 })', () => {
    const { handle, assets, handler } = setup()
    const api = createRPGStudioApi({ handle, assets }, handler)
    expect(asObject(api.query({ type: 'GET_MAP_DATA', id: 1 }))['name']).toBe('Town')
  })

  it('throws readable errors for bad or failing queries', () => {
    const { handle, assets, handler } = setup()
    const api = createRPGStudioApi({ handle, assets }, handler)
    expect(() => api.query({ type: 'NOPE' })).toThrow(/Invalid query/)
    expect(() => api.query({ type: 'GET_MAP_DATA', id: 99 })).toThrow('Map 99 does not exist')
  })

  it('dispatches validated actions and is installed on the window without being enumerable', () => {
    const { handle, assets, handler } = setup()
    const api = createRPGStudioApi({ handle, assets }, handler)
    expect(
      api.dispatch({ type: 'project/renameMap', payload: { mapId: 1, name: 'Renamed' } }).success,
    ).toBe(true)
    expect(api.dispatch({ type: 'eval' }).success).toBe(false)
    expect(api.version).toBe(1)
    const target = {} as Window
    installRPGStudioGlobal(target, api)
    expect(target.RPGStudio).toBe(api)
    expect(Object.keys(target)).toEqual([])
  })
})

describe('companion client', () => {
  /** A scriptable socket plus handles to drive it from the "server" side. */
  const fakeSockets = () => {
    const created: FakeSocket[] = []
    class FakeSocket implements SocketLike {
      readyState = 0
      sent: string[] = []
      closed: { code?: number; reason?: string } | null = null
      private listeners = new Map<string, ((event: SocketEvent) => void)[]>()
      constructor(readonly url: string) {
        created.push(this)
      }
      send(data: string): void {
        this.sent.push(data)
      }
      close(code?: number, reason?: string): void {
        this.closed = {
          ...(code === undefined ? {} : { code }),
          ...(reason === undefined ? {} : { reason }),
        }
      }
      addEventListener(type: string, listener: (event: SocketEvent) => void): void {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
      }
      emit(type: string, event: SocketEvent = {}): void {
        if (type === 'open') this.readyState = 1
        this.listeners.get(type)?.forEach((listener) => {
          listener(event)
        })
      }
      receive(message: unknown): void {
        this.emit('message', { data: JSON.stringify(message) })
      }
      sentMessages(): unknown[] {
        return this.sent.map((text) => JSON.parse(text) as unknown)
      }
    }
    return { created, factory: (url: string) => new FakeSocket(url) }
  }

  const timers = () => {
    const pending: { callback: () => void; ms: number; id: number }[] = []
    let next = 0
    return {
      setTimer: (callback: () => void, ms: number) => {
        next += 1
        pending.push({ callback, ms, id: next })
        return next
      },
      clearTimer: (id: unknown) => {
        const index = pending.findIndex((t) => t.id === id)
        if (index !== -1) pending.splice(index, 1)
      },
      pending,
      fire: () => {
        pending.shift()?.callback()
      },
    }
  }

  const build = (pageOrigin = 'http://localhost:5173') => {
    const sockets = fakeSockets()
    const clock = timers()
    const handler = vi.fn<
      (request: AgentRequest) => ReturnType<ReturnType<typeof createCompanionHandler>>
    >(() => ({
      success: true,
      data: { echoed: true },
    }))
    const client = createCompanionClient({
      handler,
      createSocket: sockets.factory,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      pageOrigin,
    })
    return { client, handler, clock, ...sockets }
  }

  const welcome = {
    kind: 'welcome',
    protocol: COMPANION_PROTOCOL_VERSION,
    role: 'editor',
    editorConnected: true,
  }

  it('connects to the default local address and introduces itself as the editor', () => {
    const { client, created } = build()
    client.connect()
    expect(client.status()).toBe('connecting')
    expect(created[0]?.url).toBe('ws://localhost:8080/')
    created[0]?.emit('open')
    expect(created[0]?.sentMessages()).toEqual([
      { kind: 'hello', protocol: COMPANION_PROTOCOL_VERSION, role: 'editor', name: 'RPG Studio' },
    ])
    created[0]?.receive(welcome)
    expect(client.status()).toBe('connected')
  })

  it('sends the token when one is configured', () => {
    const { client, created } = build()
    client.connect({ url: 'ws://localhost:9000', token: 's3cret' })
    created[0]?.emit('open')
    expect(created[0]?.sentMessages()[0]).toMatchObject({ token: 's3cret' })
  })

  it('executes relayed requests and answers with the result', () => {
    const { client, created, handler } = build()
    client.connect()
    created[0]?.emit('open')
    created[0]?.receive(welcome)
    created[0]?.receive({ kind: 'query', id: 'r1', query: { type: 'LIST_ASSETS' } })
    expect(handler).toHaveBeenCalledWith({
      kind: 'query',
      id: 'r1',
      query: { type: 'LIST_ASSETS' },
    })
    expect(created[0]?.sentMessages().at(-1)).toEqual({
      kind: 'result',
      id: 'r1',
      ok: true,
      result: { echoed: true },
    })
  })

  it('relays failures from the handler, and survives a handler that throws', () => {
    const { client, created, handler } = build()
    client.connect()
    created[0]?.emit('open')
    created[0]?.receive(welcome)
    handler.mockReturnValueOnce({ success: false, error: 'refused' })
    created[0]?.receive({ kind: 'action', id: 'r1', action: {} })
    expect(created[0]?.sentMessages().at(-1)).toEqual({
      kind: 'result',
      id: 'r1',
      ok: false,
      error: 'refused',
    })
    handler.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    created[0]?.receive({ kind: 'action', id: 'r2', action: {} })
    expect(created[0]?.sentMessages().at(-1)).toMatchObject({
      id: 'r2',
      ok: false,
      error: 'The editor failed: boom',
    })
  })

  it('ignores malformed messages and anything an editor should never receive', () => {
    const { client, created, handler } = build()
    client.connect()
    created[0]?.emit('open')
    created[0]?.emit('message', { data: 'not json' })
    created[0]?.emit('message', { data: new ArrayBuffer(2) })
    created[0]?.receive({ kind: 'status', editorConnected: true })
    created[0]?.receive({ kind: 'result', id: 'x', ok: true, result: null })
    created[0]?.receive({ kind: 'query', id: 'r1', query: { type: 'DROP' } })
    created[0]?.receive({ kind: 'action', id: '', action: {} })
    expect(handler).not.toHaveBeenCalled()
    expect(client.status()).toBe('connecting')
  })

  it('reconnects with growing delays and resets them once connected', () => {
    const { client, created, clock } = build()
    client.connect()
    created[0]?.emit('close', { code: 1006 })
    expect(client.status()).toBe('connecting')
    expect(client.lastError()).toMatch(/retrying in 1s/)
    expect(clock.pending[0]?.ms).toBe(1_000)
    clock.fire()
    expect(created).toHaveLength(2)
    created[1]?.emit('close', { code: 1006 })
    expect(clock.pending[0]?.ms).toBe(2_000)
    clock.fire()
    created[2]?.emit('open')
    created[2]?.receive(welcome)
    expect(client.lastError()).toBe('')
    created[2]?.emit('close', { code: 1006 })
    expect(clock.pending[0]?.ms).toBe(1_000) // backoff started over
  })

  it('does not retry after being refused by the server', () => {
    const { client, created, clock } = build()
    client.connect()
    created[0]?.emit('close', { code: 4401, reason: 'Wrong token' })
    expect(client.status()).toBe('disconnected')
    expect(client.lastError()).toMatch(/Wrong token/)
    expect(clock.pending).toHaveLength(0)
  })

  it('tells the user exactly how to allow this page when the server refuses its origin', () => {
    const { client, created, clock } = build('https://rpg-studio.com')
    client.connect()
    created[0]?.emit('close', { code: 4403, reason: 'Origin not allowed' })
    expect(client.status()).toBe('disconnected')
    expect(client.lastError()).toContain('pnpm dev:companion --allow-origin https://rpg-studio.com')
    expect(clock.pending).toHaveLength(0)
  })

  it('points a refused token at the --token option', () => {
    const { client, created } = build()
    client.connect()
    created[0]?.emit('close', { code: 4401, reason: 'Wrong token' })
    expect(client.lastError()).toMatch(/token.*Wrong token.*--token/)
  })

  it('hints that the browser may be blocking a secure page from a local server', () => {
    const secure = build('https://rpg-studio.com')
    secure.client.connect({ url: 'ws://localhost:8080' })
    secure.created[0]?.emit('close', { code: 1006 })
    expect(secure.client.lastError()).toMatch(/blocking this site.*local network/)

    const local = build('http://localhost:5173')
    local.client.connect({ url: 'ws://localhost:8080' })
    local.created[0]?.emit('close', { code: 1006 })
    expect(local.client.lastError()).toMatch(/^Could not reach the companion server; retrying/)
    expect(local.client.lastError()).not.toMatch(/blocking/)

    const remote = build('https://rpg-studio.com')
    remote.client.connect({ url: 'wss://bridge.example.com' })
    remote.created[0]?.emit('close', { code: 1006 })
    expect(remote.client.lastError()).not.toMatch(/blocking/)
  })

  it('disconnect stops reconnection and closes the socket', () => {
    const { client, created, clock } = build()
    client.connect()
    created[0]?.emit('close', { code: 1006 })
    client.disconnect()
    expect(clock.pending).toHaveLength(0)
    expect(client.status()).toBe('disconnected')
    client.connect()
    created[1]?.emit('open')
    client.disconnect()
    expect(created[1]?.closed).toMatchObject({ code: 1000 })
    created[1]?.emit('close', { code: 1000 })
    expect(clock.pending).toHaveLength(0)
  })

  it('reconnecting replaces the old socket without treating its close as a failure', () => {
    const { client, created, clock } = build()
    client.connect({ url: 'ws://localhost:1111' })
    client.connect({ url: 'ws://localhost:2222' })
    expect(created[0]?.closed).not.toBeNull()
    created[0]?.emit('close', { code: 1000 })
    expect(created[1]?.url).toBe('ws://localhost:2222/')
    expect(clock.pending).toHaveLength(0)
  })

  it('rejects addresses that are not WebSocket URLs', () => {
    expect(() => parseCompanionUrl('http://localhost:8080')).toThrow(/ws:\/\/ or wss:\/\//)
    expect(() => parseCompanionUrl('nonsense')).toThrow()
    expect(parseCompanionUrl('wss://example.com/rpg')).toBe('wss://example.com/rpg')
    const { client, created } = build()
    client.connect({ url: 'javascript:alert(1)' })
    expect(client.status()).toBe('disconnected')
    expect(client.lastError()).toMatch(/ws:\/\//)
    expect(created).toHaveLength(0)
  })

  it('notifies status listeners until they unsubscribe', () => {
    const { client, created } = build()
    const seen = recorder<string>()
    const stop = client.onStatus((status) => {
      seen.record(status)
    })
    client.connect()
    created[0]?.emit('open')
    created[0]?.receive(welcome)
    stop()
    client.disconnect()
    expect(seen.values).toEqual(['connecting', 'connected'])
  })
})
