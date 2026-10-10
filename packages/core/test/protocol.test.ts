import { describe, expect, it } from 'vitest'

import {
  AgentRequestSchema,
  AgentToServerSchema,
  EditorToServerSchema,
  HelloSchema,
  QuerySchema,
  ResultSchema,
  SCHEMA_NAMES,
  ServerToAgentSchema,
  ServerToEditorSchema,
  base64ToBytes,
  bytesToBase64,
  jsonSchemaFor,
  schemaByName,
} from '../src'

const hello = { kind: 'hello', protocol: 1, role: 'agent' }

describe('companion protocol', () => {
  it('accepts a hello from either role and rejects the wrong version or extra fields', () => {
    expect(HelloSchema.safeParse(hello).success).toBe(true)
    expect(
      HelloSchema.safeParse({ ...hello, role: 'editor', token: 's3cret', name: 'bot' }).success,
    ).toBe(true)
    expect(HelloSchema.safeParse({ ...hello, protocol: 2 }).success).toBe(false)
    expect(HelloSchema.safeParse({ ...hello, role: 'admin' }).success).toBe(false)
    expect(HelloSchema.safeParse({ ...hello, extra: 1 }).success).toBe(false)
  })

  it('accepts every query the architecture document describes', () => {
    const queries = [
      { type: 'GET_PROJECT_SUMMARY' },
      { type: 'GET_MAP_DATA', id: 1 },
      { type: 'GET_TABLE', table: 'actors' },
      { type: 'GET_RECORD', table: 'items', id: 2 },
      { type: 'GET_SCHEMA', name: 'actor' },
      { type: 'FIND_PATH', mapId: 1, from: { x: 0, y: 0 }, to: { x: 4, y: 4 } },
      { type: 'LIST_ASSETS' },
      { type: 'GET_PREVIEW_STATE' },
    ]
    queries.forEach((query) => {
      expect(QuerySchema.safeParse(query).success, query.type).toBe(true)
    })
  })

  it('rejects unknown queries and malformed arguments', () => {
    ;[
      { type: 'DROP_TABLE' },
      { type: 'GET_MAP_DATA' },
      { type: 'GET_MAP_DATA', id: 0 },
      { type: 'GET_TABLE', table: 'weapons' },
      { type: 'GET_SCHEMA', name: 'passwords' },
      { type: 'FIND_PATH', mapId: 1, from: { x: 0 }, to: { x: 1, y: 1 } },
      { type: 'LIST_ASSETS', extra: true },
      { type: 'GET_PREVIEW_STATE', extra: true },
    ].forEach((query) => {
      expect(QuerySchema.safeParse(query).success, JSON.stringify(query)).toBe(false)
    })
  })

  it('accepts the four request kinds and bounds their sizes', () => {
    const requests = [
      { kind: 'query', id: 'a', query: { type: 'LIST_ASSETS' } },
      { kind: 'action', id: 'b', action: { type: 'project/renameMap', payload: {} } },
      { kind: 'batch', id: 'c', actions: [{}, {}] },
      { kind: 'writeAsset', id: 'd', path: 'img/characters/new.png', data: 'AAAA' },
    ]
    requests.forEach((request) => {
      expect(AgentRequestSchema.safeParse(request).success, request.kind).toBe(true)
    })
    expect(AgentRequestSchema.safeParse({ kind: 'batch', id: 'c', actions: [] }).success).toBe(
      false,
    )
    expect(
      AgentRequestSchema.safeParse({
        kind: 'batch',
        id: 'c',
        actions: Array.from({ length: 1001 }, () => ({})),
      }).success,
    ).toBe(false)
    expect(
      AgentRequestSchema.safeParse({ kind: 'query', id: '', query: { type: 'LIST_ASSETS' } })
        .success,
    ).toBe(false)
    expect(
      AgentRequestSchema.safeParse({
        kind: 'query',
        id: 'x'.repeat(65),
        query: { type: 'LIST_ASSETS' },
      }).success,
    ).toBe(false)
  })

  it('refuses asset writes that escape the project or carry non-base64 data', () => {
    const write = (path: string, data: string) => ({ kind: 'writeAsset', id: 'a', path, data })
    expect(AgentRequestSchema.safeParse(write('../../etc/passwd', 'AAAA')).success).toBe(false)
    expect(AgentRequestSchema.safeParse(write('/abs.png', 'AAAA')).success).toBe(false)
    expect(AgentRequestSchema.safeParse(write('img/a.png', 'not base64!')).success).toBe(false)
    expect(AgentRequestSchema.safeParse(write('img/a.png', 'AAAA=')).success).toBe(true)
  })

  it('discriminates results by their outcome', () => {
    expect(
      ResultSchema.safeParse({ kind: 'result', id: 'a', ok: true, result: { n: [1, 2] } }).success,
    ).toBe(true)
    expect(
      ResultSchema.safeParse({ kind: 'result', id: 'a', ok: false, error: 'nope' }).success,
    ).toBe(true)
    expect(ResultSchema.safeParse({ kind: 'result', id: 'a', ok: true }).success).toBe(false)
    expect(ResultSchema.safeParse({ kind: 'result', id: 'a', ok: false, result: 1 }).success).toBe(
      false,
    )
    expect(
      ResultSchema.safeParse({ kind: 'result', id: 'a', ok: true, result: () => 1 }).success,
    ).toBe(false)
  })

  it('keeps each direction to the messages that direction may carry', () => {
    const query = { kind: 'query', id: 'a', query: { type: 'LIST_ASSETS' } }
    const result = { kind: 'result', id: 'a', ok: true, result: null }
    const status = { kind: 'status', editorConnected: true }
    const welcome = { kind: 'welcome', protocol: 1, role: 'agent', editorConnected: false }

    expect(AgentToServerSchema.safeParse(query).success).toBe(true)
    expect(AgentToServerSchema.safeParse(result).success).toBe(false) // an agent cannot forge editor answers
    expect(EditorToServerSchema.safeParse(result).success).toBe(true)
    expect(EditorToServerSchema.safeParse(query).success).toBe(false) // the editor cannot issue requests
    expect(ServerToAgentSchema.safeParse(status).success).toBe(true)
    expect(ServerToAgentSchema.safeParse(query).success).toBe(false)
    expect(ServerToEditorSchema.safeParse(query).success).toBe(true)
    expect(ServerToEditorSchema.safeParse(status).success).toBe(false)
    expect(ServerToEditorSchema.safeParse(welcome).success).toBe(true)
  })
})

describe('schema discovery', () => {
  it('produces JSON Schema for every model an agent may need', () => {
    SCHEMA_NAMES.forEach((name) => {
      const schema = jsonSchemaFor(name) as { $schema?: string }
      expect(schema.$schema, name).toMatch(/json-schema\.org/)
      expect(() => JSON.stringify(schema), name).not.toThrow()
    })
  })

  it('describes writer input: defaults are optional, unknown fields are rejected', () => {
    const actor = jsonSchemaFor('actor') as {
      required: string[]
      additionalProperties: boolean
      properties: Record<string, { minimum?: number }>
    }
    expect(actor.required.toSorted()).toEqual(['classId', 'id', 'name'])
    expect(actor.additionalProperties).toBe(false)
    expect(actor.properties['id']?.minimum).toBe(1)
  })

  it('handles the recursive event command schema', () => {
    const text = JSON.stringify(jsonSchemaFor('eventCommand'))
    expect(text).toContain('ConditionalBranch')
    expect(text).toMatch(/\$ref|\$defs/)
  })

  it('exposes the same Zod schemas used for validation', () => {
    expect(schemaByName('actor').safeParse({ id: 1, name: 'A', classId: 1 }).success).toBe(true)
    expect(schemaByName('actor').safeParse({ id: 1, name: 'A', classId: 1, hp: 9 }).success).toBe(
      false,
    )
  })
})

describe('base64 helpers', () => {
  it('round-trips arbitrary bytes, including large buffers', () => {
    const bytes = Uint8Array.from({ length: 200_000 }, (_, i) => (i * 31) % 256)
    expect([...base64ToBytes(bytesToBase64(bytes))]).toEqual([...bytes])
    expect(bytesToBase64(Uint8Array.of(104, 105))).toBe('aGk=')
    expect(base64ToBytes('')).toEqual(new Uint8Array(0))
  })
})
