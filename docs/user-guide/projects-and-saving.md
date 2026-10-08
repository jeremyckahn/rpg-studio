# Projects and Saving

> **Important:** the editor keeps your project **in memory** until you save it. There is **no autosave**. The browser asks before you close or reload the tab with unsaved changes, and the editor asks before replacing an unsaved project, but save early and often anyway.

A **project** is everything that makes up your game: its settings, database, maps and art and sound files. A project is just a folder of plain files; see [Project File Format](project-file-format.md).

## Ways to keep your work

| Method                                                          | Browsers                                                              | Use it for                                                                                            |
| --------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **File ▸ Save** / **Open folder…**                              | Chrome, Edge, Brave, Opera (anything with the File System Access API) | Day-to-day work. Edits go straight into a folder you choose, ideal for putting the project under Git. |
| **File ▸ Download project (.zip)** / **Import project (.zip)…** | All browsers                                                          | Backups, moving a project between computers, and the only option in Firefox and Safari.               |

### Saving to a folder

1. **File ▸ Save** (Ctrl+S). The first time, the browser asks you to choose a folder and to allow access, and everything is written: the project files and every asset, including the starter tileset.
2. After that, **Save** writes only the files that changed (and removes the files of maps or assets you deleted). If nothing changed it says "Already saved".
3. The project name in the menu bar loses its **•** and shows the folder's name.

**Save to another folder…** writes a complete copy somewhere else, even if nothing has changed, and switches to it.

If the folder you choose (for the first Save or for **Save to another folder…**) already contains project files, a **This folder already has project files** window asks first. Saving overwrites files with the same name and never deletes anything else, so it lists any files that would stay behind: they are not part of your project, but they would show up as extra maps and assets the next time you open that folder. **Cancel** (or Esc) leaves the folder untouched and your project unsaved; **Save anyway** goes ahead. Pick an empty folder to avoid the question. Files that are not part of a project, such as a README, are ignored.

### Opening a project

**File ▸ Open folder…**, choose a folder containing a `project.json`. If anything inside is invalid (a broken JSON file, a map that points to a missing map, …) nothing is opened and the first few problems are listed, naming the file and field.

### Zip backups

**Download project (.zip)** produces `<project-name>-project.zip` containing the **whole** project including sprite sources. **Import project (.zip)…** loads one back. Zips that try to write outside the project (`../` paths) or expand beyond 512 MB are rejected.

### Starting over

**File ▸ New project** creates a starter project with one 20×15 grass map, a hero, a class, a potion and a skill. It replaces the open project. If you have unsaved changes the editor asks first (see below).

## Unsaved changes

A **•** after the project name in the menu bar means there is work that is not saved yet. (On a phone the name does not fit, so the dot appears on the **File** button instead.) It counts:

- edits to the project (painting, resizing, layers, database rows, events, the start position), and
- changes to assets: adding or replacing a file, and saving a sprite from the Sprite Editor.

Undoing back to the last saved state clears the dot, since nothing differs from what is saved. **Download project (.zip)** is a backup, not a save: the dot stays until you use **Save**.

The editor protects unsaved work in two ways:

1. **Leaving the page.** If you close or reload the tab, or navigate away, with unsaved changes, the browser shows its own "Leave site?" prompt. Cancel it to stay and save. (The wording is the browser's; web pages cannot change it.)
2. **Replacing the project.** **New project**, **Open folder…** and **Import project (.zip)…** replace the open project. When there are unsaved changes, a **Discard unsaved changes?** box appears _before_ anything happens, with:
   - **Cancel**: nothing changes.
   - **Discard changes**: carry on and lose them.
   - **Save, then continue** (browsers that can save to folders): saves first, and carries on only if the save went through. If you cancel the folder picker, nothing is replaced.

   In other browsers the box reminds you to download a zip first. When nothing is unsaved, these commands act at once.

A project that has been replaced cannot be recovered, and nothing is autosaved, so the prompts only help if you answer them carefully.

## Browser support

| Capability                           | Chrome / Edge / Brave / Opera | Firefox                        | Safari / iOS       |
| ------------------------------------ | ----------------------------- | ------------------------------ | ------------------ |
| Editing, undo, export, sprite editor | Yes                           | Yes                            | Yes                |
| Open folder / Save to a folder       | Yes                           | No (menu items are greyed out) | No                 |
| Zip download and import              | Yes                           | Yes                            | Yes                |
| Install as an app (offline)          | Yes                           | Limited                        | Add to Home Screen |

## What gets saved

Saving writes the project settings, the five database tables, one file per map, and every asset you added (`img/…`, `audio/…`). Deleted maps and removed assets are deleted from the folder too. Files in the folder that the editor does not know about (`README.md`, `.git`, …) are left alone.

Output is deterministic (stable ordering, two-space indentation), so Git diffs show only what you actually changed.
