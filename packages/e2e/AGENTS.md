# AGENTS.md: `@rpgstudio/e2e`

Playwright end-to-end tests: the built editor PWA, an exported game and the AI companion bridge, driven in a real
Chromium. Private package; nothing is published from here. Read the [root AGENTS.md](../../AGENTS.md) first, then
[docs/testing.md](../../docs/testing.md#7-end-to-end-tests-playwright) (how the whole suite fits together).

## Hard rules for this package

- **Every non-trivial feature has a test here.** A feature that adds or changes something a user can see or do (a menu
  item, tool, panel, gesture, shortcut, dialog, file format, export content, companion behaviour) is not done until a
  spec in `test/` exercises it through the real UI. Unit and component tests stay; they do not replace this.
- **Drive the UI, read the project back.** Act with clicks, keys and pointer strokes. Assert on the project through
  `window.RPGStudio.query` (`studio.map()`, `studio.table()`, `studio.assets()`, …), which is the same read path an AI
  agent uses, not on what the pixels suggest. Use a canvas snapshot only to prove the picture changed
  (`studio.canvasImage()`).
- **The app under test is the production build** (`vite preview` on port 4173): that is what users get, service worker
  and minification included. Rebuild with `pnpm build && pnpm build:app` after changing source; `globalSetup` fails fast
  with that instruction when the build is missing. Tests never run against `pnpm dev`.
- **Each test gets a fresh browser context** (so a brand-new project, empty storage and no service worker) and the editor
  is already booted: `studio` is an automatic fixture. A test that must prepare the page first (stub a browser API with
  `addInitScript`) sets `test.use({ openEditor: false })` and calls `studio.open()` itself.
- **A browser error fails the test.** The automatic `problems` fixture fails any test during which the page threw or
  logged `console.error`. If a test provokes one on purpose, say so with `problems.allow(/pattern/)` and keep the pattern
  narrow.
- **No fixed sleeps as synchronisation.** Wait for the thing you expect (`expect(...).toBeVisible()`, `expect.poll`).
  `waitForTimeout` is only for "nothing should happen in this time" checks and for giving the game one input frame.
- **A bug you find is not a reason to weaken the test.** Write the test for the correct behaviour, mark it
  `test.fixme(...)` with a comment saying what is wrong and when to turn it into a plain `test`, and report the bug.
  Never delete or loosen an assertion to get green, and never leave a test flaky: run it with `--repeat-each` first.
- Strict TypeScript and the immutability lint apply here too. Collect browser events through the `problems` fixture or a
  helper with a file-level `eslint-disable` and a reason, as `support/fixtures.ts` does.

## Map

```
playwright.config.ts          web server (vite preview of the production build), Chromium, no retries, workers on CI
package.json
tsconfig.json
support/globalSetup.ts        fails fast, with the fix, when the editor has not been built
support/fixtures.ts           the `studio` and `problems` automatic fixtures
support/studio.ts             page object: queries, dispatch, menus, cell geometry, strokes, canvas snapshots
support/filesystem.ts         File System Access picker stub backed by the browser's private file system (OPFS)
support/downloads.ts          capture and unzip a download; build a zip to import
support/files.ts              generated PNGs and fake audio for upload tests
support/touch.ts              multi-finger touch (pan, pinch) through the DevTools protocol
support/videoReporter.ts      CI reporter: copies each test's video to playwright-videos/<spec>/<test>.<hash>.webm
support/gameServer.ts         serves an exported game over HTTP, recording every request
support/demoGame.ts           a small playable game built through project actions
test/app-shell.e2e.ts         boot, panels, console API
test/map-painting.e2e.ts      tile palette, pencil, eraser, fill, collision
test/map-view.e2e.ts          tools, zoom, overlays, panning
test/map-management.e2e.ts    maps and layers
test/properties-panel.e2e.ts  map properties, game start, events JSON
test/undo-redo.e2e.ts         undo, redo, shortcuts, the unsaved marker
test/database.e2e.ts          the schema-driven data grid
test/assets.e2e.ts            the asset browser and uploads
test/sprite-editor.e2e.ts     the embedded Piskel editor
test/project-files.e2e.ts     folders (save, open), replacing a project, leaving the page
test/import-export.e2e.ts     project zip download and import, game export
test/exported-game.e2e.ts     playing an exported game on desktop and on a phone
test/plugins.e2e.ts           plugins in exported games
test/companion.e2e.ts         the companion bridge with a real relay and agent
test/mobile.e2e.ts            the compact layout and touch gestures
test/pwa.e2e.ts               manifest, service worker, offline
```

## Running

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm build:app                                          # the app under test
pnpm --filter @rpgstudio/e2e exec playwright install --with-deps chromium   # once per machine
pnpm test:e2e                                                          # all specs
E2E_SHARD=3/4 pnpm test:e2e                                            # shard 3 of 4, as CI runs it
pnpm --filter @rpgstudio/e2e exec playwright test test/database        # one spec
pnpm test:e2e:ui                                                       # rebuild, then Playwright's UI (see below)
pnpm --filter @rpgstudio/e2e test:headed                               # watch a real browser window run the tests
pnpm --filter @rpgstudio/e2e test:debug                                # step through with the inspector
pnpm --filter @rpgstudio/e2e exec playwright show-report               # HTML report after a CI-style run
```

### Playwright UI

`pnpm test:e2e:ui` rebuilds the libraries and the app (so you never look at a stale build), then opens Playwright's UI mode.
It lists every spec; run one test, a spec or everything with the play buttons, and turn on **watch** (the eye) to rerun a test when
you save it. Select a test for its **time-travel trace**: every action with a before/after DOM snapshot, the network and console
logs, the error with the line of source, and a button to open the test in your editor. **Pick locator** lets you click an element
in the snapshot and copy a locator for it, which is the quickest way to write a new selector. Filter by title, spec, `@tag` or
status (passed, failed, skipped) at the top. UI mode records traces itself, so nothing in the config needs changing.

To skip the rebuild when only the tests changed: `pnpm --filter @rpgstudio/e2e test:ui`. The UI starts the preview server from
`playwright.config.ts` and reuses one that is already running on port 4173, so after changing app source rebuild first.

On a machine with no display (a container, a remote box) serve the UI and open it from your own browser:
`pnpm --filter @rpgstudio/e2e exec playwright test --ui-host=0.0.0.0 --ui-port=9323`, then visit `http://<host>:9323`.
The Playwright extension for VS Code offers the same run, debug and locator-picking from the editor, using this package's
`playwright.config.ts`.

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` points at an existing Chromium when `playwright install` cannot download one (a
sandbox with a pre-installed browser). Leave it unset otherwise. A failed test keeps a trace, screenshot and video under
`test-results/`; open the trace with `playwright show-trace`.

## Keeping the shards balanced

CI runs the suite as four shards (`E2E_SHARD=N/4`), and the four should take about the same time, because the slowest one
decides how long a pull request waits. Playwright's own `--shard` splits by test count, which put the slow specs together
(one shard took 6.7 minutes while another took 4.2), so `playwright.config.ts` does it by time instead:
`support/timings.json` holds the seconds each spec file's tests took, and `support/sharding.ts` deals the spec files out,
longest first, each into the shard with the least work so far. Whole spec files go to a shard, so a spec's worker-scoped fixtures
(the exported demo game) are built on one shard only.

**Rule: when the shards drift out of balance, refresh the timings and commit them.** Drift looks like this: in the Actions
run, the "Run the end-to-end tests" step of the slowest shard takes more than about 1.3 times the fastest one's (the install
and build steps do not count: they vary on their own), or you have added, removed or substantially changed specs. Then:

```sh
pnpm build && pnpm build:app
pnpm --filter @rpgstudio/e2e timings     # the whole suite, two workers like CI; rewrites support/timings.json
pnpm test                                # tooling/e2e-sharding.test.ts checks the new split is complete and balanced
```

Commit `support/timings.json`. The numbers do not have to be exact, only in proportion: a run on a laptop is fine, but it is
better to take them from CI, where the sum of a spec's test durations in the log of the shard that ran it gives the same figure.
A new spec with no entry is placed as an average one until the next refresh, and `pnpm test` reminds you to refresh. If one
spec file alone is longer than a quarter of the suite, split it into two files instead; balancing cannot divide a file.

## Patterns and traps

- **Where cells are.** The map is centred in the canvas until the user pans. `studio.cellPoint({x, y})` turns a cell into
  a page position for any zoom (it reads the zoom label; pass `{ zoom: 3 }` in the compact layout, where the label is
  hidden). At the default 300% a 20-wide map is wider than the canvas, so the outermost columns are scrolled out of view:
  paint away from the edges, or zoom out first.
- **Toasts share the `alert` role** with panel errors. `studio.status` is the editor's toast; `studio.dismissStatus()`
  clears it (also before a canvas snapshot, which it would overlap).
- **Names that include their children.** Rows in the layer list and maps list are buttons that contain icon buttons, so
  `getByRole('button', { name: 'Hide Objects' })` matches both: pass `exact: true`, or click the text
  (`studio.selectLayer`). The File ▸ Save item's name includes its shortcut: use the exported `SAVE` pattern.
- **Data grid checkboxes** rename themselves (`Select row` ↔ `Unselect row`) when toggled, so locate them by row, not by
  name. A refused cell edit stays in edit mode; press Escape to get the old value back.
- **Folders.** `stubDirectoryPicker` swaps `showDirectoryPicker` for one that answers from OPFS; `readFolder` and
  `seedFolder` look inside and prepare it.
- **The game polls input once per frame.** Two key presses in the same frame count as one confirm, so wait for each
  effect before the next press. `message` (the box) stays in the page, hidden, between messages: select it with a plain
  locator, not `getByRole`.
- **Wait on the game, not the clock.** The exported game exposes no state, so a test cannot read the player's position
  and must not sleep to let it move. Make the thing you wait for visible in the game: `addTransferNotices` (in
  `support/demoGame.ts`) adds an autorun message on arriving in each map, so a door's transfer is observed rather than
  guessed. Autorun messages only speak when nothing else is speaking, so something else speaking first (a probe, an
  NPC) keeps them quiet and the wait fails, which is what a "did not happen" check needs. Movement and collision
  themselves are covered by the engine's headless tests, not here.
- **The demo game is exported once per worker.** `exported-game.e2e.ts` extends the test with a worker-scoped `demoGame`
  fixture that builds the game in a throwaway editor tab and exports it; each test only serves those files (`serveFiles`)
  and plays them, so none boots the editor (`openEditor: false`). Treat its `entries` as read-only: a test that needs a
  broken game spreads them into a new object.
- **Games are served over HTTP** (`serveFiles`) because the player fetches its data; `file://` does not work.
- **Software GL.** The config passes `--use-angle=swiftshader` so Pixi has WebGL on machines without a GPU. Canvas snapshot
  comparisons are within one machine, never against stored images.
- **Known bugs are `test.fixme`.** Search for `fixme` in `test/` for the current list; each has a comment naming the cause.
