# AGENTS.md: `@rpgstudio/engine`

The game runtime. Read the [root AGENTS.md](../../AGENTS.md) first, then
[docs/engine.md](../../docs/engine.md) (the full description).

## Hard rules for this package

- **The root entry is headless.** `src/ecs`, `src/game` and `src/headless` must not import PixiJS /
  `@pixi/*` or touch `window`/`document` (a test scans those three folders; keep `src/plugins` clean by hand). Browser code goes in `src/renderer`, `src/audio`,
  `src/player`, which are separate entry points (`./renderer`, `./audio`, `./player`).
- **Determinism.** No `Math.random`, `Date.now`, or wall-clock time in simulation code. Use `game.state.rng`. Time is ticks.
- **Validation at the edge only.** `createGame` takes a validated `Project`. Data from outside (`createHeadlessGame`,
  `restore`, `loadGameBundle`) is validated with Zod there; systems do not validate.
- **Mutation is allowed in `src/ecs/**` and `src/game/**`** (the ECS tick) and in the Pixi/`@pixi/sound` adapters
  (`src/renderer/**`, `src/player/**`, `audio/pixiSoundBackend.ts`); everywhere else `functional/immutable-data` applies.
  The renderer/player must only **read** game state.
- Add/remove entity components with `world.addComponent`/`removeComponent`/`update` (not assignment) so miniplex queries stay right.

## Map

```
src/index.ts               headless-safe barrel (ecs, game, headless, plugins)
src/ecs/entity.ts          Entity type; createWorld
src/ecs/systems/movement.ts  grid movement, collision, bump/arrive records
src/ecs/systems/event.ts   page refresh, triggers, foreground/parallel interpreters
src/game/types.ts          GameInput, GameState, Runtime, AudioPort, GameEventMap, TICKS_PER_SECOND
src/game/game.ts           createGame: loadMap, tick, save/restore, snapshot, addSystem
src/game/interpreter.ts    execute event commands; conditionHolds, setSwitch, setVariable
src/game/party.ts          stat growth, createPartyMember
src/game/clock.ts          createFixedStepClock (frame time → ticks)
src/headless/harness.ts    createHeadlessGame (simulateTicks, step, hold, walkTo…), recording audio
src/plugins/host.ts        createEnginePluginManager (ecs + audio capabilities)
src/renderer/              pixelArt, viewport, characters, tilemapPlan, tilemap, textures, sprites, gameRenderer
src/audio/                 manager (4 tiers), unlock, pixiSoundBackend
src/player/                main (startPlayer), bundle (loadGameBundle), input, messageBox
vite.config.ts             library build (index, renderer, audio, player entries)
vite.player.config.ts      standalone player bundle → dist-player/player.js
test/                      fixtures.ts (mapFromAscii, buildProject…), one file per area, playerBundle.test.ts
```

## Invariants worth knowing

- Tick order: input → `movementSystem` → `eventSystem` → plugin systems → `tick++`.
- A step takes `60 / speed` ticks; surplus progress carries over; arrival tolerance is `1 - 1e-9`.
- An event runs until its first wait on the tick it starts; the last message's dismissal finishes it on that tick.
- `serialize` throws while an event runs (`canSave()` guards); `restore` applies nothing unless the whole save fits.
- The renderer draws tiles below characters, y-sorted sprites, then `above` layers; scale is an integer in physical pixels.
- `createAssetTextureProvider.invalidate()` calls `Assets.cache.reset()`; the editor depends on this for hot reload.
- The audio port ignores cues whose file does not exist (a missing sound must not crash a game).

## Testing

`pnpm --filter @rpgstudio/engine test`. Prefer headless tests with `buildProject`/`mapFromAscii`/`createHeadlessGame`
and assert on `game.snapshot()`. Files that touch `@pixi/sound` or the DOM start with `// @vitest-environment jsdom`; the
sound library is mocked. `playerBundle.test.ts` runs a real Vite build (a few hundred ms) and must keep passing when run from
the repo root.

## Extending

[engine.md §9](../../docs/engine.md#9-extending-the-engine) and the recipes for an
[event command](../../docs/extending.md#add-an-event-command) and [engine behaviour](../../docs/extending.md#add-engine-behaviour).

## Pitfalls

- Importing a PixiJS-using module from the headless modules breaks Node usage; check with `pnpm test`.
- `pnpm build` must produce `dist-player/player.js` before the editor builds; the player bundle needs
  `define: process.env.NODE_ENV` or exported games crash on load.
- Browser audio is untested beyond mocks; changes to `pixiSoundBackend.ts` need manual verification.
- There are no touch controls; `createKeyboardInput` latches sub-frame taps (keep that).
