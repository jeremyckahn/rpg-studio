export type EventListener<T> = (data: T) => void;

export class EventBus<Events extends Record<string, unknown> = Record<string, unknown>> {
  private readonly listeners: Map<keyof Events, Set<EventListener<unknown>>>;

  constructor() {
    this.listeners = new Map();
  }

  public on<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): () => void {
    const existing = this.listeners.get(event) ?? new Set();
    existing.add(listener as EventListener<unknown>);
    this.listeners.set(event, existing);

    return () => {
      this.off(event, listener);
    };
  }

  public once<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): () => void {
    const unsubscribe = this.on(event, (data) => {
      unsubscribe();
      listener(data);
    });
    return unsubscribe;
  }

  public off<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): void {
    const existing = this.listeners.get(event);
    if (!existing) {
      return;
    }
    existing.delete(listener as EventListener<unknown>);
    if (existing.size === 0) {
      this.listeners.delete(event);
    }
  }

  public emit<K extends keyof Events>(event: K, data: Events[K]): void {
    const existing = this.listeners.get(event);
    if (!existing) {
      return;
    }
    // Snapshot listeners before invoking in case an event handler unbinds during emit
    const snapshot = Array.from(existing);
    for (const listener of snapshot) {
      listener(data);
    }
  }

  public clear<K extends keyof Events>(event?: K): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  public listenerCount<K extends keyof Events>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
