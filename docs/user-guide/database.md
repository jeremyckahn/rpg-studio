# Database

The **Database** tab holds the data behind your game's characters and items, one table per tab:

| Tab         | What a row is                                                            |
| ----------- | ------------------------------------------------------------------------ |
| **Actors**  | A playable character: name, class, starting level, sprite                |
| **Classes** | A character type: base stats, per-level growth, skills learned at levels |
| **Items**   | Consumables, weapons, armour and key items                               |
| **Skills**  | Abilities with an MP cost, a target and effects                          |
| **Enemies** | Opponents with stats, rewards and drops                                  |

The number in each tab's label is how many rows it has. Every row has a numeric **id** that is unique within its table and is what other data refers to (an actor's `classId`, the party's actor ids, an enemy's drop `itemId`, …).

> **Status:** the database is fully editable and validated, and the engine uses the starting party's actor and its class for the player and for stat growth. Battles, menus, shops and inventory screens are **not built yet**, so items, skills and enemies are data waiting for those systems or for your own plugins. See [Current Limitations](current-limitations.md).

## Editing

- **Add actor / class / item / skill / enemy** appends a new row with sensible defaults (the button's label follows the open tab).
- Click a cell to edit it; press Enter or click away to apply. **Delete selected** removes the rows ticked in the checkbox column; the checkbox in the header ticks every row.
- Cells with structured values (stats, effects, learnings, drops, sprite) show **JSON**. Edit the JSON text directly.
- Every change is **validated against the schema before it is applied**. If a value is out of range, the wrong type, or breaks a reference, a red message explains why and the edit is rejected, leaving the data as it was. Typical messages: _"Actor 1 references missing class 99"_, a stat above its limit, a name that is empty.
- Database edits are undoable (Ctrl+Z).
- You cannot delete a row that something else still uses (for example a class used by an actor), and the message says what uses it.

## Tables in detail

### Actors

| Field                      | Meaning                                                                                                                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `name`               | Name is 1 to 64 characters                                                                                                                                                                                                              |
| `nickname`, `description`  | Optional text                                                                                                                                                                                                                           |
| `classId`                  | Must be an existing class                                                                                                                                                                                                               |
| `initialLevel`, `maxLevel` | 1 to 99                                                                                                                                                                                                                                 |
| `sprite`                   | Optional picture: `{ "sheet": "img/characters/hero.png", "frameWidth": 16, "frameHeight": 16 }`. Give the **first actor in the starting party** a sprite and that is how the player is drawn. See [Assets](assets.md#character-sheets). |

The **starting party** (which actors you begin with) is part of the project's settings, not the actors table. It defaults to actor 1 and is edited in `project.json` (see [Project File Format](project-file-format.md)).

### Classes

`baseStats` are the stats at level 1; `growth` is how much each stat rises per level (decimals allowed); `learnings` is a list of `{ "level": 2, "skillId": 1 }` entries.

The seven **stats** are `maxHp`, `maxMp`, `attack`, `defense`, `magic`, `speed` and `luck`.

### Items

`kind` is `consumable`, `weapon`, `armor` or `key`. `price` is gold. `effects` is a list such as `{ "type": "recoverHp", "value": 50 }`; the effect types are `recoverHp`, `recoverMp` and `damageHp`. `statBonuses` lists stats the item adds while equipped, for example `{ "attack": 5 }`.

### Skills

`mpCost`, a `target` (`self`, `ally`, `allAllies`, `enemy`, `allEnemies`), an `element` (`none`, `fire`, `ice`, `lightning`, `earth`, `light`, `dark`) and `effects` (same shapes as items).

### Enemies

`stats` (same seven), optional `sprite`, `experience` and `gold` rewards, `skillIds`, and `drops`: a list of `{ "itemId": 1, "chance": 0.25 }` where `chance` runs from 0 to 1.

## Switches and variables

Events use numbered **switches** (on/off) and **variables** (whole numbers) to remember what has happened. There is no table for them; just use any positive whole number as an id. Optional human-readable names can be given in `project.json` under `switchNames` and `variableNames`. See [Events](events.md#switches-and-variables).
