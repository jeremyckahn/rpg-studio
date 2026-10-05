import { type EventCommand, EventCommandSchema, type Condition } from '../schemas/event.ts'
import { type Result, fail, ok } from '../result.ts'

/**
 * Compact runtime form of event commands: `[code, ...params]` tuples. The
 * semantic form (objects) is for authors; the compact form is what ships in a
 * built game. Both directions are lossless for valid commands.
 */
export type CompactCommand = readonly [code: number, ...params: unknown[]]

export const COMMAND_CODES = {
  ShowText: 101,
  ConditionalBranch: 111,
  SetSwitch: 121,
  SetVariable: 122,
  Wait: 230,
  PlayBGM: 241,
  PlayBGS: 245,
  PlayME: 249,
  PlaySE: 250,
  TransferPlayer: 201,
} as const satisfies Record<EventCommand['command'], number>

const COMPARATORS = ['==', '!=', '>', '>=', '<', '<='] as const

const compactCondition = (condition: Condition): unknown[] =>
  condition.type === 'switch'
    ? ['s', condition.switchId, condition.equals ? 1 : 0]
    : ['v', condition.variableId, COMPARATORS.indexOf(condition.comparator), condition.value]

const expandCondition = (compact: unknown): unknown => {
  if (!Array.isArray(compact)) return compact
  const [kind, id, a, b] = compact as unknown[]
  if (kind === 's') return { type: 'switch', switchId: id, equals: a === 1 }
  if (kind === 'v') {
    return { type: 'variable', variableId: id, comparator: COMPARATORS[a as number], value: b }
  }
  return compact
}

export const compileCommand = (command: EventCommand): CompactCommand => {
  const code = COMMAND_CODES[command.command]
  switch (command.command) {
    case 'ShowText':
      return [code, command.text, command.face ?? null]
    case 'TransferPlayer':
      return [code, command.mapId, command.x, command.y, command.direction ?? null]
    case 'SetSwitch':
      return [code, command.switchId, command.value ? 1 : 0]
    case 'SetVariable':
      return [code, command.variableId, command.operation, command.value]
    case 'PlaySE':
    case 'PlayBGM':
    case 'PlayBGS':
    case 'PlayME':
      return [code, command.name, command.volume, command.pitch]
    case 'Wait':
      return [code, command.frames]
    case 'ConditionalBranch':
      return [
        code,
        compactCondition(command.condition),
        compileCommands(command.then),
        compileCommands(command.else),
      ]
  }
}

export const compileCommands = (commands: readonly EventCommand[]): CompactCommand[] =>
  commands.map(compileCommand)

const nullToUndefined = (value: unknown): unknown => (value === null ? undefined : value)

const COMMAND_BY_CODE = new Map<number, EventCommand['command']>(
  Object.entries(COMMAND_CODES).map(([name, code]) => [code, name as EventCommand['command']]),
)

const expandCommand = (compact: unknown): unknown => {
  if (!Array.isArray(compact) || typeof compact[0] !== 'number') return compact
  const [code, ...p] = compact as [number, ...unknown[]]
  const command = COMMAND_BY_CODE.get(code)
  switch (command) {
    case 'ShowText':
      return { command, text: p[0], face: nullToUndefined(p[1]) }
    case 'TransferPlayer':
      return { command, mapId: p[0], x: p[1], y: p[2], direction: nullToUndefined(p[3]) }
    case 'SetSwitch':
      return { command, switchId: p[0], value: p[1] === 1 }
    case 'SetVariable':
      return { command, variableId: p[0], operation: p[1], value: p[2] }
    case 'PlaySE':
    case 'PlayBGM':
    case 'PlayBGS':
    case 'PlayME':
      return { command, name: p[0], volume: p[1], pitch: p[2] }
    case 'Wait':
      return { command, frames: p[0] }
    case 'ConditionalBranch':
      return {
        command,
        condition: expandCondition(p[0]),
        then: Array.isArray(p[1]) ? p[1].map(expandCommand) : p[1],
        else: Array.isArray(p[2]) ? p[2].map(expandCommand) : p[2],
      }
    case undefined:
      return compact
  }
}

/** Expands compact commands and validates the result against the schema. */
export const decompileCommands = (compact: unknown): Result<EventCommand[]> => {
  if (!Array.isArray(compact)) return fail('Compact commands must be an array')
  const parsed = EventCommandSchema.array().safeParse(compact.map(expandCommand))
  return parsed.success ? ok(parsed.data) : fail(parsed.error.message)
}
