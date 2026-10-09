# Decision log

Architecture decisions, newest design assumptions first-class. Each entry says what was
decided, **why**, what it costs, and what was rejected, so a future change can be made
with the original reasoning in hand. If you reverse a decision, add a new entry and mark
the old one superseded rather than deleting it.

Contents: [001 Monorepo and the `source` condition](#adr-001-monorepo-and-the-source-export-condition) ·
[002 Immutability](#adr-002-immutability-by-lint-with-narrow-documented-exceptions) ·
[003 Zod as source of truth](#adr-003-zod-is-the-source-of-truth) ·
[004 Explicit recursive type](#adr-004-one-explicit-recursive-type-for-event-commands) ·
[005 ECS](#adr-005-ecs-with-boundary-validation) ·
[006 Deterministic headless engine](#adr-006-fixed-step-deterministic-engine-that-runs-without-a-browser) ·
[007 Grid movement and collision](#adr-007-tile-aligned-movement-and-per-cell-collision-flags) ·
[008 Event model](#adr-008-semantic-event-commands-with-a-compact-runtime-form) ·
[009 Rendering](#adr-009-pixel-perfect-rendering-choices) ·
[010 Textures](#adr-010-decode-textures-ourselves-and-cache-in-assetscache) ·
[011 One mutation path](#adr-011-redux-toolkit-with-one-pure-mutation-path) ·
[012 Undo](#adr-012-undo-as-middleware-over-structurally-shared-snapshots) ·
[013 Bytes outside Redux](#adr-013-binary-assets-live-outside-redux) ·
[014 Plugin model](#adr-014-capability-sandboxed-two-headed-plugins) ·
[015 Core features as plugins](#adr-015-first-party-features-are-plugins) ·
[016 Piskel](#adr-016-vendored-piskel-behind-a-validated-postmessage-adapter) ·
[017 Export](#adr-017-client-side-export-that-strips-sources-and-refuses-broken-games) ·
[018 Companion bridge](#adr-018-companion-bridge-topology-and-security) ·
[019 Persistence](#adr-019-file-system-access-api-with-a-zip-fallback) ·
[020 PWA](#adr-020-installable-pwa-with-a-relative-base) ·
[021 Toolchain](#adr-021-toolchain-versions) ·
[022 Vercel and pnpm](#adr-022-vercel-self-cleaning-install-and-pnpm-build-script-policy) ·
[023 Player bundle](#adr-023-the-player-is-one-self-contained-file) ·
[024 Docs checks](#adr-024-documentation-is-checked-by-tests) ·
[025 Mobile](#adr-025-mobile-support-one-layout-switch-gestures-as-a-pure-reducer-and-prompted-updates)

---

## ADR-001: Monorepo and the `source` export condition

**Decision.** One pnpm workspace with four packages. Each package's `package.json`
`exports` declares three conditions in this order: `source` (the TypeScript), `types`
(built `.d.ts`), `import` (built JS). Vite, Vitest, `tsc` and the dev server all enable
the `source` condition (`tooling/vite.ts`, `customConditions` in `tsconfig.base.json`).

**Why.** Development, tests and type checking should never depend on build order or on
a stale `dist/`. Consumers outside the monorepo (and Vercel's final build) use the
built output.

**Consequences.** A new package must copy the three config pieces or tests will silently
run against old builds (this happened: the engine tests initially imported a Phase-0
`dist`). `pnpm build` builds in topological order so declaration files exist when
dependants emit theirs.

**Rejected.** Turborepo (extra moving part, no need yet); TypeScript project references
(slower feedback, more config); path aliases (duplicated in every tool).

## ADR-002: Immutability by lint, with narrow documented exceptions

**Decision.** `functional/immutable-data` is an ESLint **error** everywhere. State updates
build new objects. It also flags `Map`/`Set` mutation, `Array` mutators, property
assignment and DOM property assignment, so code uses `setAttribute`, spreads, and
`toSorted`/`toSpliced`/`toReversed`.

**Why.** Reference equality is the backbone of the editor: React re-renders, the Pixi scene
rebuilding only changed layers, undo snapshots sharing structure, and "was this action
refused?" (`state === before`). Mutation anywhere silently breaks all four.

**Exceptions (and why each is safe).** Configured in `eslint.config.js` or as file-level
disables with a reason:

| Where                                                                                                                     | Why mutation is allowed                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `engine/src/ecs/**`, `engine/src/game/**`                                                                                 | The ECS tick: systems write component fields and simulation state with no copying or validation (architecture rule 5). Validation happens at entry points.                     |
| `engine/src/renderer/**`, `engine/src/player/**`, `engine/src/audio/pixiSoundBackend.ts`, `editor/src/canvas/mapScene.ts` | PixiJS is a retained-mode scene graph and `@pixi/sound` a mutable singleton; mutation is how they are used. They only _read_ game state.                                       |
| `core/src/schemas/refine.ts`                                                                                              | One inline disable in `issuesCheck`: Zod's check API appends to its own payload.                                                                                               |
| `core/src/math/pathfinding.ts`                                                                                            | A\* keeps a heap and visited tables local to one call; copying them each expansion would make search quadratic. Nothing escapes.                                               |
| `core/src/pixel/png.ts`, `editor/src/store/floodFill.ts`                                                                  | Filling freshly allocated buffers inside one call.                                                                                                                             |
| Test doubles (fake sockets, fake audio backend, the `@pixi/sound` mock)                                                   | They exist to record state by mutating. Marked per file, or inline with a reason in a few tests (`editor/test/export.test.ts`, `engine/test/{renderer,player,audio}.test.ts`). |

Everything else must comply. Reducers return new state instead of editing Immer drafts.

**Rejected.** Relying on Immer drafts and disabling the rule for reducers (hides real
violations); deep-freezing state at runtime (cost, and it does not help plugin authors).

## ADR-003: Zod is the source of truth

**Decision.** Every data model is a Zod 4 schema; types come from `z.infer`. Objects use
`z.strictObject`, so _unknown fields are rejected, not stripped_. Cross-field rules are
pure functions returning a list of problems, attached with `issuesCheck` (`schemas/refine.ts`).
Plugin-owned data goes in an `extensions` JSON record, never in ad-hoc fields.

**Why.** AI-generated data hallucinates fields; silently dropping them hides bugs and
accepting them corrupts projects. A single schema also gives free JSON Schema
(`z.toJSONSchema`, exposed to agents via `GET_SCHEMA`) and a validator for the editor, the
engine and the wire.

**Consequences.** Schemas carry defaults (`.default(...)`), so an _input_ and an _output_
type differ. Action payload types are the **output** type, which is why tests construct
records through `Schema.parse(...)`. `ProjectSchema` additionally checks references
(start map exists, actor→class, class→skills, enemy drops, `TransferPlayer` targets).

**Rejected.** TypeScript interfaces plus hand validation (drifts); `.passthrough()` /
`.strip()` (hides hallucinations); JSON Schema as the primary form (worse TS inference).

## ADR-004: One explicit recursive type for event commands

**Decision.** `ConditionalBranch` contains lists of commands, so the schema is recursive.
TypeScript's _declaration emit_ elides recursive Zod types to `any` after three levels,
which silently degraded the built `.d.ts`. The fix: `ConditionalBranchCommand` is an
explicit type (`z.infer` of the non-recursive head & `{ then; else }`), and
`EventCommandSchema` is annotated `z.ZodType<EventCommand>` so the compiler checks the
schema still produces that type. The runtime schema remains a discriminated union.

**Why.** Exactly one node needs hand-help; everything else is still inferred.

**Consequences.** If you add another recursive structure, do the same, and verify with
`pnpm build` (declaration emit), not only `pnpm typecheck`, which uses source and hides it.

## ADR-005: ECS with boundary validation

**Decision.** The engine uses `miniplex`: entities are plain objects typed from Zod
component schemas (`Position`, `Movement`, `SpriteData`, `Collision`, `EventTrigger`).
Systems mutate component fields directly. Components are added/removed with
`world.addComponent`/`removeComponent`/`update` (never by property assignment) so
miniplex queries stay correct.

**Why.** 60 ticks per second and thousands of headless ticks per second leave no room for
per-tick validation. Entities only come from validated data (map load, save restore), so the
types are trustworthy.

**Consequences.** Anything that creates an entity from outside data must validate first.
`game.addSystem` runs plugin systems after the built-in ones.

## ADR-006: Fixed-step, deterministic engine that runs without a browser

**Decision.** One tick = 1/60 s. `createGame` has no DOM, window or WebGL dependency; the
engine's _root_ entry never imports PixiJS (a test scans sources to enforce it), and the
renderer/audio/player are separate entry points. Randomness is a seeded, serialisable RNG;
time only enters as ticks. `createHeadlessGame` wraps it for scripts: `simulateTicks`, `step`,
`hold`, `walkTo` (A\*-driven), a recording audio port, and message capture.

**Why.** Headless play is a first-class requirement: AI playtesting, balance simulation and
fast deterministic tests. Determinism makes saves exact and bugs reproducible.

**Consequences.** Never use `Math.random`, `Date.now` or wall-clock time in simulation code.
The browser loop converts frame time to ticks with `createFixedStepClock` (bounded catch-up,
with an epsilon so 144 fps × 1000/144 ms yields exactly 60 ticks).

## ADR-007: Tile-aligned movement and per-cell collision flags

**Decision.** An entity is idle on a tile or part-way through a one-tile step; progress
advances `speed / 60` per tick (default 4 tiles/s = exactly 15 ticks, with a 1e-9 epsilon),
and surplus progress carries into the next step so held input moves at exactly `speed`.
Collision is a per-cell bitmask: `SOLID`, plus `BLOCK_UP/DOWN/LEFT/RIGHT` for one-way ledges
(checked on both the cell being left and the cell being entered). Moving entities _reserve_
their destination tile.

**Why.** Matches RPG Maker semantics, keeps pathfinding on a grid, and makes simulations
exact. Per-cell flags (not per-tile-id) keep AI authoring simple: `setCollision` on cells.

**Consequences.** Input held on the arrival tick starts the next step immediately, so a
"tap" is `hold(dir, 1)` then settle (`headless.step`). Keyboard taps shorter than a frame are
latched so they are not lost.

## ADR-008: Semantic event commands with a compact runtime form

**Decision.** Events are JSON arrays of semantic commands (`{"command":"ShowText",…}`). A
lossless compact form (`[code, …params]`) exists in core (`compileCommands` /
`decompileCommands`) for shipping size. Pages follow RPG Maker rules: the highest page whose
conditions hold is active; triggers are `action`, `touch`, `autorun`, `parallel`. An event
runs on the tick that triggers it (up to its first wait), and dismissing the last message
ends the event that same tick.

**Why.** Semantic JSON is what humans and models write well; the compact form is a build
detail. Responsiveness matters in a game.

**Consequences.** `Wait N` blocks exactly N ticks. Saving is refused while an event runs
(it would drop the interpreter), via `game.canSave()`.

## ADR-009: Pixel-perfect rendering choices

**Decision.** PixiJS 8 with `scaleMode: 'nearest'` set globally
(`configurePixelArtDefaults`) and on every texture we create; `antialias: false`,
`roundPixels: true`; the view is scaled by a **whole number** and letterboxed; the camera
position is rounded. `@pixi/tilemap` batches each layer group into one draw call. A layer's
`above: true` flag draws it over characters (roofs). The editor keeps one tilemap **per
layer** so it can dim/hide layers and rebuild only the one that changed.

**Why.** Sub-pixel smoothing and fractional scaling destroy pixel art. In PixiJS 8,
`SCALE_MODES.NEAREST` is the string `'nearest'`.

**Consequences.** HiDPI is handled by computing the integer scale in physical pixels and
dividing by the renderer resolution.

## ADR-010: Decode textures ourselves and cache in `Assets.cache`

**Decision.** `createAssetTextureProvider` takes a `loadBlob(path)`, decodes with
`createImageBitmap` into a nearest-neighbour `Texture`, and registers it in `Assets.cache`
under the project path. `invalidate()` calls `Assets.cache.reset()` and bumps a generation
counter so in-flight loads that started before the reset are not cached.

**Why.** PixiJS's loader chooses parsers by file extension, which does not work for
`blob:` URLs the editor needs. Decoding ourselves removes that fragility and keeps one code
path for the player (fetch) and the editor (asset store). `Assets.cache.reset()` is the
live hot-reload hook the architecture requires.

## ADR-011: Redux Toolkit with one pure mutation path

**Decision.** Project edits are 16 serialisable actions whose payload schemas live in core
(`schemas/actions.ts`). `store/projectOps.ts` implements all of them as pure
`(Project, action) → Result<Project>`; reducers call it. Tile operations validate only their
inputs (cheap); relationship-changing operations validate the whole candidate with
`ProjectSchema` (rare, and guarantees consistency).

**Why.** The UI, plugins, the console API and AI agents must behave identically and be
explainable. A pure function can be dry-run, so a batch can be applied all-or-nothing and a
refusal can carry a precise reason. Action payload schemas in core let the bridge and the
editor share one contract.

**Consequences.** To change what an edit does, change `projectOps`, never a component. A
refused action returns the _same state object_ (reference equality), which history and React
rely on. Slice objects are not exported with inferred types (Immer draft types leak into
`.d.ts`); the action-creator types are written out explicitly.

## ADR-012: Undo as middleware over structurally shared snapshots

**Decision.** `history` is a Redux middleware (not a reducer enhancer). Before an undoable
action it remembers `state.project`; if the action changed it, the snapshot is pushed (max
200). Because reducers share untouched structure, snapshots are cheap. `meta.historyGroup`
values equal on consecutive actions coalesce into one step; the project's `revision` travels
with the snapshot so undoing back to the saved revision reads as clean.

**Why.** Brush strokes and AI batches are many actions but one user-visible step.

**Consequences.** Undoable action types are derived from `ProjectActionSchema`, so a new
action is undoable automatically. `projectLoaded` clears history.

## ADR-013: Binary assets live outside Redux

**Decision.** `AssetStore` holds file bytes and tracks unsaved writes/removals. Redux has an
`assets` slice with only sorted paths and a per-path version counter, kept in sync by the
session.

**Why.** Bytes are not serialisable (Redux Toolkit warns and slows), and copying them
through state would be pointless. Versions let React refresh a preview.

## ADR-014: Capability-sandboxed, two-headed plugins

**Decision.** A plugin is a directory with a `manifest.json` and up to three entry modules:
`shared` (loaded everywhere), `editor`, `engine`. The editor loads `shared`+`editor`; the
exported game loads `shared`+`engine`; the other head is never read (a test asserts the
importer is never even asked for it). A plugin receives a frozen context whose capability
properties are getters that **throw** unless the manifest declared them. Hosts provide
capabilities (editor: `store`, `ui`, `files:read`, `files:write`; engine: `ecs`, `audio`;
both: `events`, `schemas`, `log`). Modules are loaded with `import()` of a Blob URL (data URL
fallback in Node), so they cannot `import` anything: the host passes shared libraries in
(`ctx.schemas.z` is the host's Zod; `ctx.ui.kit` is React and a MUI subset).

**Why.** Plugins are untrusted third-party code in a PWA. Capability injection, declared
up front, plus separate heads, is enforceable: no editor/React code can reach an exported
game, and a plugin cannot touch what it did not ask for.

**Consequences.** `render` is a valid manifest capability name but no host provides it yet,
so a plugin declaring it is rejected at registration with a clear message. Plugins that
write files may only touch `img/`, `audio/` and their own `plugins/<id>/` folder. Teardown
runs disposers last-in-first-out and a failed init rolls back plugins initialised earlier
in the same call. See [plugins.md](plugins.md).

## ADR-015: First-party features are plugins

**Decision.** The map editor, database editor and sprite editor register their panels via
`ctx.ui.registerPanel` in `plugins/corePlugins.ts`, using the same manager and
capabilities as third parties. They are bundled, not blob-loaded.

**Why.** "Third-party developers have the exact same capabilities as first-party tools" is
only true if first-party tools have no back door. It also keeps `MasterLayout` ignorant of
specific features.

## ADR-016: Vendored Piskel behind a validated postMessage adapter

**Decision.** Piskel (Apache-2.0) has no npm release and no postMessage API. We build a
pinned upstream commit with its own Grunt toolchain (`scripts/vendor-piskel.ts`), strip
unused files, commit the result to `public/piskel/` with its LICENSE, and inject a small
TypeScript adapter (`scripts/piskel-adapter.ts`). The editor-side bridge speaks a
Zod-validated protocol (`open`, `requestSave` ↔ `ready`, `opened`, `saved`, `error`), accepts
messages only from the iframe's own window and the editor's origin, and writes the returned
PNG and `.piskel` into the project. The iframe is `sandbox="allow-scripts allow-same-origin
allow-downloads allow-modals"` (no top navigation, no popups).

**Why.** A real pixel editor with layers and frames, embedded, offline-capable, with no
network calls (verified: the build only contains user-clickable outbound links).

**Consequences.** `allow-same-origin` is needed for Piskel's own storage, so the sandbox is
a hardening layer, not a boundary; the origin/source checks are what matter. Piskel's own
code is unmodified; the generated adapter is the only addition. Regenerating deletes the
folder, so restart the Vite dev server afterwards. Piskel's deserializer takes the _parsed_
document, not JSON text.

## ADR-017: Client-side export that strips sources and refuses broken games

**Decision.** `buildExportEntries` assembles `index.html`, `game.json`, project JSON, images
(`png/jpg/jpeg/gif/webp/avif`), audio (`ogg/mp3/m4a/wav`), each enabled plugin's `manifest`,
`shared` and `engine` files, and `engine/player.js`. It omits `.piskel` and any other file,
and **throws `ExportError`** (listing every problem) for a missing/mismatched/broken plugin,
an unmet plugin dependency, a map tileset not in the project, or a missing engine build.
Zipping uses fflate's async `zip` (a Web Worker in browsers); already-compressed formats are
stored, not deflated.

**Why.** No native toolchain; works offline; never ships authoring sources or editor code;
never ships something that cannot run. `game.json` exists because static hosts cannot list
directories.

## ADR-018: Companion bridge topology and security

**Decision.** The **editor dials out** to a local relay (default `ws://localhost:8080`);
agents dial in. The relay routes requests to the editor and answers back to the asking
agent (ids are rewritten so agents cannot collide). Defence in depth against a web page
reaching `localhost`:

- binds `127.0.0.1` by default;
- a connection with an `Origin` header is **never** an agent (browsers always send one; this
  stops cross-site WebSocket hijacking of the editor) and is accepted as the editor only from
  an allowed origin;
- optional shared `--token` for both roles;
- each direction accepts only its own message set, so an agent cannot forge an editor
  result and the editor cannot issue requests;
- 16 MB max message, 30 s request timeout, close codes 4000/4400/4401/4403/4408.

Semantic validation lives in the editor: `ProjectActionSchema`, a dry run on a working copy
(a batch applies nothing if any action fails), one history group per request, and asset
writes limited to images/audio/`.piskel` under `img/` or `audio/`, ≤ 12 MB.

**Why.** The editor is a browser app and cannot listen; the relay is the rendezvous. The
server stays dumb so a Python (or any) agent can implement the protocol.

## ADR-019: File System Access API with a zip fallback

**Decision.** On Chromium, Open/Save use a directory handle behind a `ProjectFileSystem`
interface (an in-memory implementation exists for tests). `saveProject` writes only changed
files (it caches the last text per data file and tracks unsaved asset writes/removals) and
deletes files for removed maps/assets, leaving unrelated files alone. Elsewhere, Download /
Import project (.zip) round-trips everything including `.piskel`.

**Consequences.** Archive import rejects path traversal and expansion beyond 512 MB.

## ADR-020: Installable PWA with a relative base

**Decision.** `vite-plugin-pwa` (generateSW) with `base: './'`, precache of the app shell,
engine player and Piskel (≤ 6 MB per file), `navigateFallback` denying `/piskel/`. The
service worker registers only in production. Icons are generated by our own PNG encoder
(`pnpm --filter @rpgstudio/editor icons`).

**Why.** Offline authoring is a design goal; relative URLs let the same build run at a domain
root or sub-path. A dev service worker would only get in the way of HMR.

## ADR-021: Toolchain versions

**Decision.** TypeScript is pinned to `~6.0.x` because `typescript-eslint` 8 declares a peer
range `<6.1`. Other majors: Vite 8 (Rolldown), Vitest 5, ESLint 10 with flat config,
`eslint-plugin-functional` 10, Zod 4, React 19, MUI 9, Redux Toolkit 2, PixiJS 8,
`@pixi/tilemap` 5, `@pixi/sound` 6, `miniplex` 2, `fflate` 0.8.

**Consequences.** Upgrading TypeScript past 6.0 needs a `typescript-eslint` that supports it.
Vite 8 needs Node ≥ 20.19 / 22.12; the repo requires Node ≥ 22. PixiJS 8 changed the API
(`'nearest'` string, `TextureStyle`, `Application.init`).

## ADR-022: Vercel self-cleaning install and pnpm build-script policy

**Decision.** `vercel.json` uses
`installCommand: "rm -rf node_modules packages/*/node_modules && pnpm install --frozen-lockfile"`.
`pnpm-workspace.yaml` records `allowBuilds: { esbuild: false }`.

**Why.** Vercel restores the previous deployment's build cache. After the rewrite it
contained `packages/*/node_modules` from the old layout whose `vite` shims pointed at files
that no longer existed (`MODULE_NOT_FOUND`), and a plain install does not clean them.
Separately, pnpm 12 makes `install` exit 1 when a dependency's build script is neither
allowed nor denied (`ERR_PNPM_IGNORED_BUILDS`); `esbuild`'s postinstall is an optional
optimisation, so it is denied explicitly.

**Consequences.** The install is a few seconds slower. Do not simplify the install command.
Any new dependency with a build script needs an explicit allow/deny.

## ADR-023: The player is one self-contained file

**Decision.** `engine/vite.player.config.ts` bundles PixiJS and the engine into a single
minified `dist-player/player.js` (`codeSplitting: false`) with
`define: { 'process.env.NODE_ENV': '"production"' }`. The editor ships it at
`engine/player.js`; an exported game imports `startPlayer` from it.

**Why.** Library-mode builds leave `process.env.NODE_ENV` unreplaced; a dependency reads it,
and browsers have no `process`, so the first exported game crashed on load (found by running
one). `test/playerBundle.test.ts` builds the real bundle and rejects Node-only globals and
any editor code.

## ADR-024: Documentation is checked by tests

**Decision.** `tooling/docs.test.ts` fails when a Markdown link or in-text repository path
points at nothing, a heading anchor is wrong, a package lacks an `AGENTS.md`, or a project
action, query, schema name, event command, plugin capability or close code is missing from
the docs that must list it.

**Why.** Docs for agents are only useful if they stay true, and the cheapest way to keep
them true is to make drift a test failure.

## ADR-025: Mobile support: one layout switch, gestures as a pure reducer, and prompted updates

**Decision.**

1. The editor has two layouts chosen by `useLayoutMode()` (width below 900 px is _compact_;
   orientation only places the sheet). Compact folds every docked panel into a bottom sheet driven
   by a navigation bar. Panels and the panel registry are unchanged.
2. Touch gestures on the map are a pure reducer (`canvas/gestures.ts`) that emits intents
   (`paintStart`, `pan`, `zoom`, ...); `MapCanvas` only applies them. Mouse input keeps its old path.
   A **Pan** tool exists for single-pointer panning.
3. The player shows an on-screen D-pad and action button on coarse-pointer devices, as another
   `PlayerInput` merged with the keyboard.
4. The service worker uses `registerType: 'prompt'`: a new version waits until the user accepts it
   from an in-app notice.

**Why.** A phone cannot fit three columns, but forking the panels or the layout per device would
double every future feature; folding the docks into a sheet keeps one set of panels. A finger
that is first down may be the start of a two-finger gesture, so painting waits for movement; as a
pure function that rule is unit-tested, which a canvas listener cannot be. Zoom levels are whole
numbers (pixel-perfect rendering), so a pinch steps rather than scales continuously. Auto-update
reloaded the page the moment a release shipped, which would silently discard unsaved work in a tool
whose projects live in memory until saved.

**Consequences.** Piskel (the sprite editor iframe) and the data grid are not yet touch-optimised.
Portrait games use the same 20x15-tile view as landscape; a narrower `viewTiles` is a possible
later choice. With several editor tabs open, only the tab that clicks Reload is reloaded.

## ADR-026: End-to-end tests with Playwright against the production build, required for every non-trivial feature

**Decision.**

1. `packages/e2e` runs Playwright (Chromium) against `vite preview` of the **production build** of the editor, and against games
   exported from it, with WebGL through SwiftShader. A GitHub Actions workflow runs the suite on every pull request (once,
   on the pull request merged into its base) and on every push to `main`.
2. Tests act through the UI and read the result back through `window.RPGStudio.query`, the read path an AI agent already has.
3. Anything outside the page is real where it can be: the companion tests start the real relay and agent library, the game tests
   serve the real export over HTTP, the folder tests give the editor real directory handles from the browser's private file
   system and stub only the picker.
4. A test is required, in the same piece of work, for every non-trivial feature and every browser-visible bug fix. A bug found by
   writing a test is recorded as `test.fixme` with its cause, never as a weakened assertion.

**Why.** Unit and jsdom tests could not see a canvas that stops redrawing, a data grid that ignores select-all, a save that skips
a file, a service worker that breaks offline use or a game that loads editor code; the writing of this suite found several. The
production build is what users run: minification, the service worker and the engine-player plugin only exist there. Reading the
project back, rather than comparing pixels, keeps tests stable across GPUs and fast to write. A rule that lives in `AGENTS.md`
is the only thing that keeps coverage from decaying as features are added.

**Consequences.** The suite needs the build first and does not notice a stale one. It runs desktop Chromium plus its phone
emulation only; Firefox and Safari are reached through the no-folder-picker path. It takes around ten minutes, so it is not part of
`pnpm test`. Software GL means no stored screenshots. The service worker's update prompt cannot be provoked without two
deployed versions and is covered by component tests only.
