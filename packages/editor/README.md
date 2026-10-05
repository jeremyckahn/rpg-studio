# @rpgstudio/editor

The authoring workspace: a React/MUI shell around a Redux Toolkit store, a
PixiJS map canvas, an embedded Piskel sprite editor and an in-browser game
exporter. It builds as an installable PWA.

```sh
pnpm dev          # builds the engine player, then serves the editor at :5173
pnpm build:app    # production PWA into packages/editor/dist-app
```

## Architecture

**Plugin-first.** The layout renders whatever plugins register. The Map Editor,
Database Editor and Sprite Editor are ordinary plugins (`plugins/corePlugins.ts`)
that use the same `ui`, `store` and `files` capabilities as a third-party plugin.
`plugins/editorHost.ts` narrows each capability: a plugin cannot reach the raw
store, overwrite project data, or write outside `img/`, `audio/` and its own
folder.

**One path for every edit.** Every change to a project is a pure function in
`store/projectOps.ts` (`Project -> Result<Project>`). The Redux reducers apply
it, and so can anything else, which makes it possible to explain _why_ an action
was refused without dispatching it. Reducers never mutate; a refused action
leaves the state untouched by reference. The action payload schemas live in
`@rpgstudio/core`, so the UI and the AI bridge share one contract.

**Undo/redo** is middleware (`store/history.ts`). Snapshots share structure with
the live project, so 200 steps are cheap. Actions carrying the same
`meta.historyGroup` in a row (a brush stroke) undo as one step. The revision
travels with each snapshot, so undoing back to the saved state reads as clean.

**Dynamic slices.** `createEditorStore().injectReducer(path, reducer)` adds state
at runtime (RTK `combineSlices`). Plugins get this as `store.registerSlice`.

## Map editor

Each layer is its own batched `@pixi/tilemap` and is rebuilt only when that
layer's data changed (untouched layers stay referentially equal). Pointer input
becomes `setTiles`, `floodFill` or `setCollision` actions through
`canvas/tools.ts`. Pan with middle/right drag or Space + drag; zoom with the
wheel, about the cursor, in whole-number steps so pixels stay square.

## Sprite editor and hot reloading

`pnpm --filter @rpgstudio/editor piskel:vendor` builds Piskel (Apache-2.0) from a
pinned commit into `public/piskel/` (committed, with its license). A small
TypeScript adapter, `scripts/piskel-adapter.ts`, speaks a Zod-validated
`postMessage` protocol (`piskel/protocol.ts`). Double-clicking a `.png` or
`.piskel` in the asset browser opens it with its layers and frames; saving writes
the updated `.png` and `.piskel`. Any asset change resets the texture cache
(`Assets.cache.reset()`), so the map canvas shows new art immediately. The bridge
only accepts messages from its own origin and the iframe's window.

## Export

**File > Export game** builds a static HTML5 bundle in memory and downloads it:
`index.html`, `game.json`, the project's JSON, images, audio, the `shared` and
`engine` heads of enabled plugins, and the pre-built engine player. Raw `.piskel`
sources and editor-only plugin code are left out. It refuses to export a game
with a broken plugin or a missing tileset rather than ship something that cannot
run. Compression uses `fflate`'s worker-backed `zip`.

## Saving

With a Chromium browser, **Open folder** and **Save** use the File System Access
API and write only the files that changed. Elsewhere, **Import** and **Download
project (.zip)** round-trip the whole project, `.piskel` sources included.

## Mutation

`functional/immutable-data` applies here too. Documented exceptions: the PixiJS
scene (`canvas/mapScene.ts`), flood fill's scratch buffer, and bytes written into
freshly allocated buffers.
