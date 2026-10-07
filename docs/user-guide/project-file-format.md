# Project File Format

A project is a plain folder of text and media files. Nothing is hidden in a database or binary blob, so you can open, diff, review and version it with ordinary tools such as Git. Everything is **strict JSON** (never YAML).

## Folder layout

```
my-game/
  project.json            settings: name, start position, starting party, plugins
  data/
    actors.json
    classes.json
    items.json
    skills.json
    enemies.json
  maps/
    map-001.json          one file per map; the id is padded to 3 digits
    map-002.json
  img/
    tilesets/             tileset images
    characters/           character sheets
    pictures/             pictures
  audio/
    bgm/  bgs/  me/  se/  music, ambience, jingles, effects
  plugins/                optional: one folder per plugin
```

Saving is deterministic: stable ordering, two-space indentation and a trailing newline. Saving unchanged data writes nothing, and Git diffs show only real edits.

## project.json

```json
{
  "format": "rpgstudio-project",
  "formatVersion": 1,
  "name": "My Game",
  "startMapId": 1,
  "startX": 10,
  "startY": 7,
  "startDirection": "down",
  "startParty": [1],
  "startGold": 0,
  "plugins": [],
  "switchNames": { "1": "Met the king" },
  "variableNames": { "1": "Conversations with the guide" }
}
```

| Field                                              | Meaning                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `format`, `formatVersion`                          | Fixed identifiers; do not change them                                                      |
| `name`                                             | The project and game name (1 to 64 characters)                                             |
| `startMapId`, `startX`, `startY`, `startDirection` | Where the player begins. The cell must exist on the map.                                   |
| `startParty`                                       | Actor ids you begin with. The **first** one is drawn as the player (through its `sprite`). |
| `startGold`                                        | Starting gold                                                                              |
| `plugins`                                          | Ids of enabled plugins (folders under `plugins/`)                                          |
| `switchNames`, `variableNames`                     | Optional labels, keyed by the number as a string                                           |

The editor edits the start map, X, Y and the name in the **Properties** panel. The other fields are edited in this file; re-open the project afterwards.

## data/\*.json

Each file is a JSON array of records (`[]` when empty). See [Database](database.md) for the fields. Missing files count as empty tables. Ids are positive whole numbers, unique within a file, and other files refer to them (a class id in an actor, an item id in an enemy's drops).

## maps/map-NNN.json

```json
{
  "id": 1,
  "name": "Map 1",
  "width": 20,
  "height": 15,
  "tileSize": 16,
  "tileset": "img/tilesets/basic.png",
  "layers": [
    {
      "name": "Ground",
      "visible": true,
      "above": false,
      "data": [1, 1, 1, "…width × height numbers…"]
    },
    { "name": "Objects", "visible": true, "above": false, "data": [0, 0, 0, "…"] },
    { "name": "Overlay", "visible": true, "above": true, "data": [0, 0, 0, "…"] }
  ],
  "collision": [0, 0, 0, "…width × height numbers…"],
  "events": []
}
```

- `layers[].data` has exactly `width × height` numbers, **row by row from the top-left**. `0` is empty; `n` is tile `n` in the tileset. Layers are listed **bottom to top**.
- `collision` has one number per cell, made of flags added together (see below). The editor's Collision tool only sets `0` and `1`.
- `events` is the same array you edit in the Properties panel; see [Events](events.md).

### Collision flags

| Value               | Meaning                               |
| ------------------- | ------------------------------------- |
| `0`                 | Passable                              |
| `1`                 | Solid: nothing can enter              |
| `2`, `4`, `8`, `16` | Blocks movement up, down, left, right |

A step is allowed only if the destination is in bounds and not solid, the cell being left does not block that direction, and the destination does not block the opposite direction. Directional flags make one-way ledges (add them together, for example `2 + 8`).

## Editing by hand

You can edit these files in any text editor. Rules to remember:

- **Strict JSON:** double quotes, no comments, no trailing commas.
- **Unknown fields are rejected.** A typo in a field name is an error, not silently ignored.
- When you open the project, every file is validated **separately** (so an error names the file and the path to the bad value), then the project as a whole (so a reference to a missing map or actor is caught).
- If validation fails, nothing is opened and the first problems are listed.

## Exported games

An [export](playing-and-exporting.md) contains the same data files plus `game.json` (the list of files to load) and `engine/player.js`. It is a copy for playing, not for editing.
