# Plugins

RPG Studio is plugin-first: the map editor, database editor and sprite editor are
themselves plugins. This guide is the contract for writing and loading one. The
implementation is `packages/core/src/plugins/` (manager, context, loader, manifest) plus
two hosts: `packages/editor/src/plugins/editorHost.ts` and
`packages/engine/src/plugins/host.ts`. Rationale: [decisions.md ADR-014 / ADR-015](decisions.md#adr-014-capability-sandboxed-two-headed-plugins).

## Status: what works and what is not wired up yet

| Capability                                                                                             | State                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manager lifecycle, dependency ordering, rollback, capability sandbox                                   | Implemented, heavily tested (core)                                                                                                                                                                                                                                                                                                                                                                                    |
| Loading a plugin directory from source text (`loadPluginPackage`)                                      | Implemented, tested                                                                                                                                                                                                                                                                                                                                                                                                   |
| Editor registering **first-party** plugins                                                             | Implemented (`corePlugins.ts`)                                                                                                                                                                                                                                                                                                                                                                                        |
| Engine player loading a project's plugins (`shared` + `engine` heads) and exported games shipping them | Implemented, tested                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Editor auto-loading `plugins/<id>/` when a project is opened**                                       | **Not implemented.** The editor host can run any plugin you hand it, but nothing reads a project's `plugins/` folder into the editor yet. Wiring it means: after `openFileSystem`/`openArchive`, for each id in `meta.plugins`, collect `plugins/<id>/*` text files from the AssetStore, call `loadPluginPackage(files, 'editor')`, `manager.register(...)`, `manager.initialize()`; and tear down on project change. |
| The `render` capability                                                                                | Reserved name in the manifest enum; **no host provides it**, so a plugin declaring it is rejected at registration                                                                                                                                                                                                                                                                                                     |
| Installing plugins from a UI / registry                                                                | Not implemented                                                                                                                                                                                                                                                                                                                                                                                                       |

## 1. Anatomy

```
plugins/acme.quest-log/
  manifest.json   metadata, capabilities, dependencies, declared schemas, entry paths
  shared.js       loaded by BOTH targets: schemas and pure logic
  editor.js       loaded ONLY by the editor: panels, slices, inspectors
  engine.js       loaded ONLY by the exported game / player: systems, behaviours
```

Plugins are shipped as **compiled ES modules** (`.js`). Author them in TypeScript and compile
to one self-contained file per entry (no bare imports, see §4). The architecture document
shows `.ts`; that is the source you write, not what the loader reads.

`project.json` lists enabled plugin ids in `meta.plugins`. The export ships a plugin only if
it is listed there.

### `manifest.json`

Validated by `PluginManifestSchema` (strict):

```json
{
  "id": "acme.quest-log",
  "name": "Quest Log",
  "version": "1.2.0",
  "description": "Tracks quests.",
  "capabilities": ["events", "schemas", "store", "ui"],
  "dependencies": ["acme.core"],
  "schemas": ["Quest"],
  "entries": { "shared": "shared.js", "editor": "editor.js", "engine": "engine.js" }
}
```

- `id`: lowercase, dot-separated, dashes allowed (`PluginIdSchema`).
- `version`: semver (`1.2.3`, optional pre-release).
- `capabilities`: what the plugin may touch (§3). No duplicates.
- `dependencies`: plugin ids initialised first. No self-dependency, no cycles.
- `schemas`: the only names this plugin may register through `ctx.schemas.register`.
- `entries`: at least one of `shared` / `editor` / `engine`; paths are `AssetPath`s relative to the plugin folder.

## 2. Lifecycle

`createPluginManager({ target, host, providers })` (target is `'editor'` or `'engine'`):

1. **`register({ manifest, module?, shared? })`**: validates the manifest with Zod (a bad one
   throws `PluginRegistrationError` with Zod's message); rejects duplicate ids; rejects
   capabilities the host does not provide; calls `module.onRegister(frozenManifest)`; emits
   `plugin:registered`. Nothing runs yet.
2. **`initialize()`**: orders _registered_ plugins dependencies-first (registration order
   breaks ties; a missing dependency or cycle throws `PluginDependencyError` **before anything
   starts**), then for each calls `module.initialize(ctx, shared)` in order. If one throws, the
   plugins this call already initialised are torn down in reverse, the failed one is marked
   `failed`, and `PluginInitializationError` (with `cause`) is thrown.
3. **`teardown()`**: reverse order; calls `module.teardown()` then runs the plugin's registered
   disposers **last-in-first-out**; keeps going on errors and throws an `AggregateError` at the
   end. Plugins return to `registered`, so `initialize()` can run again.
4. `unregister(id)` refuses while initialised.

`PluginModule` (an entry's default export): `{ onRegister?, initialize?, teardown? }`, all
optional functions (method syntax, so modules typed against a specific `shared` stay
assignable). `shared` is whatever the `shared` entry default-exports; if that is a function it
is called with `{ z }` first.

Resources acquired through capabilities (event subscriptions, store subscriptions, panels,
engine systems) are released automatically on teardown through `ctx.onDispose`.

## 3. The context and capabilities

A plugin's only handle on the host is a **frozen, null-prototype `RPGStudioContext`**. Its
properties: `pluginId`, `target`, `manifest` (deeply frozen), `onDispose(fn)`, and one getter per
capability. Reading a capability the manifest did not declare **throws
`CapabilityDeniedError`**. A plugin cannot reach host internals by accident or by design.

| Manifest name | Property         | Editor | Engine | Provides                                                                                                                       |
| ------------- | ---------------- | :----: | :----: | ------------------------------------------------------------------------------------------------------------------------------ |
| `events`      | `ctx.events`     |   ✓    |   ✓    | `on(coreEvent, fn)`, `emit(name, json)` (namespaced `<pluginId>:<name>`; strict-JSON payload), `listen(fullName, fn)`          |
| `schemas`     | `ctx.schemas`    |   ✓    |   ✓    | `z` (the host's Zod), `register(name, schema)` (name must be declared in the manifest), `validate("<id>/<name>", data)`, `has` |
| `log`         | `ctx.log`        |   ✓    |   ✓    | `debug/info/warn/error(message, json?)` → host log sink, tagged with the plugin id                                             |
| `store`       | `ctx.store`      |   ✓    |        | See [editor.md §5](editor.md#5-plugins-in-the-editor)                                                                          |
| `ui`          | `ctx.ui`         |   ✓    |        | `registerPanel`, `kit` (host `React`, MUI subset, `useSelector`, `useDispatch`)                                                |
| `files:read`  | `ctx.readFiles`  |   ✓    |        | `list`, `readText`, `readBytes`                                                                                                |
| `files:write` | `ctx.writeFiles` |   ✓    |        | `write`, `remove` under `img/`, `audio/`, `plugins/<own id>/` only                                                             |
| `ecs`         | `ctx.ecs`        |        |   ✓    | `world`, read-only `state`, `addSystem(fn)`                                                                                    |
| `audio`       | `ctx.audio`      |        |   ✓    | the `AudioPort` (`play(tier, cue)`, `stop(tier)`)                                                                              |
| `render`      | (none)           |        |        | reserved, unprovided                                                                                                           |

Rules enforced by the hosts, not by convention:

- Custom event names match `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` and payloads must parse as
  strict JSON (no functions, no `Date`).
- `schemas.register` throws `PluginPolicyError` for an undeclared or duplicate name, or a value
  that is not a Zod schema. Registered schemas are namespaced `"<pluginId>/<name>"`.
- `store.dispatchProjectAction` accepts only the sixteen project actions, validated and
  dry-run; it returns a `Result` (never throws) with the refusal reason.
- `store.registerSlice({ name, initialState, reducers })` creates a plain reducer under the key
  `plugin_<id>_<name>` with action types `plugin/<id>/<name>/<reducer>`. Reducers are
  `(state, payload) => nextState` and must not mutate. Calling it again with the same name
  returns the existing slice.

## 4. Loading

`loadPluginPackage(files, target, { importModule? })` takes the plugin folder as
`Record<path, text>` including `manifest.json`, validates the manifest, then reads **only**
`entries.shared` and `entries[target]`. The other head's file is never read or imported;
a test asserts the importer is never asked for it. Each entry is imported with
`importModuleFromSource`: `import()` of a Blob URL in browsers, falling back to a `data:` URL
where Blob imports are unavailable (Node, jsdom).

Because modules are imported from a URL with no import map, **an entry cannot `import`
anything**. Everything it needs is passed in: Zod through `ctx.schemas.z` (or the `{ z }`
argument to a function-valued `shared`), React and MUI through `ctx.ui.kit`. Bundle your
plugin into single files with no external imports.

## 5. Example: an editor + engine plugin

`manifest.json` as in §1, with `capabilities: ["schemas", "ui", "store", "ecs"]`.

`shared.js` (both heads; a function receives `{ z }`):

```js
export default ({ z }) => ({
  QuestSchema: z.strictObject({ id: z.int().min(1), title: z.string().min(1) }),
  isDone: (quest, switches) => switches[quest.id] === true,
})
```

`editor.js`:

```js
export default {
  initialize(ctx, shared) {
    ctx.schemas.register('Quest', shared.QuestSchema)
    const { React, mui, hooks } = ctx.ui.kit
    const slice = ctx.store.registerSlice({
      name: 'quests',
      initialState: { quests: [] },
      reducers: { added: (state, quest) => ({ quests: [...state.quests, quest] }) },
    })
    ctx.ui.registerPanel({
      id: 'acme.quest-log.panel',
      title: 'Quests',
      location: 'right',
      component: () => {
        const { quests } = hooks.useSelector(slice.select)
        return React.createElement(mui.Typography, null, `${quests.length} quests`)
      },
    })
  },
}
```

`engine.js`:

```js
export default {
  initialize(ctx) {
    let ticks = 0
    ctx.ecs.addSystem((game) => {
      ticks += 1 // runs after built-in systems; do not write game.state (use it read-only)
    })
  },
}
```

## 6. Testing a plugin

Register it against a real host with a fake project, then assert on state:

```ts
const { host } = setup() // see packages/editor/test/plugins.test.ts
host.manager.register(await loadPluginPackage(files, 'editor'))
await host.manager.initialize()
```

For the engine, use `createHeadlessGame` + `createEnginePluginManager(headless.game, { audio: headless.audio })`
(see `packages/engine/test/plugins.test.ts`). Include a test that your plugin does nothing when it
lacks a capability (it should throw `CapabilityDeniedError`, never fail silently).

## 7. Adding a new capability

1. Add the name to `CAPABILITIES` and `CAPABILITY_KEYS` in `core/src/plugins/manifest.ts` / `context.ts`
   (the key is the context property, e.g. `'files:read'` → `readFiles`).
2. Define its interface and add it to the host's capability interface (`EditorCapabilities` or
   `EngineCapabilities`).
3. Provide it in that host's `providers` map. Use `scope.onDispose` for anything that needs cleanup,
   and narrow it: pass the plugin a facade, never the raw object.
4. Add tests for allow, deny and teardown. Update the table in §3 (a docs test checks every name).
