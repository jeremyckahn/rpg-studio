# @rpgstudio/engine

The game runtime: a `miniplex` ECS, a deterministic fixed-step simulation, a
PixiJS renderer and an audio manager.

| Entry point                  | Contents                                                           | Needs a browser |
| ---------------------------- | ------------------------------------------------------------------ | --------------- |
| `@rpgstudio/engine`          | ECS world and systems, `createGame`, headless harness, plugin host | no              |
| `@rpgstudio/engine/renderer` | `createGameRenderer`, tilemap batching, integer scaling            | yes (WebGL)     |
| `@rpgstudio/engine/audio`    | `createAudioManager`, `@pixi/sound` backend, gesture unlock        | yes             |
| `@rpgstudio/engine/player`   | `startPlayer`: boots an exported game into a page                  | yes             |

The root entry never imports PixiJS, which is what lets the simulation run in
Node. A test enforces this.

## Simulation

One tick is 1/60 s. Movement is tile-aligned: an entity is either idle on a tile
or part way through a one-tile step, advancing `speed / 60` of a tile per tick
(the default 4 tiles/s is exactly 15 ticks per tile). Surplus progress carries
into the next step, so held input moves at exactly `speed`.

Systems run in a fixed order each tick: input, movement, events, then any
systems added by plugins.

```ts
const headless = createHeadlessGame(projectJson, { seed: 1 })
headless.simulateTicks(600, { direction: 'right', confirm: false })
headless.walkTo({ x: 12, y: 4 }) // A*-driven, like an AI playtester
headless.game.serialize() // SaveState, validated by Zod
```

## Events

`ShowText`, `TransferPlayer`, `SetSwitch`, `SetVariable`, `ConditionalBranch`,
`Wait` and the four audio tiers are interpreted from the same semantic JSON the
editor writes. Pages follow RPG Maker rules (highest page whose conditions hold),
with `action`, `touch`, `autorun` and `parallel` triggers.

## Mutation

The ECS runtime (`src/ecs`, `src/game`) mutates in place on purpose, per the
architecture: systems write component fields during a tick with no validation
or copying, and Zod runs only where data enters (`createHeadlessGame`,
`restore`, bundle loading, plugin registration). The renderer, player and
`@pixi/sound` adapter are exempt because PixiJS is a retained-mode scene graph.
Those exceptions live in the root `eslint.config.js`.

## Rendering

`configurePixelArtDefaults()` sets PixiJS texture sampling to `'nearest'`.
`createGameRenderer` uses no antialiasing, rounded sprite positions and an
integer-scaled, letterboxed view. All tile layers that share a tileset texture
are batched by `@pixi/tilemap` into one tilemap (one draw call) per group:
layers drawn below characters, and layers marked `above`.

## Build

`pnpm --filter @rpgstudio/engine build` produces `dist/` (library, with type
declarations) and `dist-player/player.js`, a minified single-file player with
PixiJS bundled in, which the editor ships inside exported games.
