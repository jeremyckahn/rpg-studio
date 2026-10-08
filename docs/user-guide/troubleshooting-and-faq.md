# Troubleshooting and FAQ

## Saving and projects

### I closed the tab and lost my work

The editor keeps the project in memory and does **not** autosave. The browser asks "Leave site?" when you close or reload with unsaved changes (a **•** next to the project name shows you have some), but if you chose to leave, or the browser crashed, the work is gone. Save with **Ctrl+S** (Chromium browsers) or **File ▸ Download project (.zip)** often. See [Projects and Saving](projects-and-saving.md#unsaved-changes).

### Save and Open folder are greyed out

Your browser does not support saving to folders (Firefox, Safari and phone browsers). Use **Download project (.zip)** and **Import project (.zip)…** instead, or switch to Chrome, Edge, Brave or Opera.

### Opening a project fails with a list of problems

Something in the folder is invalid: a JSON file with a syntax error, a value out of range, an unknown field, or a reference to something missing (a map that does not exist, an actor whose class is gone). The message names the file and field. Fix it in a text editor and open the folder again. See [Project File Format](project-file-format.md).

### New project / Open folder / Import replaced my project

These replace the open project. When you have unsaved changes the editor asks first (**Discard unsaved changes?**); if you chose **Discard changes**, undo history is cleared and the old project cannot be recovered unless you saved or downloaded it first.

### The editor says an edit was "refused"

That is validation working, and nothing was changed. The message tells you what to fix: "Cell (99, 0) is outside the 6x4 map", "Map 2 is still the destination of event 1 on map 1", "Actor 1 references missing class 99".

## Editing

### Undo did not undo my change

Undo covers edits to the project data: painting, resizing, layers, database rows, events, and the start position. It does **not** cover uploading assets, deleting assets, view toggles (grid, zoom), or saving a sprite in the Sprite Editor.

### I painted a tile but the character walks through it

Tiles and collision are separate. Use the **Collision** tool to mark cells solid; turn on the collision overlay to see them. See [Building Maps](building-maps.md#collision).

### My tiles look sliced or misaligned

The map's **tile size** must match the tiles in the tileset image, and the default tileset has 16-pixel tiles. See [Assets](assets.md#tilesets).

### The sprite editor does not load

The embedded Piskel editor shows _"did not respond"_ when its files are missing or it is still starting. Reload the page. If you run the editor from source, regenerate it with `pnpm --filter @rpgstudio/editor piskel:vendor`, then **restart the dev server**.

### My saved sprite did not appear on the map

Click **Save to project** in the toolbar above the sprite editor (not Piskel's own save). The map redraws when it finishes.

### Pinch or two-finger drag paints on my phone

Make sure the page is not zoomed by the browser. Pinch gestures on the map canvas are handled by the editor. If strokes still paint, switch to the **Pan** tool to move around.

### A new version banner appeared

The app downloaded an update. Choose **Reload** when you are ready (the banner warns if you have unsaved changes), or **Later**. The update never applies by itself.

## Events

### My event does nothing

Check, in order: the page's `conditions` are all true (switches off by default, variables 0); the `trigger` is what you expect (`action` needs you to face a solid event and press confirm); the event is inside the map; another event is not running (an `autorun` that never switches itself off blocks everything); and for pictures, the sheet path and frame size are correct. See [Events](events.md#tips-and-gotchas).

### The game is stuck on a message or cutscene

An `autorun` page that is still eligible restarts forever. End it by setting a switch the page's condition checks. A `ShowText` inside a `parallel` page never gets its confirm and stays on screen; use `action`, `touch` or `autorun` for messages.

### "Apply events" shows a red box

Read the first line: it gives a path such as `events.0.pages.0.commands.1.volume` and the problem. Common causes: a trailing comma, single quotes, a misspelled field (unknown fields are rejected), or a number outside its range.

## Exported games

### Black page, or nothing happens

Open the browser console (F12). Serve the folder over HTTP instead of opening `index.html` from disk. See [Playing and Exporting](playing-and-exporting.md#play-it-locally).

### No sound

Press a key or tap once (browsers block audio until you interact). Check the file name (the name in the event, without extension) and that it is in the right folder (`audio/bgm`, `bgs`, `me` or `se`). A missing sound is skipped quietly.

### It works on desktop but not on my phone

The game shows an on-screen D-pad and **A** button on touch devices. If they are not showing, the device did not report a touch screen. See [Mobile and Touch](mobile-and-touch.md).

## AI companion

See [AI Companion](ai-companion.md#troubleshooting-the-connection).

## Still stuck?

Search or open an issue at <https://github.com/jeremyckahn/rpg-studio/issues> and include your browser, what you did, and what you saw (any red message, plus the console output).
