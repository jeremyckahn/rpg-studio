# Getting Started

This walkthrough takes you from an empty editor to a small game you can walk around in. It takes about ten minutes.

## 1. Open the editor

Go to <https://rpg-studio.com>. The editor opens with a new project called **My Game**: one 20×15 grass map, a hero, and a few starter database entries. Nothing is saved yet; see [Projects and Saving](projects-and-saving.md).

**Recommended browser:** a Chromium-based browser (Chrome, Edge, Brave, Opera) gives you the best experience because it can save straight into a folder on your computer. Firefox and Safari work too, but save through zip downloads instead. See [Projects and Saving](projects-and-saving.md#browser-support).

You can install the editor as an app (Chrome: the install icon in the address bar; iOS Safari: Share ▸ Add to Home Screen). Once installed it also works offline. When a new version is released, a banner appears with **Reload** and **Later**; nothing reloads until you choose.

## 2. Look around

- The **top bar** has the **File**, **Edit** and **View** menus, undo and redo, and the companion status.
- The **Map** tab is where you paint. The **Tools** panel lists your maps, layers and tileset; the **Properties** panel has map settings and the event list.
- The **Database** tab holds actors, items and the rest; **Sprite Editor** is for pixel art.

Full tour: [The Interface](the-interface.md).

## 3. Paint some terrain

1. On the **Map** tab, pick the **Pencil** (the brush icon in the toolbar).
2. In the **Tools** panel, scroll to **Tileset** and click a tile (a yellow outline shows your choice). Try the water or wall tiles.
3. Click and drag on the map. Hold **Space** and drag, or use the **Pan** tool, to move around. Scroll the mouse wheel to zoom.
4. Made a mistake? **Ctrl+Z** undoes a whole brush stroke in one step.

More: [Building Maps](building-maps.md).

## 4. Make some tiles solid

By default the player can walk anywhere. Choose the **Collision** tool (the circle-with-a-line icon) and click or drag over the walls and water. Turn on the **collision overlay** in the toolbar to see blocked cells in red. Clicking an already-solid cell first makes the stroke _clear_ cells instead.

## 5. Add a character to talk to

Maps become interactive through **events**. In the **Properties** panel, scroll to **Events (JSON)** and replace the contents with:

```json
[
  {
    "id": 1,
    "name": "Greeter",
    "x": 12,
    "y": 7,
    "pages": [
      {
        "trigger": "action",
        "solid": true,
        "commands": [{ "command": "ShowText", "text": "Welcome to my game!" }]
      }
    ]
  }
]
```

Click **Apply events**. A red error box means something is wrong with the JSON, and tells you what. A character on the map will need a picture: see [Events](events.md#giving-an-event-a-picture).

## 6. Play it

Click the **Play** tab to walk around your game right away; it updates as you keep editing ([Playing Your Game in the Editor](playtesting.md)).

To get a game you can share, export the game from **File ▸ Export game (.zip)**, unzip it, and serve the folder with any static web server (opening `index.html` directly from disk does not work in browsers). Walk with the arrow keys or WASD and press **Enter**, **Space** or **Z** to talk to events. Step-by-step: [Playing and Exporting](playing-and-exporting.md).

## 7. Save your work

Use **File ▸ Save** (Ctrl+S) to write the project into a folder on your computer, or **File ▸ Download project (.zip)** as a backup. **The editor does not autosave.** A **•** next to the project name shows unsaved changes, and the browser asks before you close the tab with unsaved work. See [Projects and Saving](projects-and-saving.md#unsaved-changes).

## Where next

- Draw your own art: [Sprite Editor](sprite-editor.md)
- Add music and sound: [Assets](assets.md)
- Script doors, chests and cutscenes: [Events](events.md)
- Fill in heroes and items: [Database](database.md)
