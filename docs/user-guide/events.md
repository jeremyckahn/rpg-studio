# Events

**Events** make a map come alive: characters who talk, doors that lead somewhere, chests that open once, cutscenes. An event is a small script attached to a cell on a map.

There is no visual event editor yet. You write events as **JSON** in the **Properties** panel, under **Events (JSON)**. The editor checks everything you write and explains mistakes, so it is hard to break your project by accident. If you would rather not write JSON by hand, an [AI agent](ai-companion.md) can write events for you.

## The big picture

```
Map
└── Event (id, name, x, y)             one per interactive thing
    └── Page 1, Page 2, … (1 to 32)    the event looks and behaves differently per page
        ├── conditions   when this page is eligible
        ├── trigger      what starts it (action / touch / autorun / parallel)
        ├── graphic      its picture (or none)
        ├── solid        whether it blocks walking
        └── commands     what it does, in order
```

- An event sits on **one cell** (`x`, `y`, counted from 0 at the top-left).
- It has one or more **pages**. At any moment the event uses the **highest-numbered page whose conditions are all true**. If **no** page qualifies, the event is **inert and invisible**.
- That is how a chest changes after you open it, or an NPC says something new after a quest: later pages have conditions on switches or variables.

## Editing events in the editor

1. Open the **Map** tab and pick the map. In the **Properties** panel scroll to **Events (JSON)**. The box holds this map's events as a JSON array (`[]` for a new map).
2. Edit the text. The **Apply events** button turns on when the text differs from what is stored.
3. Click **Apply events**. Either:
   - everything is accepted, and the whole list is replaced in **one undo step**; or
   - a red box lists up to three problems with their location (for example `events.0.pages.0.commands.0.text: Too small`). Nothing changes until it is fixed.

Rules the editor enforces: valid JSON; every field has the right type and range; **unknown fields are rejected** (so a typo like `"triger"` is caught instead of being silently ignored); event ids are unique on the map; events sit inside the map; any `TransferPlayer` targets a map and cell that exist.

## An event, field by field

```json
[
  {
    "id": 1,
    "name": "Innkeeper",
    "x": 12,
    "y": 7,
    "pages": [
      {
        "conditions": [],
        "trigger": "action",
        "graphic": {
          "sheet": "img/characters/npc.png",
          "frameWidth": 16,
          "frameHeight": 16,
          "frame": 0
        },
        "solid": true,
        "commands": [
          { "command": "ShowText", "face": "Innkeeper", "text": "Rest well, traveller." }
        ]
      }
    ]
  }
]
```

| Field        | Meaning                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------- |
| `id`         | Positive whole number, unique on this map                                                |
| `name`       | A label for you (shown nowhere in the game)                                              |
| `x`, `y`     | The cell, inside the map                                                                 |
| `pages`      | 1 to 32 pages                                                                            |
| `conditions` | List; **all** must be true for the page to be eligible. Default: none (always eligible). |
| `trigger`    | `action`, `touch`, `autorun` or `parallel`. Default `action`.                            |
| `graphic`    | A picture, or `null` for invisible (the default)                                         |
| `solid`      | `true` (default): blocks movement. `false`: the player can walk onto the cell.           |
| `commands`   | The script (see below). Default: nothing.                                                |

### Triggers

| Trigger    | Starts when                                                                                                                                      | Typical use                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| `action`   | The player presses **confirm** (Enter, Space, Z or the on-screen **A**) while facing a **solid** event, or while standing on a **non-solid** one | Talking, opening chests, reading signs |
| `touch`    | The player **walks onto** a non-solid event's cell, or **bumps into** a solid one                                                                | Doors, traps, cutscene tiles           |
| `autorun`  | Immediately, whenever nothing else is running, and **again and again** until the page stops being eligible                                       | Opening cutscenes, forced scenes       |
| `parallel` | Runs in the background every tick, alongside everything else, and restarts when it finishes                                                      | Ambient effects and timers             |

> **Autorun warning:** an autorun page keeps starting until it is no longer eligible, and the player cannot move while it runs. **Always** end an autorun page by setting a switch that a condition on that page checks (see the cutscene recipe), or the game will be stuck.

While an event is running, the player cannot move; it blocks input until its commands finish. `ShowText` waits for the player to confirm.

### Giving an event a picture

`graphic` points at a [character sheet](assets.md#character-sheets) you added to the project:

```json
{ "sheet": "img/characters/npc.png", "frameWidth": 16, "frameHeight": 16, "frame": 0 }
```

- `sheet` is the asset's path.
- `frameWidth` / `frameHeight` is the size of one frame in pixels.
- `frame` counts frames left to right, top to bottom, from 0. On a sheet with at least 3 columns and 4 rows, **frame 0** means "use the walking layout", so the character turns to face the way it moves. **Any other number** shows exactly that frame (use `1` or higher for a chest, a sign or an open door).

Events with no `graphic` are invisible but still work: useful for trigger zones.

## Conditions

A condition checks a [switch or variable](#switches-and-variables):

```json
[
  { "type": "switch", "switchId": 1, "equals": true },
  { "type": "variable", "variableId": 2, "comparator": ">=", "value": 3 }
]
```

- `switch`: `equals` is `true` (the default) or `false`.
- `variable`: `comparator` is one of `==`, `!=`, `>`, `>=`, `<`, `<=`; `value` is a whole number.

Put conditions in a page's `conditions` list (all must hold) or inside a `ConditionalBranch` command.

## Switches and variables

- A **switch** is a numbered on/off flag. They all start **off**.
- A **variable** is a numbered whole number. They all start at **0**.

Use any positive whole numbers as ids; there is nothing to create first. Pick a convention (for example, switch 1 = "met the king") and optionally write names into `switchNames` / `variableNames` in `project.json` so you remember. They are shared across all maps and are part of saved games.

## Commands

Commands run from top to bottom.

### ShowText

```json
[{ "command": "ShowText", "face": "Mara", "text": "The bridge is out." }]
```

Shows a message box and waits for the player to confirm. `text` is 1 to 2000 characters. The optional `face` is shown as a name before the text (`Mara: The bridge is out.`).

### SetSwitch

```json
[{ "command": "SetSwitch", "switchId": 1, "value": true }]
```

### SetVariable

```json
[
  { "command": "SetVariable", "variableId": 2, "operation": "set", "value": 10 },
  { "command": "SetVariable", "variableId": 2, "operation": "add", "value": 1 }
]
```

`operation` is `set` (the default), `add`, `subtract` or `multiply`. Results are capped at ±99,999,999.

### TransferPlayer

```json
[{ "command": "TransferPlayer", "mapId": 2, "x": 5, "y": 8, "direction": "up" }]
```

Moves the player to cell (`x`, `y`) on map `mapId`, optionally turning them to `up`, `down`, `left` or `right`. The map and cell must exist, or the editor refuses the events. Other events on the old map stop; the new map's events start fresh.

### PlayBGM, PlayBGS, PlayME, PlaySE

```json
[
  { "command": "PlayBGM", "name": "town", "volume": 80 },
  { "command": "PlaySE", "name": "door", "volume": 90, "pitch": 100 }
]
```

`name` is the file name without extension (see [Assets](assets.md#audio-formats)). `volume` is 0 to 100 (default 90) and `pitch` is 50 to 150 (default 100).

### Wait

```json
[{ "command": "Wait", "frames": 60 }]
```

Pauses the event for that many frames; the game runs at **60 frames per second**, so 60 is one second. The range is 1 to 36,000.

### ConditionalBranch

```json
[
  {
    "command": "ConditionalBranch",
    "condition": { "type": "switch", "switchId": 1, "equals": true },
    "then": [{ "command": "ShowText", "text": "You already have the key." }],
    "else": [{ "command": "ShowText", "text": "Come back when you have the key." }]
  }
]
```

Runs `then` if the condition holds, otherwise `else` (optional, defaults to nothing). Branches can contain any commands, including more branches.

## Recipes

Each recipe is a complete `Events (JSON)` value. Adjust the coordinates, sheet paths and ids to your map. For recipes that use a picture, add the character sheet first (see [Assets](assets.md)).

### A character who talks

```json
[
  {
    "id": 1,
    "name": "Villager",
    "x": 12,
    "y": 7,
    "pages": [
      {
        "trigger": "action",
        "solid": true,
        "graphic": {
          "sheet": "img/characters/npc.png",
          "frameWidth": 16,
          "frameHeight": 16,
          "frame": 0
        },
        "commands": [
          { "command": "ShowText", "face": "Villager", "text": "Lovely weather today." },
          { "command": "ShowText", "face": "Villager", "text": "Mind the lava to the east!" }
        ]
      }
    ]
  }
]
```

Walk next to the villager, face them and press confirm.

### A door to another map

Create a second map first (it will be map 2). On map 1:

```json
[
  {
    "id": 1,
    "name": "House door",
    "x": 6,
    "y": 4,
    "pages": [
      {
        "trigger": "touch",
        "solid": false,
        "commands": [
          { "command": "PlaySE", "name": "door" },
          { "command": "TransferPlayer", "mapId": 2, "x": 5, "y": 8, "direction": "up" }
        ]
      }
    ]
  }
]
```

Stepping on the door cell starts the transfer. On map 2, add an event on the exit cell with `"mapId": 1`. Put the player's arrival cell **one step away** from the return door so they are not sent straight back.

### A treasure chest that opens once

Page 1 is the closed chest; page 2 takes over once switch 1 is on. This chest uses frames 1 (closed) and 2 (open) of a small sheet:

```json
[
  {
    "id": 2,
    "name": "Chest",
    "x": 3,
    "y": 3,
    "pages": [
      {
        "trigger": "action",
        "solid": true,
        "graphic": {
          "sheet": "img/characters/objects.png",
          "frameWidth": 16,
          "frameHeight": 16,
          "frame": 1
        },
        "commands": [
          { "command": "PlaySE", "name": "chest" },
          { "command": "SetSwitch", "switchId": 1, "value": true },
          { "command": "ShowText", "text": "You found a Potion!" }
        ]
      },
      {
        "conditions": [{ "type": "switch", "switchId": 1, "equals": true }],
        "trigger": "action",
        "solid": true,
        "graphic": {
          "sheet": "img/characters/objects.png",
          "frameWidth": 16,
          "frameHeight": 16,
          "frame": 2
        },
        "commands": [{ "command": "ShowText", "text": "The chest is empty." }]
      }
    ]
  }
]
```

(There is no command to give items yet; see [Current Limitations](current-limitations.md). The message and switch are how you track it for now.)

### An opening cutscene that plays once

```json
[
  {
    "id": 3,
    "name": "Intro",
    "x": 10,
    "y": 7,
    "pages": [
      {
        "conditions": [{ "type": "switch", "switchId": 9, "equals": false }],
        "trigger": "autorun",
        "solid": false,
        "commands": [
          { "command": "PlayBGM", "name": "theme" },
          { "command": "Wait", "frames": 60 },
          { "command": "ShowText", "text": "A long time ago, in a quiet village..." },
          { "command": "SetSwitch", "switchId": 9, "value": true }
        ]
      }
    ]
  }
]
```

Switch 9 starts off, so the page runs when the game starts. It turns the switch on at the end, which makes the page ineligible, so it never repeats. This pattern, **an autorun page that switches itself off**, is the safe way to use autorun.

### A character who changes what they say

```json
[
  {
    "id": 4,
    "name": "Guide",
    "x": 8,
    "y": 5,
    "pages": [
      {
        "trigger": "action",
        "solid": true,
        "commands": [
          { "command": "SetVariable", "variableId": 1, "operation": "add", "value": 1 },
          {
            "command": "ConditionalBranch",
            "condition": { "type": "variable", "variableId": 1, "comparator": ">=", "value": 3 },
            "then": [{ "command": "ShowText", "text": "You again? Fine. The cave is north." }],
            "else": [{ "command": "ShowText", "text": "I have nothing to say." }]
          }
        ]
      }
    ]
  }
]
```

Variable 1 counts conversations; from the third one on, the guide helps.

### An invisible trigger zone

```json
[
  {
    "id": 5,
    "name": "Draft",
    "x": 14,
    "y": 9,
    "pages": [
      {
        "trigger": "touch",
        "solid": false,
        "commands": [{ "command": "ShowText", "text": "A cold draught blows from the cave." }]
      }
    ]
  }
]
```

No `graphic` means invisible. It still triggers when the player steps on it.

## Tips and gotchas

- **Test often.** Export or use an [AI agent](ai-companion.md) to try things; small steps keep errors easy to find.
- Keep ids unique within a map. The same ids can be reused on different maps.
- A solid event (`solid: true`) with the `touch` trigger starts when the player **bumps** into it.
- A message waits for the player's confirm. A `parallel` event never receives that confirm, so **do not use `ShowText` in a `parallel` page**: the message would stay on screen and that page would stop.
- If an event never starts, check: Is its page's `conditions` list true? Is `trigger` what you expect? Is another event running (an autorun that never ends blocks everything)? Is the event inside the map?
- **Undo** (Ctrl+Z) reverts **Apply events** in one step.
