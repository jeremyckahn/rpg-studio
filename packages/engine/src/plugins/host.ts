import {
  type CapabilityProviders,
  type CoreCapabilities,
  type LogSink,
  type PluginManager,
  createCoreCapabilityProviders,
  createCoreHost,
  createPluginManager,
} from '@rpgstudio/core'

import { type Game } from '../game/game.ts'
import { type AudioPort, type GameSystem } from '../game/types.ts'
import { type Entity } from '../ecs/entity.ts'
import { type World } from 'miniplex'
import { type GameState } from '../game/types.ts'

/** What an engine-side plugin can do beyond the core capabilities. */
export interface EngineCapabilities extends CoreCapabilities {
  ecs: {
    readonly world: World<Entity>
    readonly state: Readonly<GameState>
    /** Adds a per-tick system; removed automatically when the plugin is torn down. */
    addSystem: (system: GameSystem) => () => void
  }
  audio: AudioPort
}

export interface EnginePluginHostOptions {
  readonly audio: AudioPort
  readonly logSink?: LogSink
}

/**
 * The engine-side plugin manager. Only `shared` and `engine` entries are ever
 * loaded into it (see `loadPluginPackage(files, 'engine')`), so editor UI code
 * cannot reach the exported game.
 */
export const createEnginePluginManager = (
  game: Game,
  options: EnginePluginHostOptions,
): PluginManager<EngineCapabilities> => {
  const host = createCoreHost(options.logSink)
  const providers: CapabilityProviders<EngineCapabilities> = {
    ...createCoreCapabilityProviders(host),
    ecs: (scope) => ({
      world: game.world,
      state: game.state,
      addSystem: (system) => {
        const remove = game.addSystem(system)
        scope.onDispose(remove)
        return remove
      },
    }),
    audio: () => options.audio,
  }
  return createPluginManager<EngineCapabilities>({ target: 'engine', host, providers })
}
