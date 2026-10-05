import {
  AgentRequestSchema,
  COMPANION_PROTOCOL_VERSION,
  type CompanionResult,
  EditorToServerSchema,
  HelloSchema,
  MAX_COMPANION_MESSAGE_BYTES,
  ResultSchema,
} from '@rpgstudio/core'
import { type IncomingMessage } from 'node:http'
import { type RawData, type WebSocket, WebSocketServer } from 'ws'

import { rawDataToString } from './rawData.ts'

/** WebSocket close codes this server uses (the 4000 range is for applications). */
export const CLOSE = {
  replaced: 4000,
  badHello: 4400,
  unauthorized: 4401,
  forbiddenOrigin: 4403,
  timeout: 4408,
} as const

export interface CompanionServerOptions {
  /** `0` picks a free port. Defaults to 8080. */
  readonly port?: number
  /** Defaults to loopback only. Binding elsewhere exposes the editor to the network. */
  readonly host?: string
  /**
   * Browser origins the *editor* may connect from. Browsers cannot hide their
   * origin, so this is what stops an arbitrary web page from posing as the editor.
   */
  readonly allowedOrigins?: readonly string[]
  /** If set, every connection must send this token in its hello. */
  readonly token?: string
  /** How long a connection may stay silent before sending hello. */
  readonly helloTimeoutMs?: number
  /** How long to wait for the editor to answer an agent's request. */
  readonly requestTimeoutMs?: number
  readonly log?: (message: string) => void
}

export interface CompanionServer {
  readonly port: number
  readonly url: string
  editorConnected: () => boolean
  agentCount: () => number
  close: () => Promise<void>
}

/** Where the Vite dev server and preview serve the editor from. */
export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]

interface Pending {
  readonly agent: WebSocket
  readonly originalId: string
  readonly timer: NodeJS.Timeout
}

const send = (socket: WebSocket, message: unknown): void => {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
}

const parseJson = (data: RawData): unknown => {
  try {
    return JSON.parse(rawDataToString(data)) as unknown
  } catch {
    return undefined
  }
}

const failure = (id: string, error: string): CompanionResult => ({
  kind: 'result',
  id,
  ok: false,
  error,
})

/**
 * The relay between AI agents and the editor. The editor connects *out* to this
 * server (as the architecture specifies); agents connect in. Requests from an
 * agent are forwarded to the editor and its answer is routed back, so several
 * agents can work at once without seeing each other's traffic.
 */
export const startCompanionServer = (
  options: CompanionServerOptions = {},
): Promise<CompanionServer> => {
  const {
    port = 8080,
    host = '127.0.0.1',
    allowedOrigins = DEFAULT_ALLOWED_ORIGINS,
    token,
    helloTimeoutMs = 5_000,
    requestTimeoutMs = 30_000,
    log = () => undefined,
  } = options

  const wss = new WebSocketServer({ port, host, maxPayload: MAX_COMPANION_MESSAGE_BYTES })
  let editor: WebSocket | null = null
  let agents: ReadonlySet<WebSocket> = new Set()
  let pending: ReadonlyMap<string, Pending> = new Map()
  let nextRelay = 0

  const broadcastStatus = (): void => {
    agents.forEach((agent) => {
      send(agent, { kind: 'status', editorConnected: editor !== null })
    })
  }

  const settle = (relayId: string, result: CompanionResult | null): void => {
    const entry = pending.get(relayId)
    if (!entry) return
    clearTimeout(entry.timer)
    pending = new Map([...pending].filter(([id]) => id !== relayId))
    if (result) send(entry.agent, { ...result, id: entry.originalId })
  }

  const failAll = (match: (entry: Pending) => boolean, error: string): void => {
    ;[...pending]
      .filter(([, entry]) => match(entry))
      .forEach(([relayId, entry]) => {
        settle(relayId, failure(entry.originalId, error))
      })
  }

  const originAllowed = (origin: string | undefined, role: 'editor' | 'agent'): boolean => {
    // Scripts do not send an Origin; browsers always do. A browser page must never be
    // able to act as an agent (it could drive the user's editor), and may only be the
    // editor if its origin was explicitly allowed.
    if (origin === undefined) return true
    return role === 'editor' && allowedOrigins.includes(origin)
  }

  const handleAgent = (socket: WebSocket): void => {
    agents = new Set(agents).add(socket)
    socket.on('message', (data) => {
      const raw = parseJson(data)
      const parsed = AgentRequestSchema.safeParse(raw)
      if (!parsed.success) {
        const id =
          typeof (raw as { id?: unknown } | undefined)?.id === 'string'
            ? (raw as { id: string }).id
            : null
        if (id && id.length <= 64)
          send(
            socket,
            failure(id, `Invalid request: ${parsed.error.issues[0]?.message ?? 'unknown'}`),
          )
        return
      }
      const request = parsed.data
      if (!editor) {
        send(socket, failure(request.id, 'No editor is connected'))
        return
      }
      nextRelay += 1
      const relayId = `r${nextRelay}`
      const timer = setTimeout(() => {
        settle(relayId, failure(request.id, 'The editor did not answer in time'))
      }, requestTimeoutMs)
      pending = new Map(pending).set(relayId, { agent: socket, originalId: request.id, timer })
      send(editor, { ...request, id: relayId })
    })
    socket.on('close', () => {
      agents = new Set([...agents].filter((agent) => agent !== socket))
      failAll((entry) => entry.agent === socket, 'The agent disconnected')
    })
  }

  const handleEditor = (socket: WebSocket): void => {
    const previous = editor
    editor = socket
    previous?.close(CLOSE.replaced, 'Another editor connected')
    broadcastStatus()
    socket.on('message', (data) => {
      const parsed = EditorToServerSchema.safeParse(parseJson(data))
      if (!parsed.success || parsed.data.kind !== 'result') return
      const result = ResultSchema.safeParse(parsed.data)
      if (result.success) settle(result.data.id, result.data)
    })
    socket.on('close', () => {
      if (editor !== socket) return // already replaced
      editor = null
      failAll(() => true, 'The editor disconnected')
      broadcastStatus()
    })
  }

  wss.on('connection', (socket: WebSocket, request: IncomingMessage) => {
    const origin = request.headers.origin
    const timer = setTimeout(() => {
      socket.close(CLOSE.timeout, 'No hello received')
    }, helloTimeoutMs)

    socket.once('message', (data) => {
      clearTimeout(timer)
      const hello = HelloSchema.safeParse(parseJson(data))
      if (!hello.success) {
        socket.close(CLOSE.badHello, 'Expected a hello message')
        return
      }
      const { role, token: offered } = hello.data
      if (token !== undefined && offered !== token) {
        log(`rejected ${role}: wrong token`)
        socket.close(CLOSE.unauthorized, 'Wrong token')
        return
      }
      if (!originAllowed(origin, role)) {
        log(`rejected ${role} from origin ${origin ?? '(none)'}`)
        socket.close(CLOSE.forbiddenOrigin, 'Origin not allowed')
        return
      }
      log(`${role} connected${origin ? ` from ${origin}` : ''}`)
      send(socket, {
        kind: 'welcome',
        protocol: COMPANION_PROTOCOL_VERSION,
        role,
        editorConnected: role === 'editor' || editor !== null,
      })
      if (role === 'editor') handleEditor(socket)
      else handleAgent(socket)
    })
    socket.on('close', () => {
      clearTimeout(timer)
    })
    socket.on('error', (error) => {
      log(`socket error: ${error.message}`)
    })
  })

  return new Promise((resolve, reject) => {
    wss.once('error', reject)
    wss.once('listening', () => {
      const address = wss.address()
      const actualPort = typeof address === 'object' && address ? address.port : port
      resolve({
        port: actualPort,
        url: `ws://${host === '0.0.0.0' ? 'localhost' : host}:${actualPort}`,
        editorConnected: () => editor !== null,
        agentCount: () => agents.size,
        close: () =>
          new Promise<void>((done) => {
            pending.forEach((entry) => {
              clearTimeout(entry.timer)
            })
            wss.clients.forEach((client) => {
              client.terminate()
            })
            wss.close(() => {
              done()
            })
          }),
      })
    })
  })
}
