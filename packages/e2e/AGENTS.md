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
playwright.config.ts          web server (vite preview of the production build), Chromium, retries and workers on CI
package.json
tsconfig.json
support/globalSetup.ts        fails fast, with the fix, when the editor has not been built
support/fixtures.ts           the `studio` and `problems` automatic fixtures
support/studio.ts             page object: queries, dispatch, menus, cell geometry, strokes, canvas snapshots
support/filesystem.ts         File System Access picker stub backed by the browser's private file system (OPFS)
support/downloads.ts          capture and unzip a download; build a zip to import
support/files.ts              generated PNGs and fake audio for upload tests
support/touch.ts              multi-finger touch (pan, pinch) through the DevTools protocol
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
pnpm --filter @rpgstudio/e2e exec playwright test test/database        # one spec
pnpm --filter @rpgstudio/e2e exec playwright test --ui                 # watch, time-travel, pick locators
pnpm --filter @rpgstudio/e2e exec playwright show-report               # HTML report after a CI-style run
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` points at an existing Chromium when `playwright install` cannot download one (a
sandbox with a pre-installed browser). Leave it unset otherwise. A failed test keeps a trace, screenshot and video under
`test-results/`; open the trace with `playwright show-trace`.

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
  `seedFolder` look inside and prepare it. `removeDirectoryPicker` imitates Firefox and Safari.
- **The game polls input once per frame.** Two key presses in the same frame count as one confirm, so wait for each
  effect before the next press. `message` (the box) stays in the page, hidden, between messages: select it with a plain
  locator, not `getByRole`.
- **Games are served over HTTP** (`serveFiles`) because the player fetches its data; `file://` does not work.
- **Software GL.** The config passes `--use-angle=swiftshader` so Pixi has WebGL on machines without a GPU. Canvas snapshot
  comparisons are within one machine, never against stored images.
- **Known bugs are `test.fixme`.** Search for `fixme` in `test/` for the current list; each has a comment naming the cause.
