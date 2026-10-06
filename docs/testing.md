# Testing

## 1. Running tests

```sh
pnpm test                               # every package (and the docs checker), from the repo root
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

| Package          | Test files (see each directory for the full list)                                                                                                               | Notable                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| core             | `schemas`, `actions`, `protocol`, `events`, `math`, `plugins`, `pixel`, `project`                                                                               | Zod accept/reject tables; plugin lifecycle/sandbox; PNG codec incl. every filter; project file round trip |
| engine           | `movement`, `events`, `headless`, `saveload`, `renderer`, `audio`, `pixiSound`, `player`, `touchControls`, `plugins`, `playerBundle`                            | Headless simulation; no-GPU renderer maths; mocked `@pixi/sound`; builds the real player bundle           |
| editor           | `projectOps`, `store`, `canvas`, `export`, `project`, `session`, `piskel`, `bridge`, `plugins`, `columns`, `components`, `gestures`, `pwa`, `e2e/companion.e2e` | Pure ops; store/undo; Piskel bridge security; jsdom component tests; end-to-end bridge                    |
| companion-bridge | `server`                                                                                                                                                        | Real sockets: handshake, routing, security, agent library                                                 |
| tooling          | `docs`                                                                                                                                                          | Keeps these documents true                                                                                |

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

## 7. The end-to-end test

`packages/editor/test/e2e/companion.e2e.test.ts` starts the real relay on a free port, connects the real editor client
(wrapping `ws` with an `Origin` header, as a browser would) to a real store, then runs the reference agent. It asserts
terrain, collision, a Zod-validated actor, PNG/`.piskel` assets, texture-cache invalidation, a path query, and that two
Undos restore the original project. It also covers refusals, a disconnecting editor and automatic reconnect.

## 8. What is NOT covered by automated tests

| Area                                                          | Why                         | How it was verified                                                       |
| ------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------- |
| WebGL rendering output, Pixi scene graph in the editor/player | No GPU in CI                | Pure maths is unit-tested; the whole flow was exercised in a real browser |
| Real audio playback, `@pixi/sound` streaming switch           | Needs a browser audio stack | **Not verified**, mocks only                                              |
| File System Access API picker                                 | Browser UI                  | `ProjectFileSystem` is tested with an in-memory fake                      |
| Service worker caching/updates                                | Needs a browser             | Config and icons tested; build output inspected                           |
| Piskel inside the iframe                                      | Third-party app             | Bridge/protocol tested; flow verified in a browser                        |
| Touch input                                                   | Not implemented             | n/a                                                                       |

### Manual browser checklist

Run these after changes to the canvas, export, Piskel or bridge:

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
