# AGENTS.md: `@rpgstudio/core`

The shared foundation: data schemas, the plugin system, the typed event bus, grid math and
codecs. Read the [root AGENTS.md](../../AGENTS.md) first. Related docs:
[data-model](../../docs/data-model.md), [plugins](../../docs/plugins.md),
[companion-protocol](../../docs/companion-protocol.md).

## Hard rules for this package

- **No DOM, no UI, no rendering, no imports from other `@rpgstudio/*` packages.** It runs in browsers, Node and
  workers. Use `globalThis`-safe APIs only (`btoa`/`atob`, `TextEncoder`, `URL`/`Blob` guarded). `import()` of
  Blob URLs is in `plugins/loader.ts` with a data-URL fallback; keep that fallback.
- **Every data model is a `z.strictObject`** with `z.infer`-derived types. Cross-field rules go through
  `issuesCheck`. Do not hand-write types for schema data.
- **Everything here is pure or explicitly scoped.** Mutation is allowed only in `math/pathfinding.ts` and
  `pixel/png.ts` (file-level disables with reasons).
- Public API = what `src/index.ts` re-exports. Add new modules to the nearest `index.ts`.

## Map

```
src/index.ts            barrel; also base64.ts (bytesToBase64/base64ToBytes), json.ts (JsonValue), result.ts (Result, ok, fail)
src/schemas/
  common.ts             Id, Name, Direction, Point, AssetPath (traversal-proof), HexColor, Extensions, hasUniqueIds
  actor.ts              Stats, StatGrowth, SpriteSheetRef, Class, Actor
  item.ts               Effect, Target, Element, Item, Skill, Enemy
  components.ts         ECS component schemas (Position, Movement, SpriteData, Collision, EventTrigger)
  event.ts              Condition, EventCommand (leaf + recursive ConditionalBranch), EventPage, MapEvent
  tilemap.ts            CollisionFlags, tile sizes, layers, Tilemap + validateTilemap
  save.ts               SaveState (version 1)
  project.ts            ProjectMeta, Database, Project + validateProject (all reference checks), PluginId
  actions.ts            the 16 project action payload schemas + ProjectActionSchema
  protocol.ts           companion wire protocol, SCHEMA_NAMES, jsonSchemaFor
  refine.ts             issuesCheck / ValidationIssue
src/events/             bus.ts (typed pub/sub), compact.ts (semantic ⇄ [code, …params]), types.ts (CoreEventMap), walk.ts (flattenCommands)
src/math/               grid.ts (tile/world, rects, directions), collision.ts (canStep), pathfinding.ts (A*), rng.ts (mulberry32)
src/plugins/            manifest.ts, context.ts (capability keys, context type), capabilities.ts (core host: events, schemas, log),
                        errors.ts, manager.ts (lifecycle), loader.ts (Blob/data-URL import, two-headed load)
src/pixel/              matrix.ts (PixelMatrix → RGBA, sheets), png.ts (encode/decode), piskel.ts (.piskel codec), defaultTileset.ts
src/project/            files.ts (projectToFiles/filesToProject), template.ts (starter project/map), bundle.ts (game.json)
test/                   one file per area; fixtures.ts, helpers.ts (recorder)
```

## Invariants worth knowing

- `ProjectSchema` validates references; `TransferPlayer` targets are checked through `flattenCommands`.
- `filesToProject` validates each file separately so errors name the file, then validates the whole.
- `EventCommandSchema` is annotated `z.ZodType<EventCommand>` with an explicit `ConditionalBranchCommand`
  (declaration-emit workaround, [ADR-004](../../docs/decisions.md#adr-004-one-explicit-recursive-type-for-event-commands)).
  Run `pnpm build`, not just `typecheck`, after editing exported schema types.
- `createPluginManager` is generic in the host's capability map; the context is a frozen null-prototype object whose
  undeclared capability getters throw `CapabilityDeniedError`. `loadPluginPackage` never reads the other target's entry.
- `EventBus` stores subscriptions copy-on-write, so (un)subscribing inside a handler is safe; a throwing handler never
  stops delivery (errors are aggregated or sent to `onError`).
- `findPath` is deterministic (ties broken by cell index) and returns inclusive endpoints.
- `jsonSchemaFor` produces _input-side_ JSON Schema (defaults optional) so agents know what to write.

## Testing

`pnpm --filter @rpgstudio/core test`. Schemas: table-driven accept/reject including hallucinated fields and
out-of-range values. When adding an action, update `test/actions.test.ts` (it asserts every type and the count).
Plugin tests build hosts with `createCoreHost` + `createCoreCapabilityProviders`. Use `recorder()` from `test/helpers.ts`
instead of pushing to arrays.

## Extending

[Add a field](../../docs/extending.md#add-a-field-to-a-record-or-map) ·
[table](../../docs/extending.md#add-a-database-table) ·
[event command](../../docs/extending.md#add-an-event-command) ·
[project action](../../docs/extending.md#add-a-project-action) ·
[capability](../../docs/plugins.md#7-adding-a-new-capability)

## Pitfalls

- Changing a schema default changes validated output everywhere (action payload types are _output_ types).
- `AssetPathSchema` is the traversal defence; never relax it, never bypass it for paths that reach a filesystem or zip.
- `z.json()` accepts only JSON-serialisable values; do not widen `JsonValue` to include `undefined`.
- `Result` errors are shown to AI agents; keep messages specific and actionable.
