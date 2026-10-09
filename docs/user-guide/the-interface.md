# The Interface

RPG Studio has two layouts. On a **desktop or large tablet** (wider than 900 px) panels sit side by side. On a **phone or small tablet** the editor shows one workspace with a bottom sheet you switch with a navigation bar (see [Mobile and Touch](mobile-and-touch.md)). The features are the same in both.

## Desktop layout

```
┌──────────────────────────────────────────────────────────────────┐
│ RPG Studio  File Edit View │ ↶ ↷        Companion: off  My Game • │  menu bar
├────────────┬─────────────────────────────────────┬───────────────┤
│ Assets     │ [Map] [Play] [Database] [Sprite..]  │ Properties    │
│ (files)    │ ┌─ toolbar ───────────────────────┐ │ Map           │
│            │ │ tools · overlays · zoom         │ │ Game start    │
│ Tools      │ ├─────────────────────────────────┤ │ Events (JSON) │
│ Maps       │ │                                 │ │               │
│ Layers     │ │          map canvas             │ │               │
│ Tileset    │ │                                 │ │               │
│            │ └─────────────────────────────────┘ │               │
└────────────┴─────────────────────────────────────┴───────────────┘
```

- **Left column:** the **Assets** browser on top, then (on the Map tab) the **Tools** panel with maps, layers and the tileset palette.
- **Centre:** tabs for the four workspaces, **Map**, **Play** (your game, running in the editor; see [Playing Your Game in the Editor](playtesting.md)), **Database** and **Sprite Editor**.
- **Right column:** the **Properties** panel (Map tab only).

## The menu bar

The project name appears at the right. A **•** after it means you have unsaved changes (project edits or asset changes; see [Projects and Saving](projects-and-saving.md#unsaved-changes)); the folder name follows once the project has been saved to one.

### File

| Item                        | What it does                                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **New project**             | Replaces the open project with a fresh starter project. Asks first if you have unsaved changes.                             |
| **Open folder…**            | Loads a project from a folder on your computer (Chromium browsers only). Asks first if you have unsaved changes.            |
| **Import project (.zip)…**  | Loads a project from a zip made by **Download project**. Replaces the open project; asks first if you have unsaved changes. |
| **Save** (Ctrl+S)           | Writes changes to the project's folder. If the project has no folder yet, asks you to pick one. Chromium browsers only.     |
| **Save to another folder…** | Saves a copy into a different folder and continues working there.                                                           |
| **Download project (.zip)** | Downloads everything (data, art and sound) as one zip. Works in every browser; a good backup.                               |
| **Export game (.zip)**      | Builds the playable game. See [Playing and Exporting](playing-and-exporting.md).                                            |

### Edit

**Undo** (Ctrl+Z) and **Redo** (Ctrl+Shift+Z or Ctrl+Y). The ↶ ↷ buttons in the bar do the same. Undo covers everything that changes your project (painting, resizing, layers, database edits, event edits, start position). It does not cover uploading or deleting assets, view settings, or edits you make inside the Sprite Editor before saving. Undo history is cleared when you open or create a project. A brush stroke, a flood fill or a batch from an AI agent each undo as one step.

### View

Show or hide the **grid**, show or hide the **collision** overlay, **dim other layers**, and **zoom in/out**.

### Companion

The button on the right shows **Companion: off / connecting… / connected** and opens the connection dialog. See [AI Companion](ai-companion.md).

## Keyboard shortcuts

| Keys                               | Action                                            |
| ---------------------------------- | ------------------------------------------------- |
| Ctrl/Cmd + S                       | Save                                              |
| Ctrl/Cmd + Z                       | Undo (ignored while typing in a text field)       |
| Ctrl/Cmd + Shift + Z, Ctrl/Cmd + Y | Redo                                              |
| Space + drag                       | Pan the map                                       |
| Mouse wheel                        | Zoom the map (100%, 200%, 300%, 400%, 600%, 800%) |
| Middle or right mouse drag         | Pan the map                                       |

## The three workspaces

- **Map**: paint tiles, set collision, manage maps and layers, write events. See [Building Maps](building-maps.md).
- **Database**: edit actors, classes, items, skills and enemies in tables. See [Database](database.md).
- **Sprite Editor**: draw and edit pixel art. See [Sprite Editor](sprite-editor.md).

## Messages and warnings

Short messages ("Saved 3 file(s)…", errors from a refused edit) appear at the bottom of the screen. Errors stay for about ten seconds. Edits the editor refuses explain why (for example "Map 2 is still the destination of event 1 on map 1"); nothing is changed when an edit is refused.
