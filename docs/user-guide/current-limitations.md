# Current Limitations

RPG Studio is young. This page lists what is **not built yet** or works differently from what you might expect, so you can plan around it. It is kept up to date as features land.

## Saving and safety

- **No autosave.** The editor warns before you leave the page or replace a project with unsaved changes, but it keeps no draft: unsaved work cannot be recovered after a crash or a confirmed discard. See [Projects and Saving](projects-and-saving.md#unsaved-changes).
- Saving to a folder needs a Chromium-based desktop browser. Everywhere else, use zip download and import.

## Maps

- No control to choose a different **tileset** for a map from the editor; use your own art by replacing `basic.png` or editing the map file ([Assets](assets.md#using-your-own-tileset)). New maps always start on the default tileset, whose tiles are 16 pixels.
- The Collision tool only toggles solid cells; **one-way ledges** need a hand-edited map file or an AI agent.
- No map events panel or visual placement: events are written as JSON ([Events](events.md)).
- No auto-tiling, copy and paste, or rectangle and ellipse tools. (Flood fill and an AI agent's rectangle fill do exist.)

## Events and game systems

- **No battles.** The database has enemies, skills, items and classes, but there is no battle system yet.
- No menus, inventory or equipment screens, shops, or a save/load screen in the player.
- Events have commands for **messages, switches, variables, map transfers, sound and music, waiting and branches**. Not yet: giving or taking items or gold, changing the party, moving or turning events, showing pictures, choices ("Yes / No"), loops, and labels.
- Switch and variable **names** can only be set by editing `project.json`.
- The game view is **20×15 tiles**, the same in portrait and landscape.

## The Play tab

- The game is closed when you leave the tab; there is no resume across visits. Use **Pause** to keep a game while you stay on the tab.
- No volume or mute control yet.
- A plugin's game-side code runs in the editor's page, so a plugin that never finishes would freeze the editor ([details](playtesting.md#how-it-differs-from-an-exported-game)).
- It checks that the game plays, not that the export works: still export and play before you publish.

## Art and sound

- **Sprite Editor:** there is no "new sprite" command; start from an existing PNG. Piskel is not optimised for touch screens.
- No way to delete or rename an asset inside the editor.
- Audio playback is verified with automated mocks, not exhaustively on every browser; if a browser misbehaves, [report it](https://github.com/jeremyckahn/rpg-studio/issues).

## Plugins

- The editor does not yet auto-load a project's `plugins/<id>/editor.js`; game-side plugins work. See [Plugins](plugins.md#what-works-today).

## Mobile

- The **Database** grid and **Sprite Editor** are the least comfortable parts on a phone. Everything else has a compact layout and touch gestures. See [Mobile and Touch](mobile-and-touch.md).

## Where progress is tracked

Known gaps for developers are listed in the repository's [`docs/README.md`](../README.md#known-gaps-and-limitations-single-list).
