import { describe, expect, it, vi } from 'vitest';
import {
  PluginManager,
  SecurityCapabilityError,
  type CapabilitiesProvider,
  type RPGStudioPlugin,
} from '../src/index.js';

describe('Plugin Manager & Capability Sandboxing', () => {
  const createMockStorage = () => {
    const store = new Map<string, string>();
    return {
      getItem: vi.fn(async (key: string) => store.get(key) ?? null),
      setItem: vi.fn(async (key: string, val: string) => {
        store.set(key, val);
      }),
      removeItem: vi.fn(async (key: string) => {
        store.delete(key);
      }),
    };
  };

  const createMockProvider = (): CapabilitiesProvider => {
    const storage = createMockStorage();
    const listeners = new Map<string, Set<(p: unknown) => void>>();
    const panels: { id: string; title: string }[] = [];
    const systems: { name: string; priority: number }[] = [];

    return {
      storage,
      events: {
        emit: (name: string, payload: unknown) => {
          listeners.get(name)?.forEach((fn) => fn(payload));
        },
        on: <T = unknown>(name: string, handler: (payload: T) => void) => {
          const set = listeners.get(name) ?? new Set();
          set.add(handler as (p: unknown) => void);
          listeners.set(name, set);
          return () => {
            set.delete(handler as (p: unknown) => void);
          };
        },
      },
      ui: {
        registerPanel: (id: string, title: string) => {
          panels.push({ id, title });
        },
        getRegisteredPanels: () => Object.freeze([...panels]),
      },
      engine: {
        registerSystem: (name: string, priority: number) => {
          systems.push({ name, priority });
        },
        getRegisteredSystems: () => Object.freeze([...systems]),
      },
    };
  };

  it('registers and executes plugin lifecycle hooks', async () => {
    const provider = createMockProvider();
    const manager = new PluginManager(provider);

    const registerSpy = vi.fn();
    const initSpy = vi.fn();
    const teardownSpy = vi.fn();

    const samplePlugin: RPGStudioPlugin = {
      manifest: {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        capabilities: ['storage:read', 'storage:write'],
        entryPoints: { shared: 'shared.ts' },
        description: 'Test',
        author: 'Tester',
        dependencies: {},
      },
      register: registerSpy,
      initialize: initSpy,
      teardown: teardownSpy,
    };

    const registeredManager = manager.register(samplePlugin);
    expect(registerSpy).toHaveBeenCalledOnce();
    expect(registeredManager.isRegistered('test-plugin')).toBe(true);
    expect(registeredManager.isInitialized('test-plugin')).toBe(false);

    const initializedManager = await registeredManager.initialize('test-plugin');
    expect(initSpy).toHaveBeenCalledOnce();
    expect(initializedManager.isInitialized('test-plugin')).toBe(true);

    const tornDownManager = await initializedManager.teardown('test-plugin');
    expect(teardownSpy).toHaveBeenCalledOnce();
    expect(tornDownManager.isRegistered('test-plugin')).toBe(false);
  });

  it('strictly enforces capability sandbox when unauthorized access is attempted', async () => {
    const provider = createMockProvider();
    const manager = new PluginManager(provider);

    const restrictedPlugin: RPGStudioPlugin = {
      manifest: {
        id: 'restricted-plugin',
        name: 'Restricted Plugin',
        version: '1.0.0',
        capabilities: ['storage:read'], // No storage:write, no events, no UI
        entryPoints: {},
        description: '',
        author: '',
        dependencies: {},
      },
    };

    const registeredManager = manager.register(restrictedPlugin);
    const context = registeredManager.getContext('restricted-plugin');
    expect(context).toBeDefined();

    if (context) {
      // storage:read is authorized
      expect(context.hasCapability('storage:read')).toBe(true);
      await expect(context.getStorage().getItem('test-key')).resolves.toBe(null);

      // storage:write is forbidden
      await expect(context.getStorage().setItem('test-key', 'value')).rejects.toThrow(
        SecurityCapabilityError
      );

      // ui:panel is forbidden
      expect(() => context.getUI()).toThrow(SecurityCapabilityError);

      // engine:system is forbidden
      expect(() => context.getEngine()).toThrow(SecurityCapabilityError);

      // events:emit is forbidden
      expect(() => context.getEvents().emit('test', {})).toThrow(SecurityCapabilityError);
    }
  });

  it('namespaces storage keys per plugin id', async () => {
    const provider = createMockProvider();
    const manager = new PluginManager(provider);

    const storagePlugin: RPGStudioPlugin = {
      manifest: {
        id: 'quest-journal',
        name: 'Quest Journal',
        version: '1.0.0',
        capabilities: ['storage:read', 'storage:write'],
        entryPoints: {},
        description: '',
        author: '',
        dependencies: {},
      },
    };

    const registered = manager.register(storagePlugin);
    const context = registered.getContext('quest-journal');
    expect(context).toBeDefined();

    if (context) {
      await context.getStorage().setItem('active-quest', '12');
      expect(provider.storage?.setItem).toHaveBeenCalledWith(
        'quest-journal:active-quest',
        '12'
      );
    }
  });

  it('rejects invalid plugin manifests', () => {
    const manager = new PluginManager();
    const invalidPlugin = {
      manifest: {
        id: 'INVALID ID WITH SPACES',
        name: '',
        version: 'not-a-semver',
      },
    } as unknown as RPGStudioPlugin;

    expect(() => manager.register(invalidPlugin)).toThrow();
  });
});
