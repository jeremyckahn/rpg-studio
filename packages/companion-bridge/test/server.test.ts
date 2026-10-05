/* eslint-disable functional/immutable-data --
   The raw-socket helper below queues incoming messages by mutating an array. */
import { COMPANION_PROTOCOL_VERSION } from '@rpgstudio/core'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'

import {
  CLOSE,
  CompanionError,
  type CompanionServer,
  connectAgent,
  startCompanionServer,
} from '../src'
import { rawDataToString } from '../src/rawData'

const servers: CompanionServer[] = []
const sockets: WebSocket[] = []

afterEach(async () => {
  sockets.splice(0).forEach((socket) => {
    socket.terminate()
  })
  await Promise.all(servers.splice(0).map((server) => server.close()))
})

const start = async (options: Parameters<typeof startCompanionServer>[0] = {}) => {
  const server = await startCompanionServer({ port: 0, ...options })
  servers.push(server)
  return server
}

interface Raw {
  readonly socket: WebSocket
  readonly received: unknown[]
  next: () => Promise<unknown>
  closed: Promise<{ code: number; reason: string }>
  send: (message: unknown) => void
}

/** A bare WebSocket that records everything it receives. */
const raw = (url: string, origin?: string): Raw => {
  const socket = new WebSocket(url, origin ? { origin } : undefined)
  sockets.push(socket)
  const received: unknown[] = []
  const waiting: ((value: unknown) => void)[] = []
  socket.on('message', (data) => {
    const message: unknown = JSON.parse(rawDataToString(data))
    const waiter = waiting.shift()
    if (waiter) waiter(message)
    else received.push(message)
  })
  return {
    socket,
    received,
    next: () =>
      received.length > 0
        ? Promise.resolve(received.shift())
        : new Promise((resolve) => waiting.push(resolve)),
    closed: new Promise((resolve) => {
      socket.once('close', (code, reason) => {
        resolve({ code, reason: reason.toString() })
      })
    }),
    send: (message) => {
      const send = () => {
        socket.send(typeof message === 'string' ? message : JSON.stringify(message))
      }
      if (socket.readyState === WebSocket.OPEN) send()
      else socket.once('open', send)
    },
  }
}

const hello = (role: 'editor' | 'agent', extra: Record<string, unknown> = {}) => ({
  kind: 'hello',
  protocol: COMPANION_PROTOCOL_VERSION,
  role,
  ...extra,
})

const editorOn = async (
  server: CompanionServer,
  options: { origin?: string; token?: string } = {},
) => {
  const editor = raw(server.url, options.origin)
  editor.send(hello('editor', options.token ? { token: options.token } : {}))
  expect(await editor.next()).toMatchObject({ kind: 'welcome', role: 'editor' })
  return editor
}

describe('companion server handshake', () => {
  it('listens on the loopback interface by default and picks a free port for 0', async () => {
    const server = await start()
    expect(server.url).toMatch(/^ws:\/\/127\.0\.0\.1:\d+$/)
    expect(server.port).toBeGreaterThan(0)
  })

  it('welcomes an agent and tells it whether an editor is connected', async () => {
    const server = await start()
    const agent = raw(server.url)
    agent.send(hello('agent'))
    expect(await agent.next()).toEqual({
      kind: 'welcome',
      protocol: COMPANION_PROTOCOL_VERSION,
      role: 'agent',
      editorConnected: false,
    })
    expect(server.agentCount()).toBe(1)
  })

  it('closes connections whose first message is not a valid hello', async () => {
    const server = await start()
    for (const first of [
      'not json',
      { kind: 'query' },
      hello('agent', { protocol: 99 }),
      hello('admin' as never),
    ]) {
      const client = raw(server.url)
      client.send(first)
      expect((await client.closed).code).toBe(CLOSE.badHello)
    }
    expect(server.agentCount()).toBe(0)
  })

  it('closes connections that never say hello', async () => {
    const server = await start({ helloTimeoutMs: 50 })
    const client = raw(server.url)
    expect((await client.closed).code).toBe(CLOSE.timeout)
  })
})

describe('companion server security', () => {
  it('refuses a web page posing as an agent, which would let any site drive the editor', async () => {
    const server = await start()
    const page = raw(server.url, 'https://evil.example')
    page.send(hello('agent'))
    expect(await page.closed).toMatchObject({ code: CLOSE.forbiddenOrigin })
    expect(server.agentCount()).toBe(0)
    // Even the origin of the real editor may not act as an agent.
    const editorOrigin = raw(server.url, 'http://localhost:5173')
    editorOrigin.send(hello('agent'))
    expect((await editorOrigin.closed).code).toBe(CLOSE.forbiddenOrigin)
  })

  it('accepts the editor only from an allowed browser origin', async () => {
    const server = await start({
      allowedOrigins: ['http://localhost:5173', 'https://studio.example'],
    })
    await editorOn(server, { origin: 'http://localhost:5173' })
    expect(server.editorConnected()).toBe(true)

    const stranger = raw(server.url, 'https://evil.example')
    stranger.send(hello('editor'))
    expect(await stranger.closed).toMatchObject({ code: CLOSE.forbiddenOrigin })
    expect(server.editorConnected()).toBe(true) // the real editor is undisturbed
  })

  it('lets the deployed editor connect when its origin is allowed', async () => {
    const server = await start({ allowedOrigins: ['https://studio.example'] })
    await editorOn(server, { origin: 'https://studio.example' })
    expect(server.editorConnected()).toBe(true)
  })

  it('enforces the shared token for both roles', async () => {
    const server = await start({ token: 's3cret' })
    for (const role of ['agent', 'editor'] as const) {
      const wrong = raw(server.url)
      wrong.send(hello(role, { token: 'nope' }))
      expect((await wrong.closed).code).toBe(CLOSE.unauthorized)
      const missing = raw(server.url)
      missing.send(hello(role))
      expect((await missing.closed).code).toBe(CLOSE.unauthorized)
    }
    await editorOn(server, { token: 's3cret' })
    const agent = await connectAgent({ url: server.url, token: 's3cret' })
    expect(agent.editorConnected()).toBe(true)
    agent.close()
  })

  it('does not let an agent forge answers as if it were the editor', async () => {
    const server = await start()
    const editor = await editorOn(server)
    const agent = raw(server.url)
    agent.send(hello('agent'))
    await agent.next()
    agent.send({ kind: 'result', id: 'x', ok: true, result: 'forged' })
    agent.send({ kind: 'query', id: 'real', query: { type: 'LIST_ASSETS' } })
    const relayed = (await editor.next()) as { id: string; kind: string }
    expect(relayed.kind).toBe('query') // the forged result was never treated as a request
    editor.send({ kind: 'result', id: relayed.id, ok: true, result: ['genuine'] })
    // The forgery earned the agent an error; only the real answer carries the editor's data.
    expect(await agent.next()).toMatchObject({ kind: 'result', id: 'x', ok: false })
    expect(await agent.next()).toEqual({
      kind: 'result',
      id: 'real',
      ok: true,
      result: ['genuine'],
    })
  })

  it('does not let an editor send requests to agents or poison other connections', async () => {
    const server = await start()
    const editor = await editorOn(server)
    const agent = raw(server.url)
    agent.send(hello('agent'))
    await agent.next()
    editor.send({ kind: 'query', id: 'z', query: { type: 'LIST_ASSETS' } })
    editor.send({ kind: 'result', id: 'unknown-id', ok: true, result: 1 })
    editor.send('garbage')
    // The agent hears nothing, and the server keeps working.
    agent.send({ kind: 'query', id: 'q', query: { type: 'LIST_ASSETS' } })
    const relayed = (await editor.next()) as { id: string }
    editor.send({ kind: 'result', id: relayed.id, ok: true, result: [] })
    expect(await agent.next()).toMatchObject({ kind: 'result', id: 'q', ok: true })
  })
})

describe('companion server routing', () => {
  it('relays a request to the editor and routes the answer back to the right agent', async () => {
    const server = await start()
    const editor = await editorOn(server)
    const [first, second] = [raw(server.url), raw(server.url)]
    ;[first, second].forEach((agent) => {
      agent.send(hello('agent'))
    })
    await Promise.all([first.next(), second.next()])

    // Both agents use the same id; the server must keep them apart.
    first.send({ kind: 'query', id: '1', query: { type: 'GET_MAP_DATA', id: 1 } })
    second.send({ kind: 'query', id: '1', query: { type: 'GET_MAP_DATA', id: 2 } })
    const [a, b] = (await Promise.all([editor.next(), editor.next()])) as {
      id: string
      query: { id: number }
    }[]
    expect(a?.id).not.toBe(b?.id)
    editor.send({ kind: 'result', id: b?.id, ok: true, result: { map: b?.query.id } })
    editor.send({ kind: 'result', id: a?.id, ok: true, result: { map: a?.query.id } })
    expect(await first.next()).toEqual({ kind: 'result', id: '1', ok: true, result: { map: 1 } })
    expect(await second.next()).toEqual({ kind: 'result', id: '1', ok: true, result: { map: 2 } })
  })

  it('tells an agent immediately when there is no editor', async () => {
    const server = await start()
    const agent = raw(server.url)
    agent.send(hello('agent'))
    await agent.next()
    agent.send({ kind: 'query', id: 'q', query: { type: 'LIST_ASSETS' } })
    expect(await agent.next()).toEqual({
      kind: 'result',
      id: 'q',
      ok: false,
      error: 'No editor is connected',
    })
  })

  it('answers an invalid request with an error instead of forwarding it', async () => {
    const server = await start()
    const editor = await editorOn(server)
    const agent = raw(server.url)
    agent.send(hello('agent'))
    await agent.next()
    agent.send({ kind: 'writeAsset', id: 'bad', path: '../../etc/passwd', data: 'AAAA' })
    expect(await agent.next()).toMatchObject({ kind: 'result', id: 'bad', ok: false })
    agent.send('{not json')
    agent.send({ kind: 'query', id: 'ok', query: { type: 'LIST_ASSETS' } })
    const forwarded = (await editor.next()) as { kind: string; id: string }
    expect(forwarded.kind).toBe('query') // the bad write never reached the editor
    editor.send({ kind: 'result', id: forwarded.id, ok: true, result: [] })
    expect(await agent.next()).toMatchObject({ id: 'ok', ok: true })
  })

  it('announces the editor connecting and disconnecting to agents', async () => {
    const server = await start()
    const agent = raw(server.url)
    agent.send(hello('agent'))
    await agent.next()
    const editor = await editorOn(server)
    expect(await agent.next()).toEqual({ kind: 'status', editorConnected: true })
    editor.socket.close()
    expect(await agent.next()).toEqual({ kind: 'status', editorConnected: false })
    expect(server.editorConnected()).toBe(false)
  })

  it('fails in-flight requests when the editor disconnects', async () => {
    const server = await start()
    const editor = await editorOn(server)
    const agent = raw(server.url)
    agent.send(hello('agent'))
    await agent.next()
    agent.send({ kind: 'query', id: 'q', query: { type: 'LIST_ASSETS' } })
    await editor.next()
    editor.socket.close()
    expect(await agent.next()).toEqual({
      kind: 'result',
      id: 'q',
      ok: false,
      error: 'The editor disconnected',
    })
  })

  it('fails requests the editor never answers', async () => {
    const server = await start({ requestTimeoutMs: 40 })
    await editorOn(server)
    const agent = raw(server.url)
    agent.send(hello('agent'))
    await agent.next()
    agent.send({ kind: 'query', id: 'q', query: { type: 'LIST_ASSETS' } })
    expect(await agent.next()).toMatchObject({
      id: 'q',
      ok: false,
      error: 'The editor did not answer in time',
    })
  })

  it('replaces the old editor when a new one connects', async () => {
    const server = await start()
    const old = await editorOn(server)
    const fresh = await editorOn(server)
    expect(await old.closed).toMatchObject({ code: CLOSE.replaced })
    expect(server.editorConnected()).toBe(true)
    fresh.socket.close()
  })

  it('drops an agent’s pending requests when it disconnects, so late answers go nowhere', async () => {
    const server = await start()
    const editor = await editorOn(server)
    const agent = raw(server.url)
    agent.send(hello('agent'))
    await agent.next()
    agent.send({ kind: 'query', id: 'q', query: { type: 'LIST_ASSETS' } })
    const relayed = (await editor.next()) as { id: string }
    agent.socket.close()
    await agent.closed
    editor.send({ kind: 'result', id: relayed.id, ok: true, result: [] })
    const other = raw(server.url)
    other.send(hello('agent'))
    await other.next()
    other.send({ kind: 'query', id: 'q2', query: { type: 'LIST_ASSETS' } })
    expect(((await editor.next()) as { id: string }).id).not.toBe(relayed.id)
  })
})

describe('agent library', () => {
  it('connects, reports the editor, and waits for one to arrive', async () => {
    const server = await start()
    const agent = await connectAgent({ url: server.url })
    expect(agent.editorConnected()).toBe(false)
    const waiting = agent.waitForEditor(2_000)
    await editorOn(server)
    await expect(waiting).resolves.toBeUndefined()
    expect(agent.editorConnected()).toBe(true)
    agent.close()
  })

  it('times out waiting for an editor with a helpful message', async () => {
    const server = await start()
    const agent = await connectAgent({ url: server.url })
    await expect(agent.waitForEditor(30)).rejects.toThrow(/Open RPG Studio/)
    agent.close()
  })

  it('round-trips queries, actions, batches and assets through to the editor', async () => {
    const server = await start()
    const editor = await editorOn(server)
    const agent = await connectAgent({ url: server.url })
    const answers = (async () => {
      for (const reply of [
        { q: 1 },
        { applied: 1 },
        { applied: 2 },
        { path: 'img/a.png', bytes: 3 },
      ]) {
        const request = (await editor.next()) as { id: string }
        editor.send({ kind: 'result', id: request.id, ok: true, result: reply })
      }
    })()
    expect(await agent.query({ type: 'GET_MAP_DATA', id: 1 })).toEqual({ q: 1 })
    const rename = { type: 'project/renameMap', payload: { mapId: 1, name: 'X' } } as const
    expect(await agent.dispatch(rename)).toEqual({ applied: 1 })
    expect(await agent.batch([rename, rename])).toEqual({ applied: 2 })
    expect(await agent.writeAsset('img/a.png', Uint8Array.of(1, 2, 3))).toEqual({
      path: 'img/a.png',
      bytes: 3,
    })
    await answers
    agent.close()
  })

  it('validates locally, so mistakes never reach the wire', async () => {
    const server = await start()
    const editor = await editorOn(server)
    const agent = await connectAgent({ url: server.url })
    expect(() => agent.query({ type: 'NOPE' } as never)).toThrow()
    expect(() =>
      agent.dispatch({ type: 'project/setTiles', payload: { mapId: 1 } } as never),
    ).toThrow()
    expect(() => agent.batch([{ type: 'eval' } as never])).toThrow()
    expect(() => agent.writeAsset('../escape.png', Uint8Array.of(1))).toThrow()
    editor.socket.close()
    agent.close()
  })

  it('rejects with the editor’s reason when a request is refused', async () => {
    const server = await start()
    const editor = await editorOn(server)
    const agent = await connectAgent({ url: server.url })
    const pending = agent.query({ type: 'GET_MAP_DATA', id: 9 })
    const request = (await editor.next()) as { id: string }
    editor.send({ kind: 'result', id: request.id, ok: false, error: 'Map 9 does not exist' })
    await expect(pending).rejects.toThrow(new CompanionError('Map 9 does not exist'))
    agent.close()
  })

  it('reports an unreachable server and a refused token clearly', async () => {
    await expect(connectAgent({ url: 'ws://127.0.0.1:1' })).rejects.toThrow(/Could not reach/)
    const server = await start({ token: 'right' })
    await expect(connectAgent({ url: server.url, token: 'wrong' })).rejects.toThrow(/4401/)
  })

  it('times out a request the server never answers', async () => {
    const server = await start()
    await editorOn(server) // connected but silent
    const agent = await connectAgent({ url: server.url, requestTimeoutMs: 40 })
    await expect(agent.query({ type: 'LIST_ASSETS' })).rejects.toThrow(/timed out/)
    agent.close()
  })
})
