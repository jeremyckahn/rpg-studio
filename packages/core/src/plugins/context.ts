import type { PluginCapability } from './manifest.js';

export class SecurityCapabilityError extends Error {
  constructor(public readonly missingCapability: PluginCapability, message?: string) {
    super(message ?? `Plugin security violation: missing required capability "${missingCapability}"`);
    this.name = 'SecurityCapabilityError';
  }
}

export interface StorageCapability {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface EventCapability {
  emit<T = unknown>(eventName: string, payload: T): void;
  on<T = unknown>(eventName: string, handler: (payload: T) => void): () => void;
}

export interface UIExtensionCapability {
  registerPanel(panelId: string, title: string): void;
  getRegisteredPanels(): readonly { readonly id: string; readonly title: string }[];
}

export interface EngineExtensionCapability {
  registerSystem(name: string, priority: number): void;
  getRegisteredSystems(): readonly { readonly name: string; readonly priority: number }[];
}

export interface RPGStudioContext {
  readonly pluginId: string;
  hasCapability(capability: PluginCapability): boolean;
  getStorage(): StorageCapability;
  getEvents(): EventCapability;
  getUI(): UIExtensionCapability;
  getEngine(): EngineExtensionCapability;
}

export interface CapabilitiesProvider {
  readonly storage?: StorageCapability;
  readonly events?: EventCapability;
  readonly ui?: UIExtensionCapability;
  readonly engine?: EngineExtensionCapability;
}

export const createSandboxedContext = (
  pluginId: string,
  authorizedCapabilities: ReadonlySet<PluginCapability>,
  provider: CapabilitiesProvider
): RPGStudioContext => {
  const hasCapability = (cap: PluginCapability): boolean => authorizedCapabilities.has(cap);

  const assertCapability = (cap: PluginCapability): void => {
    if (!hasCapability(cap)) {
      throw new SecurityCapabilityError(cap);
    }
  };

  const getStorage = (): StorageCapability => {
    assertCapability('storage:read');
    const storage = provider.storage;
    if (!storage) {
      throw new Error(`Storage provider not available in host environment`);
    }
    return {
      getItem: async (key: string) => {
        assertCapability('storage:read');
        return storage.getItem(`${pluginId}:${key}`);
      },
      setItem: async (key: string, value: string) => {
        assertCapability('storage:write');
        return storage.setItem(`${pluginId}:${key}`, value);
      },
      removeItem: async (key: string) => {
        assertCapability('storage:write');
        return storage.removeItem(`${pluginId}:${key}`);
      },
    };
  };

  const getEvents = (): EventCapability => {
    const events = provider.events;
    if (!events) {
      throw new Error(`Events provider not available in host environment`);
    }
    return {
      emit: <T = unknown>(eventName: string, payload: T) => {
        assertCapability('events:emit');
        events.emit(eventName, payload);
      },
      on: <T = unknown>(eventName: string, handler: (payload: T) => void) => {
        assertCapability('events:listen');
        return events.on(eventName, handler);
      },
    };
  };

  const getUI = (): UIExtensionCapability => {
    assertCapability('ui:panel');
    const ui = provider.ui;
    if (!ui) {
      throw new Error(`UI provider not available in host environment`);
    }
    return ui;
  };

  const getEngine = (): EngineExtensionCapability => {
    assertCapability('engine:system');
    const engine = provider.engine;
    if (!engine) {
      throw new Error(`Engine provider not available in host environment`);
    }
    return engine;
  };

  return Object.freeze({
    pluginId,
    hasCapability,
    getStorage,
    getEvents,
    getUI,
    getEngine,
  });
};
