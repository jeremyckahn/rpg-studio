import { PluginManifestSchema, type PluginCapability, type PluginManifest } from './manifest.js';
import {
  createSandboxedContext,
  type CapabilitiesProvider,
  type RPGStudioContext,
} from './context.js';

export interface RPGStudioPlugin {
  readonly manifest: PluginManifest;
  register?(context: RPGStudioContext): void | Promise<void>;
  initialize?(context: RPGStudioContext): void | Promise<void>;
  teardown?(): void | Promise<void>;
}

export interface RegisteredPluginEntry {
  readonly plugin: RPGStudioPlugin;
  readonly context: RPGStudioContext;
  readonly grantedCapabilities: ReadonlySet<PluginCapability>;
  readonly initialized: boolean;
}

export class PluginManager {
  private readonly plugins: ReadonlyMap<string, RegisteredPluginEntry>;
  private readonly defaultProvider: CapabilitiesProvider;

  constructor(defaultProvider: CapabilitiesProvider = {}, initialPlugins: ReadonlyMap<string, RegisteredPluginEntry> = new Map()) {
    this.defaultProvider = defaultProvider;
    this.plugins = initialPlugins;
  }

  public register(
    plugin: RPGStudioPlugin,
    grantedCapabilities?: readonly PluginCapability[],
    customProvider?: CapabilitiesProvider
  ): PluginManager {
    const parseResult = PluginManifestSchema.safeParse(plugin.manifest);
    if (!parseResult.success) {
      throw new Error(`Invalid plugin manifest for "${plugin.manifest.id ?? 'unknown'}": ${parseResult.error.message}`);
    }

    const manifest = parseResult.data;
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin with id "${manifest.id}" is already registered`);
    }

    // By default, grant what is requested in the manifest unless explicitly restricted
    const capabilitiesToGrant = new Set<PluginCapability>(
      grantedCapabilities ?? manifest.capabilities
    );

    // Verify all granted capabilities were declared in the manifest
    for (const cap of capabilitiesToGrant) {
      if (!manifest.capabilities.includes(cap)) {
        throw new Error(`Cannot grant capability "${cap}" not declared in manifest for plugin "${manifest.id}"`);
      }
    }

    const provider = customProvider ?? this.defaultProvider;
    const context = createSandboxedContext(manifest.id, capabilitiesToGrant, provider);

    if (plugin.register) {
      plugin.register(context);
    }

    const newMap = new Map(this.plugins);
    newMap.set(manifest.id, {
      plugin,
      context,
      grantedCapabilities: capabilitiesToGrant,
      initialized: false,
    });

    return new PluginManager(this.defaultProvider, newMap);
  }

  public async initialize(pluginId?: string): Promise<PluginManager> {
    if (pluginId) {
      const entry = this.plugins.get(pluginId);
      if (!entry) {
        throw new Error(`Cannot initialize unregistered plugin: "${pluginId}"`);
      }
      if (entry.initialized) {
        return this;
      }
      if (entry.plugin.initialize) {
        await entry.plugin.initialize(entry.context);
      }
      const newMap = new Map(this.plugins);
      newMap.set(pluginId, { ...entry, initialized: true });
      return new PluginManager(this.defaultProvider, newMap);
    }

    // Initialize all uninitialized plugins in order
    const pluginEntries = Array.from(this.plugins.entries());
    for (const [, entry] of pluginEntries) {
      if (!entry.initialized && entry.plugin.initialize) {
        await entry.plugin.initialize(entry.context);
      }
    }
    const updatedEntries = pluginEntries.map(([id, entry]) => [
      id,
      { ...entry, initialized: true },
    ] as const);
    return new PluginManager(this.defaultProvider, new Map(updatedEntries));
  }

  public async teardown(pluginId?: string): Promise<PluginManager> {
    if (pluginId) {
      const entry = this.plugins.get(pluginId);
      if (!entry) {
        return this;
      }
      if (entry.plugin.teardown) {
        await entry.plugin.teardown();
      }
      const newMap = new Map(this.plugins);
      newMap.delete(pluginId);
      return new PluginManager(this.defaultProvider, newMap);
    }

    // Teardown all registered plugins in reverse registration order
    const entries = Array.from(this.plugins.values()).reverse();
    for (const entry of entries) {
      if (entry.plugin.teardown) {
        await entry.plugin.teardown();
      }
    }
    return new PluginManager(this.defaultProvider, new Map());
  }

  public getPlugin(id: string): RPGStudioPlugin | undefined {
    return this.plugins.get(id)?.plugin;
  }

  public getContext(id: string): RPGStudioContext | undefined {
    return this.plugins.get(id)?.context;
  }

  public isRegistered(id: string): boolean {
    return this.plugins.has(id);
  }

  public isInitialized(id: string): boolean {
    return this.plugins.get(id)?.initialized ?? false;
  }

  public getAllPlugins(): readonly RPGStudioPlugin[] {
    return Array.from(this.plugins.values()).map((e) => e.plugin);
  }
}
