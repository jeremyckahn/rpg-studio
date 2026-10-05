import { describe, expect, it, vi } from 'vitest'

import {
  type EventCommand,
  EventCommandSchema,
  compileCommand,
  compileCommands,
  createEventBus,
  decompileCommands,
  flattenCommands,
} from '../src'

interface TestEvents {
  ping: { readonly n: number }
  ready: void
}

describe('EventBus', () => {
  it('delivers typed payloads to subscribers in subscription order', () => {
    const bus = createEventBus<TestEvents>()
    const calls = vi.fn()
    bus.on('ping', ({ n }) => void calls(`a${n}`))
    bus.on('ping', ({ n }) => void calls(`b${n}`))
    bus.emit('ping', { n: 1 })
    expect(calls.mock.calls).toEqual([['a1'], ['b1']])
  })

  it('supports payload-less events', () => {
    const bus = createEventBus<TestEvents>()
    const handler = vi.fn()
    bus.on('ready', handler)
    bus.emit('ready')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes via the returned function and via off', () => {
    const bus = createEventBus<TestEvents>()
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribe = bus.on('ping', first)
    bus.on('ping', second)
    unsubscribe()
    bus.emit('ping', { n: 1 })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(bus.listenerCount('ping')).toBe(1)
  })

  it('off() removes a subscription by its original handler reference', () => {
    const bus = createEventBus<TestEvents>()
    const handler = vi.fn()
    bus.on('ping', handler)
    bus.off('ping', handler)
    bus.off('ping', handler) // already gone: a no-op
    bus.emit('ping', { n: 1 })
    expect(handler).not.toHaveBeenCalled()
    expect(bus.listenerCount('ping')).toBe(0)
  })

  it('removes exactly one subscription when a handler is subscribed twice', () => {
    const bus = createEventBus<TestEvents>()
    const handler = vi.fn()
    const unsubscribeFirst = bus.on('ping', handler)
    bus.on('ping', handler)
    unsubscribeFirst()
    bus.emit('ping', { n: 1 })
    expect(handler).toHaveBeenCalledTimes(1)
    unsubscribeFirst() // idempotent
    expect(bus.listenerCount('ping')).toBe(1)
  })

  it('delivers once() exactly one time', () => {
    const bus = createEventBus<TestEvents>()
    const handler = vi.fn()
    bus.once('ping', handler)
    bus.emit('ping', { n: 1 })
    bus.emit('ping', { n: 2 })
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith({ n: 1 })
    expect(bus.listenerCount('ping')).toBe(0)
  })

  it('is safe to subscribe and unsubscribe while emitting', () => {
    const bus = createEventBus<TestEvents>()
    const late = vi.fn()
    const second = vi.fn()
    let unsubscribeSecond = (): void => undefined
    bus.on('ping', () => {
      unsubscribeSecond()
      bus.on('ping', late)
    })
    unsubscribeSecond = bus.on('ping', second)
    bus.emit('ping', { n: 1 })
    // The snapshot taken at emit time still includes `second`; `late` joins next round.
    expect(second).toHaveBeenCalledTimes(1)
    expect(late).not.toHaveBeenCalled()
    bus.emit('ping', { n: 2 })
    expect(second).toHaveBeenCalledTimes(1)
    expect(late).toHaveBeenCalledTimes(1)
  })

  it('keeps delivering when a handler throws, then reports every failure', () => {
    const bus = createEventBus<TestEvents>()
    const survivor = vi.fn()
    bus.on('ping', () => {
      throw new Error('boom')
    })
    bus.on('ping', survivor)
    expect(() => bus.emit('ping', { n: 1 })).toThrow(AggregateError)
    expect(survivor).toHaveBeenCalledOnce()
  })

  it('routes handler errors to onError when provided', () => {
    const onError = vi.fn()
    const bus = createEventBus<TestEvents>({ onError })
    bus.on('ping', () => {
      throw new Error('boom')
    })
    expect(() => bus.emit('ping', { n: 1 })).not.toThrow()
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'ping')
  })

  it('clear() removes every subscription', () => {
    const bus = createEventBus<TestEvents>()
    const handler = vi.fn()
    bus.on('ping', handler)
    bus.on('ready', handler)
    bus.clear()
    bus.emit('ping', { n: 1 })
    bus.emit('ready')
    expect(handler).not.toHaveBeenCalled()
  })

  it('keeps event types independent', () => {
    const bus = createEventBus<TestEvents>()
    const ping = vi.fn()
    bus.on('ping', ping)
    bus.emit('ready')
    expect(ping).not.toHaveBeenCalled()
  })
})

describe('compact event commands', () => {
  const commands: EventCommand[] = EventCommandSchema.array().parse([
    { command: 'ShowText', face: 'Actor1', text: 'Hello, world!' },
    { command: 'ShowText', text: 'No face' },
    { command: 'TransferPlayer', mapId: 2, x: 4, y: 5, direction: 'left' },
    { command: 'TransferPlayer', mapId: 2, x: 0, y: 0 },
    { command: 'SetSwitch', switchId: 3, value: true },
    { command: 'SetSwitch', switchId: 3, value: false },
    { command: 'SetVariable', variableId: 1, operation: 'add', value: -2 },
    { command: 'PlaySE', name: 'coin', volume: 50, pitch: 120 },
    { command: 'PlayBGM', name: 'town' },
    { command: 'PlayBGS', name: 'rain' },
    { command: 'PlayME', name: 'fanfare' },
    { command: 'Wait', frames: 45 },
    {
      command: 'ConditionalBranch',
      condition: { type: 'variable', variableId: 1, comparator: '<=', value: 3 },
      then: [{ command: 'ShowText', text: 'small' }],
      else: [
        {
          command: 'ConditionalBranch',
          condition: { type: 'switch', switchId: 9, equals: false },
          then: [{ command: 'Wait', frames: 1 }],
        },
      ],
    },
  ])

  it('encodes to numeric-coded tuples', () => {
    expect(compileCommand({ command: 'Wait', frames: 45 })).toEqual([230, 45])
    expect(compileCommand({ command: 'SetSwitch', switchId: 3, value: true })).toEqual([121, 3, 1])
  })

  it('round-trips every command losslessly through JSON', () => {
    const compact: unknown = JSON.parse(JSON.stringify(compileCommands(commands)))
    const result = decompileCommands(compact)
    expect(result).toEqual({ success: true, data: commands })
  })

  it('rejects malformed compact input instead of guessing', () => {
    expect(decompileCommands('nope').success).toBe(false)
    expect(decompileCommands([[9999, 'x']]).success).toBe(false)
    expect(decompileCommands([[230, 'forty']]).success).toBe(false)
    expect(decompileCommands([[230, 0]]).success).toBe(false)
    expect(decompileCommands([[111, ['s', 1, 1], [[9999]], []]]).success).toBe(false)
    expect(decompileCommands(['ShowText']).success).toBe(false)
  })
})

describe('flattenCommands', () => {
  it('lists commands depth first, including both branch arms', () => {
    const commands = EventCommandSchema.array().parse([
      { command: 'Wait', frames: 1 },
      {
        command: 'ConditionalBranch',
        condition: { type: 'switch', switchId: 1 },
        then: [{ command: 'PlaySE', name: 'a' }],
        else: [{ command: 'PlaySE', name: 'b' }],
      },
      { command: 'Wait', frames: 2 },
    ])
    expect(flattenCommands(commands).map((c) => c.command)).toEqual([
      'Wait',
      'ConditionalBranch',
      'PlaySE',
      'PlaySE',
      'Wait',
    ])
  })
})
