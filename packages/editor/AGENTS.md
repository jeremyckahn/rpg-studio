# AGENTS.md: `@rpgstudio/editor`

The authoring app (React 19, MUI, Redux Toolkit, PixiJS, PWA). Read the
[root AGENTS.md](../../AGENTS.md) first, then [docs/editor.md](../../docs/editor.md) (the full description).

## Hard rules for this package

- **Every project edit goes through a project action → `applyProjectAction`** (`src/store/projectOps.ts`). Components,
  plugins, the console API and the AI bridge must not write project data any other way. To change what an edit
  does, change `projectOps`, never a component.
- **Operations are pure.** `applyProjectAction` never mutates its input, returns a new project sharing untouched parts,
  or `fail(message)`. A refused action returns the _same state object_ from the reducer.
- **Reducers return new state**; no Immer draft mutation.
- **Bytes stay out of Redux** (`AssetStore`). Redux mirrors only paths and versions.
- **All file writes by plugins/agents go through the `AssetStore`**, so the texture cache is invalidated.
- **No `setState` inside effects, no ref reads during render, no DOM property assignment** (React Compiler and
  immutability lint). Reset local state with a `key`; use `setAttribute`.
- **Do not export inferred Redux slice types** (Immer draft types break declaration emit). Export explicitly typed
  creators/reducers.
- `src/index.ts` (the library entry) must stay React-free.
- Mutation is allowed in `canvas/mapScene.ts` (PixiJS scene graph) and `store/floodFill.ts` (local scratch buffer); nowhere else.

## Map

```
src/main.tsx                  boot and wiring (store, assets, session, plugin host, bridge, render, PWA)
src/App.tsx                   providers + theme
src/store/                    index.ts (createEditorStore, injectReducer), projectOps.ts (the pure ops),
                              history.ts (undo/redo middleware), selectors.ts, floodFill.ts,
                              slices/{project,history,editorUi,assets}.ts
src/project/                  assetStore, fileSystem, persistence, session, textures
src/plugins/                  editorHost (capabilities), panelRegistry, corePlugins (first-party plugins)
src/components/               MasterLayout, MenuBar, AssetBrowser, MapEditorWorkspace, MapToolPanel, PropertiesPanel,
                              MapCanvas, CompanionDialog, services.tsx (context + typed hooks), useAssetUrl,
                              database/{DatabaseEditor, schemaColumns, records}
src/canvas/                   mapScene (Pixi), geometry (pure), tools (paint controller)
src/piskel/                   protocol, bridge, PiskelEditorPanel, textureInvalidation
src/export/                   packager (pure), zip, archive, engineFiles (+ download helper)
src/bridge/                   companionClient, handler, queries, global (window.RPGStudio)
src/pwa/register.ts           service worker registration (production only)
scripts/                      vendor-piskel.ts, piskel-adapter.ts, generate-icons.ts, enginePlayerPlugin.ts
public/                       icons/ (generated), piskel/ (vendored; see its AGENTS.md)
vite.config.ts                library build;  vite.app.config.ts  the PWA app build (dev/build:app/preview)
test/                         see docs/testing.md; render.tsx (RTL harness), e2e/companion.e2e.test.ts
```

## Invariants worth knowing

- `RootState` keys: `project`, `history`, `editorUi`, `assets`, plus lazily injected `plugin_<id>_<name>`.
- Undoable actions are exactly the types in `ProjectActionSchema`; `meta.historyGroup` coalesces consecutive actions.
- `selectIsDirty` compares `project.revision` with `editorUi.savedRevision`; snapshots carry their revision.
- `session.save` writes only changed files; `exportGame` refuses broken games (`ExportError`).
- `MapScene` rebuilds a layer only when its object reference, the tileset texture or the map width changed.
- The Piskel bridge accepts a message only if `origin` matches and `source` is the iframe's window, after Zod parsing.
- The bridge handler validates with `ProjectActionSchema`, dry-runs on a copy, applies batches atomically, and gives each
  request one history group.
- Core plugins are registered in `corePlugins.ts`; **project plugins (`plugins/<id>/`) are not auto-loaded into the editor yet**
  ([plugins.md](../../docs/plugins.md#status-what-works-and-what-is-not-wired-up-yet)).

## Testing

`pnpm --filter @rpgstudio/editor test`. Pure logic directly; store through real dispatches; components with
`renderInApp` (`test/render.tsx`) in jsdom; the bridge end to end in `test/e2e`. No WebGL in tests: stub panels that mount
`MapCanvas`. See [docs/testing.md](../../docs/testing.md) for the lint-friendly test idioms and the manual browser checklist.

## Extending

[project action](../../docs/extending.md#add-a-project-action) ·
[map tool](../../docs/extending.md#add-a-map-editing-tool) ·
[panel/plugin](../../docs/extending.md#add-an-editor-panel-or-first-party-plugin) ·
[database table](../../docs/extending.md#add-a-database-table) ·
[export asset kind](../../docs/extending.md#add-an-asset-kind-to-export) ·
[companion query](../../docs/companion-protocol.md#10-extending-the-protocol)

## Pitfalls

- `pnpm dev` needs the engine player built (the root script does it; `pnpm --filter @rpgstudio/editor dev` alone will 404
  `/engine/player.js` on export until you build the engine).
- After regenerating `public/piskel`, restart the Vite dev server.
- `findBy*` in component tests may return a stale element; wait for the new value.
- DataGrid rendering is layout-dependent; its behaviour is covered by testing the pure functions behind it.
- The default new project starts with a status message ("Created …"); `session.newProject()` is called in `main.tsx` before render.
