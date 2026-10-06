import {
  COMPANION_PROTOCOL_VERSION,
  type CompanionResult,
  DEFAULT_COMPANION_URL,
  ServerToEditorSchema,
  type Unsubscribe,
} from '@rpgstudio/core'

import { type CompanionHandler } from './handler.ts'

export type CompanionStatus = 'disconnected' | 'connecting' | 'connected'

export interface CompanionConnectOptions {
  readonly url?: string
  readonly token?: string
}

export interface CompanionClient {
  /** Connects, and keeps reconnecting with backoff until `disconnect` is called. */
  connect: (options?: CompanionConnectOptions) => void
  disconnect: () => void
  status: () => CompanionStatus
  /** Why the last attempt ended, for display. Empty while connected. */
  lastError: () => string
  onStatus: (listener: (status: CompanionStatus, error: string) => void) => Unsubscribe
}

export interface SocketEvent {
  readonly data?: unknown
  readonly code?: number
  readonly reason?: string
}

/** The slice of the browser `WebSocket` the client uses, so tests can bring their own. */
export interface SocketLike {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(type: string, listener: (event: SocketEvent) => void): void
}

export interface CompanionClientOptions {
  readonly handler: CompanionHandler
  readonly createSocket?: (url: string) => SocketLike
  readonly setTimer?: (callback: () => void, ms: number) => unknown
  readonly clearTimer?: (handle: unknown) => void
  /** Delays between reconnection attempts; the last one repeats. */
  readonly backoffMs?: readonly number[]
  /** This page's origin, named in the fix for a refused connection. Defaults to the real one. */
  readonly pageOrigin?: string
}

const SOCKET_OPEN = 1
/** Server close codes after which retrying would be pointless. */
const FATAL_CODES: ReadonlySet<number> = new Set([4400, 4401, 4403])

/** What to tell the user when the server closes the connection with one of its refusal codes. */
const refusalMessage = (code: number, reason: string | undefined, origin: string): string => {
  if (code === 4403) {
    return `The server does not allow this page (${origin}) to connect. Restart it with: pnpm dev:companion --allow-origin ${origin}`
  }
  if (code === 4401) {
    return `The server refused the token${reason ? ` (${reason})` : ''}. Enter the token the server was started with (--token).`
  }
  return reason
    ? `The server refused the connection: ${reason}`
    : 'The server refused the connection'
}

/**
 * Secure pages can be stopped by the browser from reaching a server on your own computer.
 * That failure is silent (the socket just closes), so hint at it once we know it could apply.
 */
const unreachableMessage = (seconds: number, origin: string, url: string): string => {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)
  const hint =
    origin.startsWith('https:') && local
      ? ' If the server is running, your browser may be blocking this site from reaching it: check the site permissions (the icon left of the address) and allow local network access.'
      : ''
  return `Could not reach the companion server; retrying in ${seconds}s.${hint}`
}

export const parseCompanionUrl = (input: string): string => {
  const url = new URL(input)
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new Error('The companion address must start with ws:// or wss://')
  }
  return url.href
}

/**
 * The editor's outbound WebSocket client. The editor dials a local companion
 * server and executes the requests relayed from AI agents; everything it
 * receives is validated before it touches the store.
 */
export const createCompanionClient = ({
  handler,
  createSocket = (url) => new WebSocket(url),
  setTimer = (callback, ms) => setTimeout(callback, ms),
  clearTimer = (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>)
  },
  backoffMs = [1_000, 2_000, 4_000, 8_000, 10_000],
  pageOrigin = globalThis.location?.origin ?? "this page's address",
}: CompanionClientOptions): CompanionClient => {
  let status: CompanionStatus = 'disconnected'
  let error = ''
  let wanted = false
  let attempt = 0
  let socket: SocketLike | null = null
  let retry: unknown = null
  let listeners: readonly ((status: CompanionStatus, error: string) => void)[] = []
  let options: CompanionConnectOptions = {}

  const setStatus = (next: CompanionStatus, message = ''): void => {
    status = next
    error = message
    listeners.forEach((listener) => {
      listener(status, error)
    })
  }

  const respond = (target: SocketLike, result: CompanionResult): void => {
    if (target.readyState === SOCKET_OPEN) target.send(JSON.stringify(result))
  }

  const open = (): void => {
    let url: string
    try {
      url = parseCompanionUrl(options.url ?? DEFAULT_COMPANION_URL)
    } catch (cause) {
      wanted = false
      setStatus('disconnected', cause instanceof Error ? cause.message : String(cause))
      return
    }
    setStatus('connecting')
    const current = createSocket(url)
    socket = current

    current.addEventListener('open', () => {
      current.send(
        JSON.stringify({
          kind: 'hello',
          protocol: COMPANION_PROTOCOL_VERSION,
          role: 'editor',
          name: 'RPG Studio',
          ...(options.token ? { token: options.token } : {}),
        }),
      )
    })

    current.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return
      let raw: unknown
      try {
        raw = JSON.parse(event.data)
      } catch {
        return
      }
      const message = ServerToEditorSchema.safeParse(raw)
      if (!message.success) return
      if (message.data.kind === 'welcome') {
        attempt = 0
        setStatus('connected')
        return
      }
      const request = message.data
      try {
        const outcome = handler(request)
        respond(
          current,
          outcome.success
            ? { kind: 'result', id: request.id, ok: true, result: outcome.data }
            : { kind: 'result', id: request.id, ok: false, error: outcome.error },
        )
      } catch (cause) {
        respond(current, {
          kind: 'result',
          id: request.id,
          ok: false,
          error: `The editor failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        })
      }
    })

    current.addEventListener('close', (event) => {
      if (socket !== current) return
      socket = null
      const code = event.code ?? 1006
      if (FATAL_CODES.has(code)) {
        wanted = false
        setStatus('disconnected', refusalMessage(code, event.reason, pageOrigin))
        return
      }
      if (!wanted) {
        setStatus('disconnected')
        return
      }
      const delay = backoffMs[Math.min(attempt, backoffMs.length - 1)] ?? 10_000
      attempt += 1
      setStatus(
        'connecting',
        unreachableMessage(
          Math.round(delay / 1000),
          pageOrigin,
          parseCompanionUrl(options.url ?? DEFAULT_COMPANION_URL),
        ),
      )
      retry = setTimer(() => {
        retry = null
        if (wanted) open()
      }, delay)
    })
  }

  return {
    connect: (next = {}) => {
      options = next
      wanted = true
      attempt = 0
      if (retry !== null) {
        clearTimer(retry)
        retry = null
      }
      if (socket) {
        const old = socket
        socket = null
        old.close()
      }
      open()
    },
    disconnect: () => {
      wanted = false
      if (retry !== null) {
        clearTimer(retry)
        retry = null
      }
      const old = socket
      socket = null
      old?.close(1000, 'Disconnected by the user')
      setStatus('disconnected')
    },
    status: () => status,
    lastError: () => error,
    onStatus: (listener) => {
      listeners = [...listeners, listener]
      return () => {
        listeners = listeners.filter((candidate) => candidate !== listener)
      }
    },
  }
}
