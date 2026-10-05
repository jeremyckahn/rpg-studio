import {
  AssetPathSchema,
  COMPANION_PROTOCOL_VERSION,
  DEFAULT_COMPANION_URL,
  type JsonValue,
  type ProjectAction,
  ProjectActionSchema,
  type Query,
  QuerySchema,
  ServerToAgentSchema,
  bytesToBase64,
} from '@rpgstudio/core'
import { WebSocket } from 'ws'

import { rawDataToString } from './rawData.ts'

export class CompanionError extends Error {
  override readonly name = 'CompanionError'
}

export interface AgentOptions {
  readonly url?: string
  readonly token?: string
  readonly name?: string
  /** How long to wait for an answer to one request. */
  readonly requestTimeoutMs?: number
}

export interface AgentConnection {
  /** Whether the editor is currently connected to the server. */
  editorConnected: () => boolean
  /** Resolves once an editor is connected, or rejects after `timeoutMs`. */
  waitForEditor: (timeoutMs?: number) => Promise<void>
  /** `RPGStudio.query({ type: 'GET_MAP_DATA', id: 1 })`, from outside the browser. */
  query: (query: Query) => Promise<JsonValue>
  /** Applies one project action. The editor validates it again. */
  dispatch: (action: ProjectAction) => Promise<JsonValue>
  /** Applies several actions all-or-nothing, undone together by one Undo. */
  batch: (actions: readonly ProjectAction[]) => Promise<JsonValue>
  /** Writes a file (e.g. a generated PNG) into the project; open canvases refresh at once. */
  writeAsset: (path: string, bytes: Uint8Array) => Promise<JsonValue>
  close: () => void
}

interface Waiter {
  readonly resolve: (value: JsonValue) => void
  readonly reject: (error: Error) => void
  readonly timer: NodeJS.Timeout
}

/**
 * Connects to a companion server as an agent. Every outgoing query, action and
 * asset path is checked against the same Zod schemas the editor uses, so a
 * mistake fails here, with a precise message, rather than after a round trip.
 */
export const connectAgent = (options: AgentOptions = {}): Promise<AgentConnection> => {
  const {
    url = DEFAULT_COMPANION_URL,
    token,
    name = 'rpgstudio-agent',
    requestTimeoutMs = 30_000,
  } = options
  const socket = new WebSocket(url)
  let waiters: ReadonlyMap<string, Waiter> = new Map()
  let counter = 0
  let editorConnected = false
  let editorListeners: readonly (() => void)[] = []

  const takeWaiter = (id: string): Waiter | undefined => {
    const waiter = waiters.get(id)
    if (waiter) {
      clearTimeout(waiter.timer)
      waiters = new Map([...waiters].filter(([key]) => key !== id))
    }
    return waiter
  }

  const rejectAll = (error: Error): void => {
    ;[...waiters.keys()].forEach((id) => takeWaiter(id)?.reject(error))
  }

  const request = (build: (id: string) => Record<string, unknown>): Promise<JsonValue> => {
    counter += 1
    const id = `q${counter}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        takeWaiter(id)?.reject(new CompanionError('The request timed out'))
      }, requestTimeoutMs)
      waiters = new Map(waiters).set(id, { resolve, reject, timer })
      socket.send(JSON.stringify(build(id)), (error) => {
        if (error) takeWaiter(id)?.reject(new CompanionError(error.message))
      })
    })
  }

  return new Promise((resolve, reject) => {
    socket.once('error', (error) => {
      reject(new CompanionError(`Could not reach ${url}: ${error.message}`))
    })
    socket.once('close', (code, reason) => {
      reject(
        new CompanionError(
          `The server closed the connection (${code}${reason.length > 0 ? `: ${reason.toString()}` : ''})`,
        ),
      )
      rejectAll(new CompanionError('The connection closed'))
    })
    socket.once('open', () => {
      socket.send(
        JSON.stringify({
          kind: 'hello',
          protocol: COMPANION_PROTOCOL_VERSION,
          role: 'agent',
          name,
          ...(token === undefined ? {} : { token }),
        }),
      )
    })

    socket.on('message', (data) => {
      let message: ReturnType<typeof ServerToAgentSchema.safeParse>
      try {
        message = ServerToAgentSchema.safeParse(JSON.parse(rawDataToString(data)))
      } catch {
        return
      }
      if (!message.success) return
      const body = message.data

      if (body.kind === 'welcome' || body.kind === 'status') {
        editorConnected = body.editorConnected
        editorListeners.forEach((listener) => {
          listener()
        })
        if (body.kind === 'welcome') {
          resolve({
            editorConnected: () => editorConnected,
            waitForEditor: (timeoutMs = 10_000) =>
              editorConnected
                ? Promise.resolve()
                : new Promise<void>((done, fail) => {
                    const timer = setTimeout(() => {
                      editorListeners = editorListeners.filter((l) => l !== check)
                      fail(
                        new CompanionError(
                          'No editor connected in time. Open RPG Studio and connect it to the companion server.',
                        ),
                      )
                    }, timeoutMs)
                    const check = (): void => {
                      if (!editorConnected) return
                      clearTimeout(timer)
                      editorListeners = editorListeners.filter((l) => l !== check)
                      done()
                    }
                    editorListeners = [...editorListeners, check]
                  }),
            query: (query) => {
              const checked = QuerySchema.parse(query)
              return request((id) => ({ kind: 'query', id, query: checked }))
            },
            dispatch: (action) => {
              const checked = ProjectActionSchema.parse(action)
              return request((id) => ({ kind: 'action', id, action: checked }))
            },
            batch: (actions) => {
              const checked = actions.map((action) => ProjectActionSchema.parse(action))
              return request((id) => ({ kind: 'batch', id, actions: checked }))
            },
            writeAsset: (path, bytes) => {
              const checked = AssetPathSchema.parse(path)
              return request((id) => ({
                kind: 'writeAsset',
                id,
                path: checked,
                data: bytesToBase64(bytes),
              }))
            },
            close: () => {
              socket.close()
            },
          })
        }
        return
      }
      const waiter = takeWaiter(body.id)
      if (!waiter) return
      if (body.ok) waiter.resolve(body.result)
      else waiter.reject(new CompanionError(body.error))
    })
  })
}
