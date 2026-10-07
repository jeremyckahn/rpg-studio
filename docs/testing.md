# Testing

## 1. Running tests

```sh
pnpm test                               # every package (and the docs checker), from the repo root
pnpm test:e2e                           # the Playwright end-to-end suite (build first, see §7)
pnpm --filter @rpgstudio/engine test    # one package
pnpm exec vitest run test/movement.test.ts   # one file (cd into the package first)
pnpm exec vitest                        # watch mode (cd into the package)
```

Vitest 5 with one project per package (root `vitest.config.ts` lists `packages/*` and `tooling`).
Each package's `vitest.config.ts` sets three things that must not be dropped:
`resolve: sourceResolve`, `ssr: sourceSsr` and `server.deps: workspaceServerDeps` (all from
`tooling/vite.ts`). Without them, workspace packages resolve to their built `dist/` and tests quietly run
against stale code ([troubleshooting](troubleshooting.md#tests-pass-but-use-old-code)).

Default environment is Node. Component tests start with `// @vitest-environment jsdom`.

## 2. Philosophy

1. **Test behaviour at the boundary where a bug would be visible**, with real collaborators wherever cheap: a real
   Redux store, a real `AssetStore`, a real `PluginManager`, a real WebSocket server. Fakes only for the
   network edge, time, the GPU and the browser's file picker.
2. **Pure logic gets pure tests.** Anything that can be a function of its inputs is (`applyProjectAction`,
   `buildExportEntries`, `runQuery`, `planTileDraws`, `integerScale`, `computeCamera`, `findPath`…), and these
   tests are the bulk of the suite.
3. **Assert refusals as carefully as successes.** For every validator/operation, test the rejection _and_ its
   message, and that state is unchanged (often by reference: `expect(state).toBe(before)`).
4. **Security properties each have a test** (wrong origin/token, forged result, path traversal, oversized
   archive, undeclared capability, other plugin's folder, editor head never loaded by the engine).
5. **Determinism is tested**, not assumed: identical seeds and inputs give identical snapshots and saves; a
   restored save continues exactly like the original.
6. **A test must be able to fail.** When adding a regression test, revert the fix once and watch it fail (the
   player-bundle test was proven this way).

## 3. What lives where

| Package          | Test files (see each directory for the full list)                                                                                                                                        | Notable                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| core             | `schemas`, `actions`, `protocol`, `events`, `math`, `plugins`, `pixel`, `project`                                                                                                        | Zod accept/reject tables; plugin lifecycle/sandbox; PNG codec incl. every filter; project file round trip |
| engine           | `movement`, `events`, `headless`, `saveload`, `renderer`, `audio`, `pixiSound`, `player`, `touchControls`, `plugins`, `playerBundle`                                                     | Headless simulation; no-GPU renderer maths; mocked `@pixi/sound`; builds the real player bundle           |
| editor           | `projectOps`, `store`, `canvas`, `export`, `project`, `session`, `piskel`, `bridge`, `plugins`, `columns`, `components`, `gestures`, `pwa`, `e2e/companion.e2e`                          | Pure ops; store/undo; Piskel bridge security; jsdom component tests; end-to-end bridge                    |
| companion-bridge | `server`                                                                                                                                                                                 | Real sockets: handshake, routing, security, agent library                                                 |
| tooling          | `docs`, `wiki` (needs a wiki clone)                                                                                                                                                      | Keeps these documents true                                                                                |
| e2e              | `app-shell`, `map-*`, `properties-panel`, `undo-redo`, `database`, `assets`, `sprite-editor`, `project-files`, `import-export`, `exported-game`, `plugins`, `companion`, `mobile`, `pwa` | Playwright against the built editor, an exported game and a real relay; see §7                            |

## 4. Fixtures and helpers

- **core:** `test/fixtures.ts` (`validProject`, `validMap`, stats), `test/helpers.ts` (`recorder`).
- **engine:** `test/fixtures.ts`: `mapFromAscii(id, rows, extra)` (`#` solid, `>` blocks leaving right),
  `page(commands, extra)`, `text()`, `buildProject({ maps?, meta? })` (a walled room with an NPC "Elder" whose second
  page depends on switch 1, and a touch "Door" to a cellar map).
- **editor:** `test/helpers.ts`: `sampleProject()` (two maps, a door event transferring between them) and
  `recorder`; `test/render.tsx`: `createHarness(panels?)` and `renderInApp(ui, harness?)` build a real store,
  asset store, session and companion client from fakes.
- **`recorder<T>()`** collects values _without mutating an array in test code_ (it wraps `vi.fn`). Use it instead of
  `const seen = []; fn(x => seen.push(x))`, which `functional/immutable-data` rejects.

## 5. Conventions that avoid lint fights

`functional/immutable-data` applies to tests. Prefer:

- `recorder()` / `vi.fn().mock.calls` over pushing to arrays;
- `Reflect.set` / `Reflect.defineProperty` (they return booleans) to probe frozen objects;
- `setAttribute` and `key` bumps instead of DOM property assignment in components;
- for genuine test doubles that must record by mutating (fake sockets, fake timers, the `@pixi/sound` singleton mock),
  a **file-level** `/* eslint-disable functional/immutable-data -- <why> */` at the top. Prefer file-level over inline disables; a few single-line inline disables with a reason exist in `editor/test/export.test.ts` and `engine/test/{renderer,player,audio}.test.ts`.

Other lint traps seen repeatedly: `@typescript-eslint/no-base-to-string` on `ws` `RawData` (use `rawDataToString`),
`require-await` on test callbacks with no `await` (drop `async`), `no-unnecessary-type-assertion` on
`getByRole(...) as HTMLButtonElement` (use `getByRole<HTMLButtonElement>(...)`).

Build test data with `Schema.parse(...)`; hand-written objects miss defaults and give confusing type errors because
payload types are schema _output_ types.

## 6. Component tests (RTL + jsdom)

`renderInApp` wraps your UI in the real providers. Stub any panel that mounts `MapCanvas` (no WebGL in jsdom).
`test/setup.ts` provides `URL.createObjectURL` and cleans up after each test. `findBy*`/`waitFor` can return a _stale_ element before React
re-renders after a store change; wait for the new value (see `PropertiesPanel` tests). The MUI DataGrid
is layout-dependent and is not rendered in unit tests: its behaviour is tested through the pure functions behind it
(`schemaColumns`, `records`, `projectOps`) and was verified in a browser.

## 7. End-to-end tests (Playwright)

Everything above runs in Node or jsdom. `packages/e2e` is the layer that runs the real thing: the **production build**
of the editor (`vite preview`, so minification and the service worker are in play) in Chromium, with WebGL through
SwiftShader so the PixiJS canvas really draws. Package rules, file map and traps: [packages/e2e/AGENTS.md](../packages/e2e/AGENTS.md).

```sh
pnpm build && pnpm build:app                                                # the app under test (rebuild after source changes)
pnpm --filter @rpgstudio/e2e exec playwright install --with-deps chromium   # once per machine
pnpm test:e2e                                                               # everything
pnpm --filter @rpgstudio/e2e exec playwright test test/database --repeat-each 5   # one spec, checked for flakiness
```

**The rule: every non-trivial feature gets an end-to-end test**, in the same piece of work that adds it
([AGENTS.md](../AGENTS.md#end-to-end-tests-cover-every-non-trivial-feature)). GitHub Actions runs the suite on every push to
any branch, so every commit of a pull request is covered (`.github/workflows/e2e.yml`: install, `pnpm build`, `pnpm build:app`, install Chromium, `pnpm test:e2e`;
in four parallel shards; the HTML report, traces, screenshots and videos of failures are uploaded as artifacts).

### What the suite covers

| Spec               | Covers                                                                                                                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app-shell`        | Boot into the starter project, workspaces and docked panels, the help link, the `window.RPGStudio` console API                                                                                                        |
| `map-painting`     | Tile palette; pencil (strokes, undo as one step, layers); eraser; flood fill; collision tool; picture changes and is restored by undo                                                                                 |
| `map-view`         | Tool selection, zoom (buttons, View menu, wheel), grid / collision / dim overlays, panning (Pan tool, Space, middle and right drag), window resize                                                                    |
| `map-management`   | New map dialog (defaults, custom size and tile size, limits, cancel), selecting, deleting (and the refusals), layers (add, max 8, show/hide, above characters, delete, undo)                                          |
| `properties-panel` | Rename, resize (grow, shrink, drops events, clamps the start, refusals), game start, project name, the events JSON editor (apply, replace, validation errors, one undo step)                                          |
| `undo-redo`        | Buttons, Edit menu, shortcuts, not while typing, redo history, the unsaved marker                                                                                                                                     |
| `database`         | Tabs and counts, columns from schemas, add / edit / delete for every table, text, number, enum and JSON cells, refusals with reasons, referential protection                                                          |
| `assets`           | The asset browser, every upload kind and its folder, multi-file and replacing uploads, file-name sanitising, which assets open for editing                                                                            |
| `sprite-editor`    | Opening a PNG or `.piskel` in Piskel, saving both back, drawing then saving redraws the map, reopening, the in-Piskel Save button                                                                                     |
| `project-files`    | Save / Save to another folder / Open folder through a real directory handle (OPFS), Ctrl+S, only changed files are written, cancelling, the discard-changes dialog, leaving the page, browsers without folder support |
| `import-export`    | Download project zip, import (round trip, invalid, hostile and foreign archives), export game (contents, escaping, left-out files, engine errors)                                                                     |
| `exported-game`    | An exported game served over HTTP and played: messages, NPCs, variables and branches, solid cells, doors between maps, autorun, error screens, desktop vs phone controls, requests made                               |
| `plugins`          | Plugins in an export: shared and engine heads ship and run, the editor head is stripped and never requested, every export refusal                                                                                     |
| `companion`        | The connect dialog, tokens, origins, retry and reconnect, and a real agent reading and editing the live editor (batches, refusals, assets, the reference demo)                                                        |
| `mobile`           | The compact layout (bottom sheet, orientation), touch painting, tools by touch, two-finger pan and pinch                                                                                                              |
| `pwa`              | Manifest and icons, service worker install, the editor (and export, and Piskel) working offline                                                                                                                       |

### How the tests are built

- **Act through the UI, read through the project.** Clicks, keys and pointer strokes drive the app; assertions read the project
  back with `window.RPGStudio.query` (the same read path an AI agent has), via the `studio` page object in
  `packages/e2e/support/studio.ts`. A canvas snapshot is only used to show that the picture changed.
- **Fresh state per test.** Each test gets a new browser context, so a new project, empty storage and no service worker; the
  `studio` fixture has already booted the editor.
- **Console errors fail tests.** The automatic `problems` fixture fails any test during which the page threw or logged an error.
- **Real collaborators.** The companion tests start the real relay and connect the reference agent library; the game tests
  export from the editor, unzip the download and serve it from a local HTTP server; the folder tests give the editor a real
  `FileSystemDirectoryHandle` from the browser's private file system by stubbing only the picker.
- **Known bugs are `test.fixme`**, each with a comment naming the cause and when to turn it into a plain test. They show up as
  "skipped" in the report. `grep -rn fixme packages/e2e/test` lists them.

## 8. What is NOT covered by automated tests

Most browser-only behaviour is now covered by the end-to-end suite (§7). What is still not automated:

| Area                                                  | Why                                                     | How it was verified                                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| What the canvas shows, pixel by pixel                 | Software GL differs from a GPU; no stored images        | The end-to-end tests prove the picture changes (and is restored) and that every action reaches the project; the look of tiles is checked by eye |
| Real audio playback, `@pixi/sound` streaming switch   | Needs a browser audio stack                             | **Not verified**, mocks only                                                                                                                    |
| The real folder picker dialog                         | Native browser UI                                       | The editor's save and open code runs against real directory handles from the private file system; only the picker is stubbed                    |
| The service worker update prompt (`UpdateNotice`)     | Needs two deployed versions                             | The prompt is covered by component tests; install and offline use are end-to-end tested                                                         |
| True touch hardware, and browsers other than Chromium | The suite runs desktop Chromium and its phone emulation | Touch gestures are tested with synthetic touch events; Firefox and Safari are reached only through the no-folder-picker path                    |

### Manual browser checklist

The end-to-end suite covers most of this. Run the list by hand for a change you cannot trust a headless browser with (the look
of the canvas, sound, a real phone):

1. `pnpm dev`; paint a stroke, Undo (the whole stroke reverts), edit a Database cell to an invalid reference (refused with a reason).
2. Double-click `basic.png` in the asset browser; draw; **Save to project**; switch to Map and confirm tiles updated with no reload.
3. File ▸ Export game; unzip; serve the folder statically (`python3 -m http.server`) and open it: the map renders, arrow keys
   move, Enter talks to an NPC. Check the console for errors.
4. `pnpm dev:companion`, **Companion** ▸ Connect in the editor, then `pnpm --filter @rpgstudio/companion-bridge demo`.
5. `pnpm build && pnpm build:app`, serve `packages/editor/dist-app`, check the console and the Application tab for the service worker.
6. Mobile: set the browser pane to the Mobile preset (375x812, then rotate to 812x375). Check that the bottom navigation switches sections, a tap paints one tile, two fingers pan and pinch-zoom without painting, and an exported game shows the D-pad and A button with the game above them in portrait. Playing an exported game on a real phone is the only check of true touch input; synthetic pointer events do not go through the browser's touch pipeline.

When driving a browser pane programmatically, take a fresh screenshot right before clicking by coordinates (pane
resizes shift them), and restart the Vite dev server after regenerating `public/piskel`.

## 9. The docs test

`tooling/docs.test.ts` fails when documentation drifts from the code (broken links or anchors, a repository path in
backticks that no longer exists, a package without an `AGENTS.md`, or a project action / query / schema name / event command /
capability / close code that the docs must list but do not). If it fails after your change, update the docs; that is the point.
