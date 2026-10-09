# Engine (`@rpgstudio/engine`)

The runtime that executes a project. Four entry points with different environment
requirements:

| Import                       | Contents                                                                | Needs a browser?                  |
| ---------------------------- | ----------------------------------------------------------------------- | --------------------------------- |
| `@rpgstudio/engine`          | `createGame`, ECS, systems, headless harness, plugin host, clock        | **No.** Must never import PixiJS. |
| `@rpgstudio/engine/renderer` | `createGameRenderer`, tilemap batching, viewport math, texture provider | Yes (WebGL)                       |
| `@rpgstudio/engine/audio`    | `createAudioManager`, `@pixi/sound` backend, gesture unlock             | Yes                               |
| `@rpgstudio/engine/player`   | `startPlayer`, bundle loader, keyboard input, message box               | Yes                               |

`test/headless.test.ts` scans `src/ecs`, `src/game`, `src/headless` and fails on any
`pixi`/`@pixi` import or `window.`/`document.` use. Keep the split.

## 1. Source map

```
src/ecs/entity.ts            Entity type (components typed from core) and createWorld()
src/ecs/systems/movement.ts  grid movement, collision, step bookkeeping
src/ecs/systems/event.ts     page selection, triggers, foreground/parallel interpreters
src/game/types.ts            GameInput, GameState, Runtime, AudioPort, GameEventMap, constants
src/game/game.ts             createGame: state, loadMap, tick, serialize/restore, snapshot
src/game/interpreter.ts      event command execution (messages, waits, branches, audio…)
src/game/party.ts            stat growth, createPartyMember
src/game/clock.ts            fixed-step clock for frame-time → ticks
src/headless/harness.ts      createHeadlessGame and the recording audio port
src/plugins/host.ts          engine-side plugin manager (ecs + audio capabilities)
src/renderer/*               PixiJS: pixelArt, viewport, characters, tilemapPlan, tilemap,
                             textures, sprites, gameRenderer
src/audio/*                  manager (tiers), unlock, pixiSoundBackend
src/player/*                 main (startPlayer), bundle (loadGameBundle), input, touchControls, messageBox
```

## 2. The simulation

### Time and determinism

One **tick** is 1/60 s (`TICKS_PER_SECOND = 60`). All durations are ticks. Randomness is
`game.state.rng` (a seeded, serialisable mulberry32). The simulation reads no clock and
uses no `Math.random`. Given the same project, seed and per-tick inputs, two runs match
exactly, including their serialised saves (tests assert it).

### `createGame({ project, seed?, audio? })` → `Game`

`project` must already be a validated `Project`. (`createHeadlessGame` validates untrusted
JSON for you.) `Game`:

| Member                                           | Purpose                                                                           |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| `tick(input?)`                                   | Advance exactly one tick                                                          |
| `state`                                          | Read-only view of `GameState` (renderers and tools read it; never write)          |
| `world`                                          | The miniplex `World<Entity>`                                                      |
| `bus`                                            | `EventBus<GameEventMap>` for notifications                                        |
| `addSystem(fn)`                                  | Register a per-tick system that runs after the built-ins; returns a remover       |
| `canSave()` / `serialize()` / `restore(unknown)` | Save games (§5)                                                                   |
| `snapshot()`                                     | Plain-data summary: tick, map, player, switches, variables, message, eventRunning |

`GameInput` is `{ direction: Direction | null, confirm: boolean }`. `confirm` is **true only
on the tick of the press** (an edge); `direction` is "held this tick".

### Tick order (`game.ts`)

1. **Input:** if no foreground event is running, `player.movement.intent = input.direction`.
2. **`movementSystem`**
3. **`eventSystem`**
4. **Plugin systems** (`game.addSystem`)
5. `state.tick += 1`

### Entities

`Entity` (typed from core's component schemas): `kind: 'player' | 'event'`, optional
`position`, `movement`, `sprite`, `collision`, `eventTrigger`, plus `eventId` and
`activePage` for event entities. The player is created at the project's start tile with
the first starting-party actor's sprite (a pink marker is drawn if there is none). Map
events become entities on every `loadMap`. Add/remove components with
`world.addComponent`, `removeComponent`, `update` so queries stay correct.

### Movement (`systems/movement.ts`)

- Idle entities with an `intent` try to start a step: they **always turn** to face the
  request, and move only if `canStep(map, position, direction)` allows it **and** no solid
  entity occupies or is moving into the target tile (moving entities reserve their target).
  A blocked step toward an entity records a `bump`.
- A step advances `speed / 60` per tick (default 4 tiles/s). When progress reaches 1
  (minus 1e-9) the entity arrives, an `arrived` record is queued, and if it still has an
  intent it starts the next step immediately carrying the surplus progress.
- Consequences worth knowing: input held on the arrival tick keeps walking; a direction
  change mid-step takes effect at the tile boundary; a "tap" that moves exactly one tile is
  1 tick of input then settle (`headless.step(dir)`).

### Events (`systems/event.ts`, `game/interpreter.ts`)

- **Page refresh** (`refreshPages`): when switches/variables change (`pagesDirty`) or a map
  loads, each event picks its highest valid page and its components are updated: trigger,
  `solid`, `graphic` → `sprite`. A parallel page registers a _background interpreter_; no
  valid page removes the event's trigger/collision/sprite.
- **Foreground interpreter:** at most one. It blocks the player (input is ignored while it
  runs). `ShowText` sets `state.message` and waits for `confirm`; `Wait N` blocks N ticks;
  branches push a frame; `TransferPlayer` calls `loadMap`.
- **Starting events:** `touch` (the player _arrived_ on a non-solid event's tile, or _bumped_
  a solid one), `action` (confirm pressed while idle: an event on the player's tile if
  non-solid, or on the faced tile if solid), `autorun` (starts whenever nothing else runs and
  repeats until its page stops being valid). An event runs up to its first wait on the
  tick it starts, and confirming the last message finishes it on that tick.
- **Parallel:** background interpreters run every tick alongside everything else and restart
  when they finish.
- Nothing new starts on a tick where the foreground event ended or is running.

### Map loading and transfers

`loadMap(id, x, y, direction?)` swaps `state.map`, removes every non-player entity,
clears background interpreters, spawns event entities, places the player, applies map
`bgm`/`bgs` through the audio port (not restarting a track already playing), refreshes
pages and emits `mapLoaded`. An invalid map/cell throws `GameError` (reachable only with
unvalidated data; `ProjectSchema` rejects such transfers).

### Notifications (`GameEventMap`)

`message`, `messageClosed`, `mapLoaded`, `eventStarted`, `eventFinished`, `switchChanged`,
`variableChanged`, `stepped`, `loaded`. Used by the message box UI and available to plugins
via the engine host.

## 3. Save games

`game.serialize()` returns a validated `SaveState` (throws `GameError` if an event is
running; check `canSave()`). `game.restore(input)` validates the schema, then checks the
map exists, the player and each saved event are inside it, and party actors exist. Only if
everything passes does it apply anything, so a bad save leaves the game untouched. It
reloads the map, restores positions, tick, RNG, party, switches, variables, inventory and
gold, refreshes pages and emits `loaded`. Running events and mid-step progress are not
saved (a mid-step save records the destination tile).

## 4. Headless harness (`headless/harness.ts`)

```ts
const h = createHeadlessGame(projectJson, { seed: 1 }) // validates with ProjectSchema
h.simulateTicks(600, { direction: 'right', confirm: false }) // or (tick) => GameInput
h.step('up') // exactly one tile, then settle
h.hold('left', 30)
h.pressConfirm()
h.walkTo({ x: 12, y: 4 }) // A*, routes around walls and solid events; reports why it stopped
h.messages() // every message shown so far
h.audio.calls() // what the audio port was asked to play
h.game.serialize()
```

`walkTo` returns `{ reached, ticks, reason? }` where `reason` is `event` (an event took
control), `no-path` or `timeout`. It computes direction relative to the tile the player
will _occupy after the step in flight_, which is what prevents overshoot.

## 5. Rendering (`renderer/`)

- `configurePixelArtDefaults()` sets PixiJS's default `scaleMode` to `'nearest'`;
  `PIXEL_ART_APPLICATION_OPTIONS` = no antialias, rounded pixels. Call before creating textures.
- **Pure helpers (unit-tested without a GPU):** `integerScale`, `letterboxOffset`,
  `computeCamera` (centred, clamped, rounded; a map smaller than the view is centred),
  `visualTile`/`walkFrameIndex` (interpolated position and the 3×4 sheet layout: rows
  down/left/right/up, columns step/stand/step), `planTileDraws`/`planLayerDraws`
  (tile id → tileset cell → pixel rect).
- **Tilemaps:** `createTilemapLayers(map, tilesetTexture)` returns `{ below, above }`
  `CompositeTilemap`s; all layers sharing the tileset texture batch into one draw call per
  group. `drawTiles` takes a minimal `TileSink` so tests can fake it.
- **Textures:** `createAssetTextureProvider({ loadBlob, decode? })` (ADR-010).
- **`createGameRenderer({ canvas, game, textures, viewTiles?, resizeTo? })`** builds the
  scene (tiles below, y-sorted character sprites, tiles above), lays out with an integer
  scale in physical pixels, follows the player, and exposes `render()`, `resize()`,
  `reload()` (rebuild tiles after textures were invalidated), `setGame(next)` (draw a rebuilt
  game on the same canvas; the old picture stays until the new tiles are ready), `settled()`
  (resolves when the tiles and sprite sheets requested so far have loaded) and `destroy()`.

The renderer reads `game.state` and the world; it must never write to them.

## 6. Audio (`audio/`)

`createAudioManager({ backend, resolvePath })` implements `AudioPort` for four tiers:

- **BGM / BGS:** one looping, _streamed_ track each; a new cue replaces the old, repeating the
  playing track is ignored.
- **ME:** a one-shot jingle that **ducks the BGM** (volume 0) while it plays and restores it
  after; a BGM started during a jingle stays quiet until it ends.
- **SE:** fire-and-forget, overlapping freely; decoded (not streamed).

A cue's `volume` (0–100) and `pitch` (50–150 → playback speed ×0.5–1.5) are scaled by per-tier
and master volume (`setTierVolume`, `setMasterVolume`). A cue whose file does not exist is
ignored (a missing sound must never crash a game). `pauseAll()` / `resumeAll()` freeze and continue every sound in place (`sound.pauseAll()` in `@pixi/sound`), so a
paused game is silent but its music is still "the current track" and is not restarted on resume. `createAudioPathResolver(files)` maps
`name` → `audio/<tier>/<name>.{ogg,m4a,mp3,wav}` using the bundle's file list.
`installAudioUnlock(target, unlock)` calls `unlock` **synchronously inside the first user
gesture** (`pointerdown`, `touchend`, `keydown`, `click`) because browsers only honour
`AudioContext.resume()` there, and re-arms itself if unlocking fails.

`createPixiSoundBackend` uses `@pixi/sound`. v6 picks Web Audio vs streamed HTML audio with a
global flag read at construction, so the backend flips `sound.useLegacy` only for the duration
of creating a streamed sound and restores it in `finally`. **This path is covered by mocks
only; real playback has not been verified in a browser.**

## 7. The player (`player/`)

`startPlayer(root, { baseUrl? })` is a thin loader: fetch `game.json` → `loadGameBundle` (project data via
`filesToProject`; plugin `manifest.json` plus only the `shared` and `engine` entries, through
`loadEnginePlugins(ids, fetchText)`, which works with any text source) → hand everything to
`createPlayerSession`. Failures are shown in the page.

`createPlayerSession({ root, project, plugins?, listFiles, textures, soundBackend, keyTarget?, unlockTarget?, touchControls?, seed?, startPaused?, onError? })`
is what actually runs a game, and the editor's live preview uses it too ([ADR-027](decisions.md#adr-027-the-live-preview-runs-in-process-from-the-same-player-session-as-an-export)).
It builds, in order: audio manager + unlock → `createGame` → engine plugin manager → renderer →
message box (a DOM overlay; text is set via `textContent`, never HTML) → keyboard input (plus touch controls) →
`app.ticker` loop through `createFixedStepClock`. It throws if it cannot start. Everything environmental is a
parameter (`fetch` and `window` appear only as defaults), so it runs an exported game and an in-memory project alike.
It returns a `PlayerSession`:

| Member            | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `game`            | The running `Game`. A different object after every `reload`.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `paused`          | Whether `pause()` is in effect.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `pause()`         | Stops the PixiJS ticker (so nothing ticks or draws) and freezes sound; game state is untouched. Idempotent. The last frame stays on screen.                                                                                                                                                                                                                                                                                                                                             |
| `resume()`        | Drains key presses made meanwhile (a tap or the Enter that resumed is not a move or a confirm; a key still held keeps walking), resets the clock, resumes sound, restarts the ticker.                                                                                                                                                                                                                                                                                                   |
| `reload(options)` | Builds a new game from `{ project, plugins?, save? }`, swaps it into the same canvas, rebinds the message box, tears the old plugins down, and does not restart music. Queued, one at a time. A `save` that the new project refuses still replaces the game (from the start) and returns `ok({ restored: false, reason })`; `ok({ restored: true })` otherwise. Only a project that cannot be built (or whose plugins fail to start) returns a failure, and the old game keeps running. |
| `stop()`          | Removes every listener and destroys the renderer.                                                                                                                                                                                                                                                                                                                                                                                                                                       |

A frame that throws (a `GameError`, a broken plugin system) pauses the session first, because PixiJS stops its ticker for
good after an exception, then calls `onError(error)`; without a handler it rethrows. `root` is made `position: relative`
only if the page left it static, so a host that lays it out absolutely (the editor does) keeps its layout; forcing it once
collapsed the stage to zero height.

While paused, a resize of the stage (`ResizeObserver`) or the orientation redraws a complete frame by hand, since the
ticker that would do it is stopped; the redraw waits for `GameRenderer.settled()` so a tile that was still loading is
not left blank.

Controls: arrows/WASD move; Enter/Space/Z confirm; a key tap shorter than one frame is latched so it
still moves the player a tile. A key pressed with Ctrl, Cmd or Alt held is never taken (`Ctrl+Z` is not a confirm), so
a host page's shortcuts keep working.

**Touch controls** (`player/touchControls.ts`): `startPlayer(root, { touchControls: 'auto' | 'on' | 'off' })`;
`auto` (default) shows them when `(pointer: coarse)` matches. A virtual D-pad is one surface, so a thumb can slide
between directions without lifting (`directionFromOffset`: dominant axis, 25% dead zone, never diagonal), and an
**A** button confirms. They implement `PlayerInput` and are combined with the keyboard by `mergeInputs`, so
keyboard play still works on a touch laptop. The game's own area is a `stage` element inside `root`; in portrait
it stops 200 px (`TOUCH_CONTROLS_HEIGHT`) above the bottom so the controls never cover the picture, and in
landscape they float over the corners. The message box is attached to the stage.

`vite.player.config.ts` bundles everything into one file (ADR-023). Rebuild with
`pnpm --filter @rpgstudio/engine build`.

## 8. Plugins in the engine (`plugins/host.ts`)

`createEnginePluginManager(game, { audio, logSink? })` returns a core `PluginManager` whose
host provides `events`, `schemas`, `log` (from core) plus `ecs` (`world`, read-only `state`,
`addSystem` that auto-removes on teardown) and `audio`. Editor-only capabilities (`ui`,
`store`, `files:*`) are not provided, so a plugin requesting them fails at registration.

## 9. Extending the engine

| To add…            | Do this                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| An event command   | [extending.md → event command](extending.md#add-an-event-command)                                                                |
| A trigger kind     | Extend `EventTriggerKindSchema`, then handle it in `systems/event.ts`                                                            |
| A system           | Write `(ctx, input) => void`; ship it in a plugin via `ecs.addSystem`, or add it to the built-ins in `game.ts` (mind tick order) |
| A component        | Add a Zod schema in core `components.ts`, a field on `Entity`, and create/remove it with the world API                           |
| A renderer feature | Pure computation in `renderer/*` with tests; imperative Pixi code in `sprites.ts`/`gameRenderer.ts`                              |

Always add a headless test first: build a tiny project with `test/fixtures.ts`
(`mapFromAscii`, `page`, `text`, `buildProject`) and assert on `snapshot()`.
