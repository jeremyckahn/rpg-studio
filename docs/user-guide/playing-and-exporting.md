# Playing and Exporting

RPG Studio exports your game as a **static website**: a folder of files that any web host can serve. There is no installer, no server code and no editor code in the export.

## Export your game

1. Make sure your work is saved (see [Projects and Saving](projects-and-saving.md)).
2. **File ▸ Export game (.zip)**. The browser downloads `<project-name>.zip`.
3. A message reports how many files were exported and how many authoring files (such as `.piskel` sprite sources) were left out.

### What is in the zip

```
index.html        the page that starts the game (its title is your project name)
game.json         list of files the game loads
project.json      settings
data/             actors, classes, items, skills, enemies
maps/             one file per map
img/              your images
audio/            your sound and music
engine/player.js  the game engine (one self-contained file)
plugins/          only plugins your project enables, and only their game-side files
```

Sprite-editor sources (`.piskel`), files of other types, and editor-only plugin code are **not** included. Your project folder keeps them.

### When an export is refused

The exporter checks your game first and refuses to produce a broken one, listing **every** problem at once. For example: an enabled plugin whose files are missing or invalid, a map using a tileset that is not in the project, or a missing engine build (only when running the editor from source).

## Play it locally

Browsers will not run the game if you double-click `index.html`, because the game loads its data with web requests that `file://` pages cannot make. Serve the unzipped folder instead, for example:

```bash
cd my-game
python3 -m http.server 8000      # then open http://localhost:8000
```

or `npx serve`, or any static server you like.

## Publish it

Anything that serves static files works, since the game uses relative paths and can live at the root of a domain or in a sub-folder:

- **itch.io:** create a project of kind _HTML_, upload the zip, tick **This file will be played in the browser**.
- **GitHub Pages, Netlify, Vercel, Cloudflare Pages:** upload or push the unzipped folder.
- **Your own website:** copy the folder anywhere that serves static files.

## Controls

| Action                             | Keyboard                      | Touch screen                                           |
| ---------------------------------- | ----------------------------- | ------------------------------------------------------ |
| Move                               | Arrow keys or **W A S D**     | On-screen D-pad (slide your thumb to change direction) |
| Confirm / talk / advance a message | **Enter**, **Space** or **Z** | **A** button                                           |

The on-screen controls appear automatically on touch devices and sit **below the game in portrait** so they never hide the picture, or float over the corners in landscape. Keyboard and touch can be used together. Short taps are never lost. A quick tap still moves one tile.

## What the game does today

- Walks the player around tile-aligned maps at 4 tiles per second, with collision, and animates character sheets that use the walking layout (see [Assets](assets.md#character-sheets)).
- Runs [events](events.md): messages, switches and variables, branches, waits, map transfers, and music and sound.
- Draws everything **pixel-perfect**: crisp pixels at a whole-number zoom, centred, with the camera following the player and stopping at map edges. The visible area is 20×15 tiles before scaling.
- Plays music (BGM), ambience (BGS), jingles (ME) and effects (SE). Browsers only start sound after a key press or tap.

Not built yet: battles, menus, inventory and shop screens, a save/load screen, and showing pictures. See [Current Limitations](current-limitations.md).

## Troubleshooting a game

- **Black page, nothing happens:** open the browser console (F12). A message there names the missing or invalid file. Most often the folder is opened as `file://`; serve it instead.
- **A sprite or tile looks wrong:** check `frameWidth` / `frameHeight` and the map's tile size ([Assets](assets.md)).
- **No sound:** press a key or tap once; check the sound's file name and folder ([Assets](assets.md#audio-formats)).
- **Stuck on a cutscene:** an `autorun` page never switched itself off; see [Events](events.md#triggers).
