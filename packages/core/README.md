# @rpgstudio/core

The shared foundation of RPG Studio. It contains no rendering or UI code and
runs unchanged in browsers, Node and Web Workers.

Rules, file map and pitfalls: [AGENTS.md](AGENTS.md). Data model: [docs/data-model.md](../../docs/data-model.md).

| Area      | Entry points                                                                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schemas   | `ActorSchema`, `ClassSchema`, `ItemSchema`, `SkillSchema`, `EnemySchema`, `TilemapSchema`, `EventCommandSchema`, `EventPageSchema`, `SaveStateSchema`, `ProjectSchema` |
| Plugins   | `createPluginManager`, `loadPluginPackage`, `PluginManifestSchema`, `RPGStudioContext`                                                                                 |
| Events    | `createEventBus`, `compileCommands` / `decompileCommands`                                                                                                              |
| Math      | `tileToWorld`, `worldToTile`, `findPath` (A\*), `canStep`, `createRng`                                                                                                 |
| Pixel art | `PixelMatrixSchema`, `encodePng`, `decodePng`, `matricesToPng`, `matricesToPiskel`                                                                                     |
| Project   | `createStarterProject`, `projectToFiles`, `filesToProject`                                                                                                             |

## Schemas

Every model is a `z.strictObject`, so unknown fields are rejected rather than
stripped. This is what catches fields a model hallucinated. Types come from
`z.infer`; there are no hand-written interfaces for data.

Cross-field rules (layer sizes, unique ids, dangling references) are pure
functions returning a list of problems, wired in with `issuesCheck`.

## Plugins

A plugin's manifest declares its capabilities. `createPluginManager` hands each
plugin a frozen context in which every undeclared capability throws
`CapabilityDeniedError`:

```ts
const host = createCoreHost()
const manager = createPluginManager({
  target: 'editor',
  host,
  providers: createCoreCapabilityProviders(host),
})
manager.register(await loadPluginPackage(files, 'editor'))
await manager.initialize()
```

Hosts add their own capabilities (`store`, `ui`, `ecs`, ...) by supplying more
providers. `loadPluginPackage(files, target)` reads only `shared` and that
target's entry, so editor code never reaches an exported game. Plugin modules are
imported from Blob URLs and cannot import `zod`; the schemas capability exposes
the host's `z` instead.

## Testing

```sh
pnpm --filter @rpgstudio/core test
```
