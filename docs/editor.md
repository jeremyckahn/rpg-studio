# Editor (`@rpgstudio/editor`)

A React 19 + MUI app around a Redux Toolkit store, a PixiJS map canvas, an embedded Piskel
sprite editor, an in-browser game exporter and a companion bridge for AI agents. It builds
as an installable PWA (`pnpm build:app`) and also as a small library
(`src/index.ts`, React-free) for plugin authors and tools.

## 1. Source map

```
src/main.tsx            boot: store, assets, session, plugin host, bridge, render
src/App.tsx             providers (Redux, services, MUI theme) around MasterLayout
src/store/              Redux: slices, pure ops, history middleware, selectors
src/project/            AssetStore, file systems, persistence, session, textures
src/plugins/            plugin host (capabilities), panel registry, core plugins
src/components/         layout (desktop docks and compact sheet), menu bar, asset browser, map panels, database editor
src/canvas/             map scene (Pixi), geometry, paint tools, touch gestures
src/piskel/             Piskel bridge, protocol, texture invalidation, panel
src/export/             packager, zip helpers, project archive, engine file loader
src/bridge/             companion client, request handler, queries, window.RPGStudio
src/pwa/register.ts     service worker registration and the update flow (production only)
scripts/                piskel vendoring + adapter, icon generator, engine-player Vite plugin
public/                 icons and the vendored Piskel build
```

## 2. The store (`src/store/`)

State shape (`RootState`):

| Key                  | Contents                                                                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project`            | `{ data: Project, revision: number }`. `revision` counts accepted changes.                                                                                           |
| `history`            | `{ past, future, lastGroup }` of `ProjectState` snapshots (cap 200)                                                                                                  |
| `editorUi`           | selection (map, layer, tile, tool), zoom index, overlays, active workspace panel, `openAssetPath`, `savedRevision`, `folderName`, `status` message, companion status |
| `assets`             | `{ paths: string[], versions: Record<path, number> }` mirror of the AssetStore                                                                                       |
| `plugin_<id>_<name>` | slices injected at runtime by plugins                                                                                                                                |

Create one with `createEditorStore({ project? })` → `{ store, injectReducer }`. It is built with
`combineSlices(...).withLazyLoadedSlices()`; `injectReducer(path, reducer)` adds state at
runtime and refuses the four core keys or a duplicate. `immutableCheck` is off and
`serializableCheck` skips `history` (walking a large project and every snapshot on every dispatch is waste;
immutability is enforced by lint instead). Selectors live in `selectors.ts`
(`selectCurrentMap`, `selectIsDirty`, `selectCanUndo`, …).

### Project actions

The sixteen actions an editor, plugin, console user or agent can use to change a project.
Their payload schemas are in core `schemas/actions.ts`; the action `type` is
`project/<name>`; creators are `projectActions.<name>(payload, historyGroup?)`.

| Action                   | Effect                                                                  |
| ------------------------ | ----------------------------------------------------------------------- |
| `project/setTiles`       | Set tiles `{x,y,tile}[]` on one layer                                   |
| `project/fillArea`       | Fill a rectangle (corners in any order) with a tile                     |
| `project/floodFill`      | 4-connected flood fill on one layer                                     |
| `project/setCollision`   | Set collision flags on cells                                            |
| `project/createMap`      | Add a map (next free id, or a requested one)                            |
| `project/resizeMap`      | Grow or shrink, keeping content, dropping events that fall outside      |
| `project/renameMap`      | Rename                                                                  |
| `project/deleteMap`      | Delete (refused for the start map or a transfer target)                 |
| `project/addLayer`       | Append an empty layer (max 8)                                           |
| `project/removeLayer`    | Remove a layer (min 1)                                                  |
| `project/setLayerProps`  | Name, `visible`, `above`                                                |
| `project/upsertRecord`   | Insert/replace a database record, validated by its table's schema       |
| `project/deleteRecord`   | Delete a record (refused if anything references it)                     |
| `project/upsertMapEvent` | Insert/replace a map event                                              |
| `project/removeMapEvent` | Remove a map event                                                      |
| `project/updateMeta`     | Change project metadata (name, start position/map/party, switch names…) |

Not in this list on purpose: `project/projectLoaded` and `project/projectRestored`
(internal; they replace the whole project) and the UI/asset/history actions. The bridge and
plugin host accept **only** the sixteen, via `ProjectActionSchema`.

### `applyProjectAction` (`projectOps.ts`): the single mutation path

`applyProjectAction(project, action) → Result<Project>`. Pure; never mutates its input; returns a
new project sharing everything it did not touch. Behaviour to rely on:

- `resizeMap` also clamps the start position when the start map is resized; `deleteMap` uses explicit checks (not full-schema validation: it refuses the start map and maps that are transfer targets); `removeMapEvent` only checks that the event exists.
- Tile operations validate their inputs (cells in bounds, layer exists) and apply
  **atomically**: one bad cell refuses the whole action.
- Operations that change relationships (`resizeMap`, `deleteMap`, records, events, meta)
  build a candidate and validate it with the full `ProjectSchema`, so references can never
  dangle. They return the schema's first three issues as the error message.
- Messages are written for an AI to act on: "Cell (99, 0) is outside the 6x4 map",
  "Map 2 is still the destination of event 1 on map 1".
- The reducers (`slices/project.ts`) are one-liners that call this and return either
  `{ data, revision + 1 }` or the **same state object** on refusal.

### History (`history.ts`)

Middleware, not a reducer. On an undoable action it records `state.project` before and, if the
reference changed, dispatches `history/recorded`. `undo()` / `redo()` swap in snapshots via
`project/projectRestored`. Undoable types are derived from `ProjectActionSchema`, so new actions
are undoable automatically. Actions with equal `meta.historyGroup` in a row coalesce into one
step; the paint tools use a fresh group per stroke and the bridge uses one per request.
`projectLoaded` clears history. A snapshot carries its `revision`, so undoing back to the saved
revision makes `selectIsDirty` false.

### Declaration-emit rule

Do not export slice objects or inferred action creators from a module: Immer's unexported
draft types leak into the generated `.d.ts` and `pnpm build` fails (TS4023). Export typed
creators (`ProjectActionCreators`, `HistoryActionCreators`) and reducers instead.

## 3. Project I/O (`src/project/`)

- **`AssetStore`**: in-memory bytes for non-JSON files; `write` validates the path with
  `AssetPathSchema`; publishes `changed` / `removed` / `reset` events; tracks unsaved writes and
  removals until `markSaved()`.
- **`ProjectFileSystem`**: `{ name, list, readFile, writeFile, deleteFile }`. Implementations:
  `createDirectoryHandleFileSystem` (File System Access API; skips `.git`, `node_modules`,
  dot-folders; `supportsDirectoryPicker()`), and `createMemoryFileSystem` (tests).
- **`persistence.ts`**: `loadProject(fs)` reads `project.json`/`data/*`/`maps/*` through
  `filesToProject` and everything under `img/`, `audio/`, `plugins/` as assets, ignoring other
  files. `saveProject(fs, project, assets, cache)` writes only data files whose text changed and
  assets written since the last save, and deletes files for removed maps/assets.
- **`session.ts`**: `createProjectSession(...)` is what the UI calls: `newProject`, `openFolder`,
  `openFileSystem`, `openArchive`, `save`, `saveAs`, `exportGame`, `downloadProjectArchive`.
  It dispatches `projectLoaded` / `projectOpened` / `projectSaved`, mirrors AssetStore events into
  the `assets` slice, reports through `editorUi.status`, and treats a cancelled picker
  (`AbortError`) as a quiet no-op. All dependencies (picker, download, fetch) are injectable.
- **`textures.ts`**: the editor's texture provider reads the AssetStore and calls
  `invalidate()` (→ `Assets.cache.reset()`) on any asset event.

## 4. UI structure

`MasterLayout` renders: `MenuBar` (File/Edit/View, undo/redo, companion status), a left column
(`AssetBrowser` plus _left_ panels), tabs for _workspace_ panels, and a right dock of _right_
panels. It knows nothing about specific features: panels come from the **panel registry**
(`PanelDefinition { id, title, location: workspace|left|right|bottom, order?, when?, component }`). **`bottom` is declared but not rendered yet**: `MasterLayout` shows only workspace, left and right panels.
`when` restricts a docked panel to one workspace panel.

The menu bar's **?** button opens the user guide (the GitHub wiki) in a new tab, and the companion dialog links to
its setup page; both read `src/links.ts` (`WIKI_URL`, `WIKI_PAGES`). The wiki is a separate repository that must be kept
current: see [AGENTS.md](../AGENTS.md#the-wiki-user-guide-keep-it-current).

**Compact layout (phones, small tablets).** `useLayoutMode()` (`components/useLayoutMode.ts`) is
`compact` below MUI's `md` breakpoint (900 px) and `portrait` from `(orientation: portrait)`. Compact
mode keeps the workspace on screen and folds the asset browser and every docked panel into one
**bottom sheet** (`CompactBody` in `MasterLayout.tsx`): a `BottomNavigation` bar picks the section
(Assets, plus each visible left and right panel under its own title), tapping the open section collapses
the sheet, and the first left panel (the tile palette) is open until the user chooses. The sheet sits
below the workspace in portrait and beside it in landscape. Panels are unchanged: they still come from
the registry and do not know which layout shows them. Other compact adaptations: the root uses `dvh`,
the menu bar drops its title and shows the companion status as an icon, the map toolbar scrolls sideways
and hides zoom buttons (pinch zooms), `viewport-fit=cover` plus safe-area padding for notches, and the
theme enlarges targets to 44 px under `(pointer: coarse)` and sets inputs to 16 px so iOS does not zoom.
Tests fake a screen with `mockViewport(width, height)` from `test/render.tsx`. Keyboard: Ctrl/Cmd+Z undo,
Ctrl+Shift+Z / Ctrl+Y redo (not while typing in a field), Ctrl+S save.

The first-party panels (`plugins/corePlugins.ts`):

| Plugin id                | Registers                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `rpgstudio.map-editor`   | workspace `Map` (toolbar + `MapCanvas`), left `Tools` (maps, layers, tileset palette), right `Properties` (map, game start, events JSON) |
| `rpgstudio.database`     | workspace `Database` (`DatabaseEditor`)                                                                                                  |
| `rpgstudio.pixel-editor` | workspace `Sprite Editor` (`createPiskelEditorPanel({ read: ctx.readFiles, write: ctx.writeFiles })`)                                    |

Patterns to follow:

- **No `setState` in effects** (the React Compiler lint forbids it). Reset local state by
  giving the component a `key` tied to the value (`CommitField`, `EventsEditor`), or set state
  from an async callback.
- **No refs read during render** and no DOM property assignment (use `setAttribute`; reset file
  inputs by bumping a `key`).
- Components read state with `useAppSelector` and dispatch `projectActions`; they never edit
  projects themselves. Pre-check with `applyProjectAction` when you need to show _why_ an edit
  was refused before dispatching (see `DatabaseEditor`, `PropertiesPanel`).

### Database editor

Columns come from the Zod schema of each table (`schemaColumns.ts`): `describeField` unwraps
`optional`/`default`/`nullable` and maps `string`/`number`/`boolean`/`enum` to editable
cells; everything else (objects, arrays, records, unions) is a JSON cell
(`formatJson`/`parseJsonCell`, which hands invalid text back so Zod explains it). A row edit is
accepted only if `UpsertRecordPayloadSchema` accepts the record **and** `applyProjectAction`
accepts it; otherwise the cell reverts and the reason is shown. `newRecord` builds a valid
record through the table's own schema.

### Map canvas

`MapCanvas` creates a `MapScene` (`canvas/mapScene.ts`, imperative Pixi) and wires it to the store
with plain subscriptions, so pointer moves never trigger React renders. The scene keeps one
`CompositeTilemap` per layer and rebuilds a layer only when its object reference, the tileset
texture or the map width changed (reducers keep untouched layers referentially equal). Overlays:
grid (1 screen pixel wide at any zoom), collision (red cells, amber ledge bars), events (boxes),
hover preview. Interaction: left-drag paints; middle/right-drag, Space+drag or the **Pan** tool pans; wheel
zooms about the cursor in steps `[1,2,3,4,6,8]`. **Touch:** `canvas/gestures.ts` (`reduceTouch`, pure) turns
fingers into intents: one finger uses the current tool, but only starts a stroke after moving past a 10 px slop
(a tap paints one cell), so a second finger can arrive without the first having painted; two fingers pan by
their midpoint and zoom a level each time the spread changes by 1.35x (zoom levels are whole numbers); a finger
left after a pinch keeps panning rather than painting. `canvas/geometry.ts` (screen↔tile, zoom-about-point,
pan clamp, Bresenham) and `canvas/tools.ts` (`createPaintController`: pencil, eraser, fill,
collision; one history group per stroke; a collision stroke's first cell decides paint vs. clear)
are pure and unit-tested.

## 5. Plugins in the editor

`createEditorPluginHost({ handle, assets, panels, logSink? })` → `{ core, manager }`. The editor
host provides, beyond core's `events`/`schemas`/`log`:

| Capability (manifest) | Context property | What it gives                                                                                                                                                                                                                              |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `store`               | `ctx.store`      | `getProject`, `select`, `dispatchProjectAction(unknown)` (Zod-validated, dry-run, returns `Result`), `registerSlice` (a plain reducer under the state key `plugin_<id>_<name>` (action types `plugin/<id>/<name>/<reducer>`)), `subscribe` |
| `ui`                  | `ctx.ui`         | `registerPanel`, and `kit`: host `React`, a MUI subset, `useSelector`/`useDispatch`                                                                                                                                                        |
| `files:read`          | `ctx.readFiles`  | `list`, `readText`, `readBytes` over the AssetStore                                                                                                                                                                                        |
| `files:write`         | `ctx.writeFiles` | `write`, `remove`, limited to `img/`, `audio/` and `plugins/<own id>/`                                                                                                                                                                     |

See [plugins.md](plugins.md) for the full contract and an example.

## 6. Piskel

Layout: `public/piskel/` (vendored build; do not edit), `scripts/vendor-piskel.ts` (regenerates
it), `scripts/piskel-adapter.ts` (runs inside Piskel), `src/piskel/{protocol,bridge,
PiskelEditorPanel,textureInvalidation}.ts`.

Flow: the asset browser dispatches `assetOpened(path)` (png/piskel) → the panel's bridge `open`s it:
it sends the existing `<base>.piskel` if present (layers/frames intact) or builds one from the PNG
(`decodeImageInBrowser`, then `serializePiskel`). Saving (toolbar button, or the button Piskel's
adapter adds inside its own window) returns `{ piskel, png, width, height, frames }`; the bridge
writes `<base>.png` and `<base>.piskel` through `ctx.writeFiles`, the AssetStore emits
`changed`, `connectTextureInvalidation` resets the texture cache, and the map canvas redraws.

Security: the bridge ignores any message whose `origin` is not the editor's own or whose `source`
is not the iframe's window; every message is parsed with `AdapterMessageSchema` first (PNG
payloads must be `data:image/png;base64,…`). If the iframe does not say `ready` within 8 s the
panel tells the user to run `piskel:vendor`.

Regenerating: `pnpm --filter @rpgstudio/editor piskel:vendor` clones the pinned commit
(`COMMIT` in the script; it refuses to build anything else), builds with Piskel's Grunt
toolchain, copies only what is needed, renames bundles to drop the build date, injects the
adapter before the **last** `</body>` (earlier ones are inside HTML template strings), adds
`LICENSE` and `NOTICE.md`. Restart the Vite dev server afterwards.

## 7. Export

`buildExportEntries({ project, assets, engine })` → `{ entries, omitted }` (pure), and
`zipEntries` (fflate async `zip`; already-compressed formats stored). `session.exportGame` fetches
`engine/player.js` via `loadEngineFiles(baseUrl)` and downloads `<slug>.zip`.

Included: `index.html`, `game.json`, `project.json`, `data/*`, `maps/*`, images
(`png jpg jpeg gif webp avif` under `img/`), audio (`ogg mp3 m4a wav` under `audio/`), and for
each plugin listed in `meta.plugins`: `manifest.json` plus its `shared` and `engine` entries
only, and `engine/player.js`. Omitted (and reported): `.piskel`, any other file type, and editor-only files of _enabled_ plugins. Files under `plugins/` are silently dropped by `classifyAssets`, so files of plugins that are not enabled are not reported. Refused (`ExportError` with all problems at once): enabled
plugin missing/invalid/mismatched id/missing entry/missing dependency, a map tileset not in the
project, no engine build. The page title is HTML-escaped. `exportProjectArchive` /
`importProjectArchive` round-trip the **whole** project (sources included) for browsers without
the File System Access API; `unzipEntries` rejects traversal paths and archives over 512 MB.

## 8. Companion bridge (editor side)

`src/bridge/`: `runQuery` (pure), `createCompanionHandler` (validates, dry-runs, dispatches under
one history group, writes assets), `createCompanionClient` (outbound WebSocket, backoff
`1/2/4/8/10 s`, stops on close codes 4400/4401/4403), `createRPGStudioApi` +
`installRPGStudioGlobal` (`window.RPGStudio.query/dispatch`, non-enumerable). `main.tsx` wires
them; `CompanionDialog` is the UI. Protocol and security: [companion-protocol.md](companion-protocol.md).

## 9. PWA

`vite.app.config.ts`: `base: './'`; `enginePlayer()` serves `/engine/player.js` in dev from
`../engine/dist-player` and emits it into the build (it errors if the engine is not built);
`VitePWA` (generateSW, `registerType: 'prompt'`) precaches ~4.3 MB, `navigateFallback: index.html`
with `/piskel/` denied. **Updates are never applied silently**: reloading would discard unsaved work. When
the new service worker has downloaded, `createAppUpdater` (`pwa/register.ts`) calls `onUpdateReady`, which sets
`editorUi.updateAvailable`; `UpdateNotice` in `MasterLayout` shows "A new version is ready" with **Reload**
(`services.updater.apply()` → `updateSW(true)`) and **Later**, and warns about unsaved changes (the button
becomes "Reload anyway"). The browser is asked to check for a new version hourly. `register()` and `apply()`
are no-ops outside production. `services.tsx` imports the `AppUpdater` type with `import type`, so the module
with the `virtual:pwa-register` import is not pulled into tests. Icons are generated by
`scripts/generate-icons.ts`; `test/pwa.test.ts` checks they exist at the declared sizes.

## 10. Testing the editor

See [testing.md](testing.md). In short: pure logic (`projectOps`, packager, queries, geometry,
columns) is tested directly; the store is tested through real dispatches; components run in jsdom with
RTL against a real store and a real session built from fakes (`test/render.tsx`); WebGL-dependent
code is not unit-tested (its pure parts are); `test/e2e/companion.e2e.test.ts` runs the real relay,
the real editor handler/client and the reference agent together.
