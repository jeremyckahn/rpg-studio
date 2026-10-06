# Troubleshooting and gotchas

Each entry is a failure that actually happened while building this project. Format: **symptom → cause → fix**.

## Build and tooling

### pnpm install exits non-zero

_Symptom:_ `ERR_PNPM_IGNORED_BUILDS: Ignored build scripts: esbuild@…`, exit code 1, though packages did install.
Easy to miss if you pipe the command through `tail`. _Cause:_ pnpm 12 fails when a dependency has a postinstall script
that is neither allowed nor denied. _Fix:_ `pnpm approve-builds '!pkg'` (deny) or `pnpm approve-builds pkg` (allow); it writes
`allowBuilds` into `pnpm-workspace.yaml`. Commit it. Verify with `pnpm install --frozen-lockfile; echo $?`.

### `pnpm build` fails but `pnpm typecheck` passes

_Cause:_ typecheck resolves workspace packages from source; `build` emits declarations against each package's built `.d.ts`,
which has extra constraints. Two known ones:

- **TS4023 "has or is using name 'WritableNonArrayDraft' … cannot be named"**: an exported Redux slice/action creator has an
  inferred type containing Immer's unexported draft types. Export explicitly typed creators and reducers instead
  (`ProjectActionCreators`, `HistoryActionCreators`) and do not export the slice.
- **A type degrades to `any`/`Record<string, unknown>` for consumers** after a few levels: declaration emit elided a
  recursive Zod type. That is why `ConditionalBranchCommand` is written out
  ([ADR-004](decisions.md#adr-004-one-explicit-recursive-type-for-event-commands)). Always run `pnpm build` after touching
  exported schema types.

### Tests pass but use old code

_Cause:_ a Vitest config without `sourceResolve` / `sourceSsr` / `workspaceServerDeps` loads `@rpgstudio/*` from `dist/`.
_Symptom:_ `createStarterProject is not a function` right after adding it, or behaviour that ignores your edit. _Fix:_ copy the three
settings from an existing `vitest.config.ts` ([tooling-and-deployment.md §3](tooling-and-deployment.md#3-the-source-export-condition)).

### Scripted edits silently do nothing

_Cause:_ Prettier re-wrapped the line you tried to match. `str.replace(old, new)` returns the string unchanged and no error is
raised. _Fix:_ use an edit tool that fails when the text is absent; assert in scripts (`assert old in s`); run `pnpm format` before and after.

### Lint says "Modifying an array/map/existing object is not allowed"

`functional/immutable-data` also flags `Map.set/delete`, `Set.add`, `Object.defineProperty`, `el.width = …` and `typedArray`
writes in some forms. Use spreads and `filter/map/toSorted`, `new Map([...old, [k, v]])`, `setAttribute`, `Reflect.set`. For a
justified local exception use a **file-level** disable with a reason ([ADR-002](decisions.md#adr-002-immutability-by-lint-with-narrow-documented-exceptions)).

### Lint says "Calling setState synchronously within an effect" / "Cannot access refs during render"

React Compiler rules. Reset state by giving the component a `key` that changes with the value, or set state inside an async
callback. Do not read `ref.current` inside a closure created during render and passed to a helper. Reset a file `<input>` by
bumping a `key`.

### Zod: `ctx.issues.push` is flagged

Cross-field validation must return a list from a pure function and attach it with `.check(issuesCheck(fn))`; the single
mutation Zod's payload needs is inside `issuesCheck`.

### `node --experimental-strip-types` fails on core

`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX: TypeScript parameter property is not supported`. Core's error classes use parameter
properties. Run scripts against built output (`pnpm build` first) or use `tsx --conditions=source`.

## Vercel

### `MODULE_NOT_FOUND …/packages/core/node_modules/vite/bin/vite.js`

Stale restored build cache with per-package `node_modules` from the old layout. The self-cleaning `installCommand` in `vercel.json`
fixes it; do not simplify the command. One-off manual alternative: redeploy without the build cache.

### Deployments fail but a local clean clone builds

Read the real log: `npx vercel login`, then `npx vercel inspect <url> --logs`. Compare Node version, install exit code, and cache
restoration lines. Remember `pnpm install` can fail on blocked build scripts (above), and that Production deployments of `main`
are what you are looking at until a branch/PR creates a Preview.

### The `*.vercel.app` URL redirects to a login

Deployment protection (SSO) is on in the Vercel project settings. Use `npx vercel curl <path> --deployment <url>` to fetch
authenticated, or change the setting.

## Editor

### Sprite editor says "did not respond" or stays on "Loading Piskel…"

- `public/piskel` missing → `pnpm --filter @rpgstudio/editor piskel:vendor`.
- Just regenerated it → **restart the Vite dev server** (it deletes and recreates the folder; Vite's static cache serves the SPA fallback
  HTML for the adapter and 404s the bundle).
- Adapter not running → the vendor script injects before the **last** `</body>` (earlier ones are inside HTML template strings).

### Piskel throws `a.map is not a function` on open

`Deserializer.deserialize` takes the **parsed** document (`{ modelVersion, piskel }`), not JSON text, and has an `onError` callback.

### A saved sprite does not appear on the map

Writes must go through the `AssetStore` (via `ctx.writeFiles`, the session, or the bridge) so the texture cache is reset. Writing to
the file system or to a local variable bypasses invalidation.

### Undo does not revert my change

Only the sixteen `project/*` actions are undoable (derived from `ProjectActionSchema`). UI state, asset writes and plugin slices are
not. A brush stroke is one step only if every dispatch shares `meta.historyGroup`.

### Export refuses with "engine player is missing"

`packages/engine/dist-player/player.js` does not exist or is not served. `pnpm dev` builds it; otherwise
`pnpm --filter @rpgstudio/engine build`. In `build:app` the Vite plugin fails the build for the same reason.

### My edit through the console/bridge was "refused"

That is the validation working. The error names the action index and the reason ("Cell (99, 0) is outside the 6x4 map",
"Actor 1 references missing class 99"). Fix the input; do not loosen the check.

## Engine and exported games

### An exported game shows a black page and `process is not defined`

The player bundle must define `process.env.NODE_ENV` (`vite.player.config.ts`). `engine/test/playerBundle.test.ts` builds the real
bundle and fails on Node-only globals.

### The player ignores a quick key tap

Fixed: `createKeyboardInput` latches a press until the next poll. If you replace it, keep that behaviour.

### Movement is off by one tick, or a step overshoots

Compare progress with `1 - STEP_EPSILON` (float drift: `4/60` added 15 times is not exactly 1), carry surplus progress, and base
auto-walking on the tile the entity will occupy _after_ the step in flight (see `walkTo`).

### Audio does not start in the browser

Browsers need a user gesture; `installAudioUnlock` calls `unlock` synchronously inside the gesture. Streaming for BGM/BGS
depends on the `sound.useLegacy` toggle in `pixiSoundBackend.ts`, which is untested outside mocks.

### `restore` fails with a reason

By design it applies nothing unless the whole save is consistent with the project (map, bounds, actors, event ids).

## Companion bridge

### The editor will not connect

Look at the Companion dialog's message. Close code 4403 means the page's origin is not in the server's allow-list (the
message names the page's origin and gives the exact `pnpm dev:companion --allow-origin <url>` command; options go straight
after the command, a `--` separator makes pnpm drop them); 4401 means a token mismatch; "Could not reach … retrying" means the server is not running. The editor stops retrying
after 4400/4401/4403.

### An agent is rejected immediately

An agent connection that carries an `Origin` header (any browser) is refused on purpose. Run agents as scripts.

### Tests print `ECONNREFUSED` or crash on a socket `error`

`ws` throws on an unhandled `error` event; a browser WebSocket does not. In test adapters add `socket.on('error', () => undefined)`.

## Verifying in a browser

Pane/viewport size can change between a screenshot and the next click, so coordinates go stale: take a screenshot immediately
before clicking, and prefer `find`/refs where possible. `findBy*` in RTL can return an element that is about to be replaced; wait for the new value.

## Known rough edges

Behaviours that look like bugs but are current, documented state:

- **Two editor tabs evict each other.** The relay keeps one editor; a second tab replaces the first with close code 4000, and
  the client retries after 4000, so two tabs on the same relay take turns indefinitely. Use one editor tab per relay.
- **Some core events are declared but never emitted.** `CoreEventMap` lists `asset:changed`, `game:saved` and `game:loaded`;
  nothing publishes them yet, and `publishEditorEvent` is unused. Do not rely on them until something emits them.
- **A plugin whose `initialize` throws stays `failed`.** Later `initialize()` calls do not retry it; fix the plugin and reload.
- **`createGameRenderer` shows 20×15 tiles by default** (`viewTiles`); pass `viewTiles` for a different viewport.
- **`connectAgent.waitForEditor` times out after 10 s by default**; pass a longer timeout if the editor is slow to attach.
