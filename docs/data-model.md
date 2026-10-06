# Data model

Everything a game _is_ is described here. The Zod schemas in
`packages/core/src/schemas/` are authoritative; this document explains them. When the two
disagree, the schema wins; fix the doc (and `pnpm test` will often tell you).

## 1. Ground rules

- **Strict JSON only.** No YAML, no comments, no `undefined`, no functions, no dates.
- **`z.strictObject` everywhere.** An unknown field is a validation error, never silently
  dropped. This is what catches fields an AI model invented.
- **Types are inferred.** `type Actor = z.infer<typeof ActorSchema>`. Never write a parallel
  interface. (The single exception is `ConditionalBranchCommand`; see
  [decisions.md](decisions.md#adr-004-one-explicit-recursive-type-for-event-commands).)
- **Defaults live in the schema.** `.default(...)` fields are optional in input, present in
  output. Action payload types are _output_ types, so construct fixtures with `Schema.parse`.
- **Cross-field rules are pure functions** returning `ValidationIssue[]`, attached with
  `.check(issuesCheck(fn))` (`schemas/refine.ts`). Do not mutate Zod's payload yourself.
- **Plugin data** goes in `extensions: Record<string, JSON>` on records that support it.

## 2. Primitives (`schemas/common.ts`)

| Name                | Meaning                                                                                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IdSchema`          | Positive integer (≥ 1). Database ids, map ids, event ids, switch/variable ids.                                                                                                                        |
| `NameSchema`        | Trimmed, 1–64 characters.                                                                                                                                                                             |
| `DescriptionSchema` | ≤ 1000 characters.                                                                                                                                                                                    |
| `DirectionSchema`   | `'up' \| 'down' \| 'left' \| 'right'`                                                                                                                                                                 |
| `PointSchema`       | `{ x: int, y: int }`                                                                                                                                                                                  |
| `AssetPathSchema`   | Project-relative path, `/` separators only. Rejects a leading `/`, backslashes, drive letters (`C:`), empty/`.`/`..` segments. **Every path that reaches the filesystem or a zip goes through this.** |
| `HexColorSchema`    | `#rrggbb` or `#rrggbbaa`                                                                                                                                                                              |
| `ExtensionsSchema`  | `Record<string, JSON>` for plugin-owned data                                                                                                                                                          |
| `hasUniqueIds`      | Helper: no two records share an `id`                                                                                                                                                                  |

JSON values are typed `JsonValue` (`core/src/json.ts`, mutable arrays so it is assignable
to Zod's `JSONType`).

## 3. Database records (`actor.ts`, `item.ts`)

The database tables (see the table below), each an array of records keyed by unique `id`. Every table must also appear in `createStarterProject`:

| Table     | Schema        | Notes                                                                                                  |
| --------- | ------------- | ------------------------------------------------------------------------------------------------------ |
| `actors`  | `ActorSchema` | `classId` must exist; optional `sprite` (`{sheet, frameWidth, frameHeight}`), `face`; levels 1–99      |
| `classes` | `ClassSchema` | `baseStats` (`StatsSchema`), `growth` (`StatGrowthSchema`, per level), `learnings: [{level, skillId}]` |
| `items`   | `ItemSchema`  | `kind`: `consumable \| weapon \| armor \| key`; `effects`; partial `statBonuses`                       |
| `skills`  | `SkillSchema` | `mpCost`, `target`, `element`, `effects`                                                               |
| `enemies` | `EnemySchema` | `stats`, `experience`, `gold`, `skillIds`, `drops: [{itemId, chance 0..1}]`                            |

`EffectSchema` is a discriminated union on `type`: `recoverHp`, `recoverMp`, `damageHp`
(each with an integer `value`). Stats: `maxHp maxMp attack defense magic speed luck`.
Level stats are `floor(base + growth × (level − 1))` (`engine/src/game/party.ts`).

## 4. Maps (`tilemap.ts`)

`TilemapSchema` fields: `id`, `name`, `width`, `height` (1–512), `tileSize`
(**16, 24, 32 or 48**), `tileset` (an `AssetPath`), `layers` (1–8), `collision`, `events`,
optional `bgm`/`bgs` (`AudioRefSchema`), `extensions`.

- **Layers** (`TilemapLayerSchema`): `{ name, visible (default true), above (default false),
data }`. `data` is row-major with exactly `width × height` entries. Tile id `0` is empty;
  id `n > 0` selects tileset cell `n − 1`, counted row-major across the tileset image
  (columns = `floor(imageWidth / tileSize)`). `above: true` draws the layer over characters
  (roofs, treetops). Layer order is bottom to top.
- **Collision** is row-major, `width × height`, integer bit flags (0–31):
  `PASSABLE 0`, `SOLID 1`, `BLOCK_UP 2`, `BLOCK_DOWN 4`, `BLOCK_LEFT 8`, `BLOCK_RIGHT 16`.
  Directional flags make one-way ledges. A step is allowed only if the destination is
  in bounds and not solid, the cell being left does not block that direction, and the
  destination does not block the opposite direction (`canStep` in
  `core/src/math/collision.ts`).
- **Events** are `MapEventSchema[]` (§5), unique ids, positions inside the map.
- Validation (`validateTilemap`) rejects layers/collision of the wrong length, duplicate
  event ids and out-of-map events with a path to the problem.

## 5. Events (`event.ts`)

### Commands

`EventCommandSchema` is a discriminated union on `command`:

| Command                                     | Fields                                                                                | Notes                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `ShowText`                                  | `text` (1–2000), `face?`                                                              | Blocks until the player confirms                            |
| `TransferPlayer`                            | `mapId`, `x`, `y`, `direction?`                                                       | Target map and cell must exist (checked in `ProjectSchema`) |
| `SetSwitch`                                 | `switchId`, `value` (bool)                                                            |                                                             |
| `SetVariable`                               | `variableId`, `operation` (`set add subtract multiply`, default `set`), `value` (int) | Result clamped to ±99,999,999                               |
| `PlayBGM` / `PlayBGS` / `PlayME` / `PlaySE` | `name`, `volume` (0–100, default 90), `pitch` (50–150, default 100)                   | The four audio tiers                                        |
| `Wait`                                      | `frames` (1–36000)                                                                    | Blocks exactly that many ticks                              |
| `ConditionalBranch`                         | `condition`, `then: Command[]`, `else: Command[]` (default `[]`)                      | Recursive                                                   |

`ConditionSchema`: `{type:'switch', switchId, equals (default true)}` or
`{type:'variable', variableId, comparator (== != > >= < <=), value}`.

`flattenCommands(commands)` (core) walks both arms of every branch; use it whenever you need
"every command in this list" (e.g. reference checks).

### Pages and map events

`EventPageSchema`: `conditions[]` (all must hold), `trigger` (`action | touch | autorun |
parallel`, default `action`), `graphic` (`{sheet, frameWidth, frameHeight, frame}` or `null`),
`solid` (default true), `commands[]`. `MapEventSchema`: `{ id, name, x, y, pages (1–32) }`.
The active page is the **highest-numbered page whose conditions all hold**. No active page
means the event is inert and invisible.

### Compact runtime form (`events/compact.ts`)

`compileCommands` / `decompileCommands` convert to `[code, ...params]` tuples and back,
losslessly (`decompile` re-validates). Codes: `ShowText 101`, `ConditionalBranch 111`,
`SetSwitch 121`, `SetVariable 122`, `TransferPlayer 201`, `Wait 230`, `PlayBGM 241`,
`PlayBGS 245`, `PlayME 249`, `PlaySE 250`. Nested branch arms are nested arrays. The engine
interprets the semantic form directly today; the compact form is for size-sensitive
shipping and tooling.

## 6. Project (`project.ts`, `project/*`)

### `ProjectMeta` (`project.json`)

`format: 'rpgstudio-project'`, `formatVersion: 1`, `name`, `startMapId`, `startX`, `startY`,
`startDirection` (default `down`), `startParty: Id[]`, `startGold`, `plugins: PluginId[]`,
`switchNames`, `variableNames` (id-string → label).

### `ProjectSchema`

`{ meta, database, maps }` plus these **reference checks** (each failure carries a path):
unique map ids; start map exists and start cell is inside it; every starting-party id is an
actor; every actor's class exists; every class-learned skill exists; every enemy skill and
dropped item exists; every `TransferPlayer` (including inside branches) targets an existing
map and an in-bounds cell. Table-level uniqueness is checked by `DatabaseSchema`.

### Files on disk (`project/files.ts`)

`projectToFiles(project)` → `Record<path, text>`; `filesToProject(files)` → `Result`.

```
project.json            ProjectMeta
data/actors.json        Actor[]     data/classes.json  data/items.json
data/skills.json        data/enemies.json
maps/map-001.json       Tilemap     (id zero-padded to 3 digits)
```

Output is deterministic (2-space indent, trailing newline), so saving unchanged data writes
nothing. `filesToProject` validates **each file separately** so errors name the file, then
validates the assembled project for references. Missing database tables count as empty;
`project.json` is required. Unrelated files are ignored. Assets (`img/`, `audio/`,
`plugins/`) are handled by the editor's persistence layer, not by core.

### Templates (`project/template.ts`)

`createEmptyMap({id,name,width,height,tileSize?,tileset?,fill?})` makes three layers
(`Ground`, `Objects`, `Overlay` with `above: true`) and empty collision.
`createStarterProject(name)` is a valid one-map project with a class, actor, item, skill and
`startParty: [1]`; it is the editor's "new project" and the base for most test fixtures.

### Game bundle (`project/bundle.ts`)

`GameBundleSchema` is `game.json` in an export: `{ format: 'rpgstudio-game', formatVersion: 1,
name, files: AssetPath[], plugins: PluginId[] }`. The player reads it to learn what to fetch.

## 7. Save games (`save.ts`)

`SaveStateSchema` (version `1`): `projectName`, `tick`, `rngState` (uint32), `mapId`,
`player {x, y, direction}`, `entities [{eventId, x, y, direction}]`, `party
[{actorId, level, experience, hp, mp}]`, and `switches`, `variables`, `inventory` as
`Record<"<id>", value>` (ids are decimal strings because JSON keys are strings), plus `gold`.
Saved mid-step, the player's position is the **destination** tile. Saves do not capture a
running event, so saving is refused while one runs. `game.restore` validates the schema and
then that the map, actors, event ids and positions fit the project, applying nothing on failure.

## 8. ECS components (`components.ts`)

Typed from Zod and used as entity fields by the engine: `Position {x,y}` (tile), `Movement
{direction, speed (> 0 and ≤ 32 tiles/s), intent, target, progress (0..1)}`, `SpriteData
{sheet, frameWidth, frameHeight, frame}`, `Collision {solid}`, `EventTrigger {eventId,
trigger}`. See [engine.md](engine.md).

## 9. Pixel art (`pixel/`)

- `PixelMatrixSchema` is the AI-friendly sprite: `{ palette: HexColor[] (1–256), width,
height (≤ 512), pixels: int[] }`, row-major indices, every index within the palette.
- `matrixToRgba`, `composeSpriteSheet(frames, columns)`, `encodePng` / `decodePng`
  (8-bit RGB/RGBA, non-interlaced; all filters on decode), data-URL helpers.
- `serializePiskel` / `parsePiskel` / `matricesToPiskel`: Piskel's `.piskel` JSON (layers are
  JSON strings; frames are a PNG strip with a column `layout`).
- `createDefaultTilesetPng()` generates `img/tilesets/basic.png`, 8×2 tiles of 16 px, with
  metadata `DEFAULT_TILES` (ids 1–16: Grass, Dirt, Water, Sand, Stone floor, Wall, Tree,
  Flowers, Wood floor, Door, Bridge, Lava, Snow, Cobblestone, Chest, Pit).

## 10. Wire and action schemas

Project-editing actions are in `schemas/actions.ts` and the companion protocol is in
`schemas/protocol.ts`. They are documented where they are used: actions in
[editor.md](editor.md#project-actions), the protocol in
[companion-protocol.md](companion-protocol.md).

## 11. Changing the data model

Add a field: add it to the schema with a default, update `createStarterProject` and any
fixture only if needed, then run `pnpm test` (schema, round-trip and editor tests exercise
it). Breaking the file format: bump `PROJECT_FORMAT_VERSION`, keep old readers working in
`filesToProject`, and record the decision in [decisions.md](decisions.md). Step-by-step
recipes are in [extending.md](extending.md).
