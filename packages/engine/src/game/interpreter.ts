import { type Condition, type EventCommand } from '@rpgstudio/core'

import { type AudioCue, type Interpreter, type Runtime } from './types.ts'

const VARIABLE_LIMIT = 99_999_999

export const createInterpreter = (
  commands: readonly EventCommand[],
  sourceEventId: number | null,
): Interpreter => ({
  sourceEventId,
  stack: [{ commands, index: 0 }],
  waitTicks: 0,
  waitingForMessage: false,
})

export const conditionHolds = (state: Runtime['state'], condition: Condition): boolean => {
  if (condition.type === 'switch') {
    return (state.switches[condition.switchId] ?? false) === condition.equals
  }
  const value = state.variables[condition.variableId] ?? 0
  switch (condition.comparator) {
    case '==':
      return value === condition.value
    case '!=':
      return value !== condition.value
    case '>':
      return value > condition.value
    case '>=':
      return value >= condition.value
    case '<':
      return value < condition.value
    case '<=':
      return value <= condition.value
  }
}

export const setSwitch = (rt: Runtime, switchId: number, value: boolean): void => {
  if ((rt.state.switches[switchId] ?? false) === value) return
  rt.state.switches[switchId] = value
  rt.state.pagesDirty = true
  rt.bus.emit('switchChanged', { switchId, value })
}

export const setVariable = (rt: Runtime, variableId: number, value: number): void => {
  const clamped = Math.max(-VARIABLE_LIMIT, Math.min(VARIABLE_LIMIT, value))
  if ((rt.state.variables[variableId] ?? 0) === clamped) return
  rt.state.variables[variableId] = clamped
  rt.state.pagesDirty = true
  rt.bus.emit('variableChanged', { variableId, value: clamped })
}

const cueOf = ({ name, volume, pitch }: AudioCue): AudioCue => ({ name, volume, pitch })

const execute = (rt: Runtime, interpreter: Interpreter, command: EventCommand): void => {
  switch (command.command) {
    case 'ShowText': {
      const message = { face: command.face, text: command.text }
      rt.state.message = message
      interpreter.waitingForMessage = true
      rt.bus.emit('message', message)
      return
    }
    case 'Wait':
      interpreter.waitTicks = command.frames
      return
    case 'ConditionalBranch': {
      const branch = conditionHolds(rt.state, command.condition) ? command.then : command.else
      interpreter.stack.push({ commands: branch, index: 0 })
      return
    }
    case 'SetSwitch':
      setSwitch(rt, command.switchId, command.value)
      return
    case 'SetVariable': {
      const current = rt.state.variables[command.variableId] ?? 0
      const next =
        command.operation === 'set'
          ? command.value
          : command.operation === 'add'
            ? current + command.value
            : command.operation === 'subtract'
              ? current - command.value
              : current * command.value
      setVariable(rt, command.variableId, next)
      return
    }
    case 'TransferPlayer':
      rt.transferPlayer(command.mapId, command.x, command.y, command.direction)
      return
    case 'PlayBGM':
      rt.state.currentBgm = command.name
      rt.audio.play('bgm', cueOf(command))
      return
    case 'PlayBGS':
      rt.state.currentBgs = command.name
      rt.audio.play('bgs', cueOf(command))
      return
    case 'PlayME':
      rt.audio.play('me', cueOf(command))
      return
    case 'PlaySE':
      rt.audio.play('se', cueOf(command))
      return
  }
}

/**
 * Advances an interpreter by one tick. Returns true once it has run out of
 * commands. A message is dismissed by `confirm`, which this call consumes
 * (it returns the new confirm availability through `consumeConfirm`).
 */
export const stepInterpreter = (
  rt: Runtime,
  interpreter: Interpreter,
  confirm: boolean,
): { readonly finished: boolean; readonly confirmUsed: boolean } => {
  if (interpreter.waitingForMessage) {
    if (!confirm) return { finished: false, confirmUsed: false }
    interpreter.waitingForMessage = false
    rt.state.message = null
    rt.bus.emit('messageClosed')
    return { finished: false, confirmUsed: true }
  }
  if (interpreter.waitTicks > 0) {
    interpreter.waitTicks -= 1
    return { finished: false, confirmUsed: false }
  }

  while (!interpreter.waitingForMessage && interpreter.waitTicks === 0) {
    const frame = interpreter.stack.at(-1)
    if (!frame) return { finished: true, confirmUsed: false }
    const command = frame.commands[frame.index]
    if (command === undefined) {
      interpreter.stack.pop()
      continue
    }
    frame.index += 1
    execute(rt, interpreter, command)
  }
  return { finished: false, confirmUsed: false }
}
