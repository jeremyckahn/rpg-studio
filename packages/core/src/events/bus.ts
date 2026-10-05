export type Unsubscribe = () => void

export type EventHandler<TPayload> = (payload: TPayload) => void

/** Event types whose payload is `void` can be emitted without an argument. */
type EmitArgs<TPayload> = [TPayload] extends [void] ? [] : [payload: TPayload]

export interface EventBus<TMap extends object> {
  /** Subscribes to an event. The returned function removes the subscription. */
  on: <K extends keyof TMap>(type: K, handler: EventHandler<TMap[K]>) => Unsubscribe
  /** Subscribes for exactly one delivery. */
  once: <K extends keyof TMap>(type: K, handler: EventHandler<TMap[K]>) => Unsubscribe
  /** Removes the earliest subscription of `handler`. A no-op if there is none. */
  off: <K extends keyof TMap>(type: K, handler: EventHandler<TMap[K]>) => void
  /**
   * Delivers to every handler subscribed when `emit` was called. A throwing
   * handler never prevents delivery to the rest; failures are reported once all
   * handlers have run (see `EventBusOptions.onError`).
   */
  emit: <K extends keyof TMap>(type: K, ...args: EmitArgs<TMap[K]>) => void
  listenerCount: (type: keyof TMap) => number
  /** Removes every subscription. */
  clear: () => void
}

export interface EventBusOptions<TMap extends object> {
  /**
   * Receives handler errors. Without it, errors are rethrown from `emit` as an
   * `AggregateError` after all handlers have been invoked.
   */
  readonly onError?: (error: unknown, type: keyof TMap) => void
}

type AnyHandler = EventHandler<never>

/** Each subscription has its own identity, even when the handler is shared. */
interface Subscription {
  readonly handler: AnyHandler
}

/**
 * Creates a strongly typed pub/sub bus. Subscriptions are stored copy-on-write,
 * so subscribing or unsubscribing from inside a handler is always safe.
 */
export const createEventBus = <TMap extends object>(
  options: EventBusOptions<TMap> = {},
): EventBus<TMap> => {
  let registry: ReadonlyMap<keyof TMap, readonly Subscription[]> = new Map()

  const subscriptionsOf = (type: keyof TMap): readonly Subscription[] => registry.get(type) ?? []

  const setSubscriptions = (type: keyof TMap, subscriptions: readonly Subscription[]): void => {
    const others = [...registry].filter(([key]) => key !== type)
    registry = new Map(subscriptions.length === 0 ? others : [...others, [type, subscriptions]])
  }

  const remove = (type: keyof TMap, matches: (subscription: Subscription) => boolean): void => {
    const subscriptions = subscriptionsOf(type)
    const index = subscriptions.findIndex(matches)
    if (index !== -1) setSubscriptions(type, subscriptions.toSpliced(index, 1))
  }

  const on: EventBus<TMap>['on'] = (type, handler) => {
    const subscription: Subscription = { handler }
    setSubscriptions(type, [...subscriptionsOf(type), subscription])
    return () => {
      remove(type, (candidate) => candidate === subscription)
    }
  }

  const off: EventBus<TMap>['off'] = (type, handler) => {
    remove(type, (candidate) => candidate.handler === handler)
  }

  const once: EventBus<TMap>['once'] = (type, handler) => {
    const unsubscribe = on(type, (payload) => {
      unsubscribe()
      handler(payload)
    })
    return unsubscribe
  }

  const emit: EventBus<TMap>['emit'] = (type, ...args) => {
    const [payload] = args
    const failures = subscriptionsOf(type).flatMap(({ handler }) => {
      try {
        ;(handler as EventHandler<unknown>)(payload)
        return []
      } catch (error) {
        return [error]
      }
    })
    if (failures.length === 0) return
    if (options.onError) {
      failures.forEach((error) => options.onError?.(error, type))
      return
    }
    throw new AggregateError(
      failures,
      `Event "${String(type)}" had ${failures.length} failing handler(s)`,
    )
  }

  return {
    on,
    once,
    off,
    emit,
    listenerCount: (type) => subscriptionsOf(type).length,
    clear: () => {
      registry = new Map()
    },
  }
}
