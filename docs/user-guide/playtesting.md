# Playing Your Game in the Editor

The **Play** tab runs your game inside the editor, from the project exactly as it is right now. You do not export, unzip or serve anything: open the tab and walk around. Edit the map, an event or a database record and the game updates while you play.

## Opening it

Click the **Play** tab, next to **Map**. The game starts at once and takes the keyboard.

| Action                             | Keyboard                      | Touch screen                                           |
| ---------------------------------- | ----------------------------- | ------------------------------------------------------ |
| Move                               | Arrow keys or **W A S D**     | On-screen D-pad (slide your thumb to change direction) |
| Confirm / talk / advance a message | **Enter**, **Space** or **Z** | **A** button                                           |
| Pause                              | **Esc**                       | The **Pause** button in the toolbar                    |
| Resume                             | **Enter**, or click the game  | Tap the game, or the **Resume** button                 |

Key presses made with **Ctrl**, **Cmd** or **Alt** held are never taken by the game, so Ctrl+Z still undoes your last edit while the game has the focus.

The status line under the game shows whether it is running, the map name, the player's tile and the game's tick counter.

## Pausing to save your computer's effort

A paused game does no work at all: the simulation, the drawing and the sound all stop, and the last picture stays on screen. Use it whenever you want the editor to be quiet.

The game pauses **by itself** when:

- **you pressed Pause or Esc.** It stays paused until you resume it.
- **keyboard focus leaves the game**, for example because you clicked the asset browser. The game says **Click to play**. Clicking the toolbar does not count; it is still part of the Play tab.
- **the browser tab is in the background.** It continues when you come back, unless you had paused it yourself.

**Restart** begins again from the project's start position. Leaving the Play tab closes the game; the next visit starts a fresh one.

## Play from a tile

Testing the end of a long game should not mean walking there first. In the **Map** tab choose the **Play from here** tool (the play-button icon in the toolbar) and click or tap a tile. The **Play** tab opens with the player standing on that tile of that map.

- Nothing in your project changes. The start position in **Game start** and your saved file stay as they are, and this does not count as unsaved work.
- The toolbar above the game says **Starting at** the tile. **Restart** and, with **Keep my place** off, every reload begin there. The ✕ on that label clears it and starts from the project's own start.
- Your previous tool comes back as soon as you have chosen a tile.
- The choice is forgotten when you open or create another project. If you later resize the map so the tile no longer exists, the label disappears and the project's start is used.

## The Debug panel

On the Play tab the right-hand column shows what the game is doing, read-only:

- whether it is running or paused, and its tick counter;
- the map, the player's tile and facing direction, the message on screen and whether an event is running;
- the party (level, HP, MP), the gold and the items held;
- every **switch** and **variable** that has a name in `project.json` ([Events](events.md#switches-and-variables)) or has been set so far, with the name if it has one and its value (switches ON or OFF).

On a phone it is the **Debug** section of the bottom sheet. Clicking inside the panel counts as leaving the game, so the game pauses; the panel keeps showing the values at the moment it paused, and resuming brings them back to life.

## It updates as you edit

Change the project while the Play tab is open (use another browser tab or window, an AI agent, or the Undo shortcut: the Play tab itself has no editing tools) and, after a quiet moment, the game is rebuilt from the new project. A brush stroke reloads once, not once per tile.

With **Keep my place** on (the default) you continue where you were: the same map, tile and direction, with the same switches, variables, party, gold and items. Music keeps playing without restarting. Two things are not kept:

- **A running cutscene.** A game cannot be saved in the middle of an event, so a reload that lands inside one continues from the last place you stood _before_ it, and the cutscene plays again from its start.
- **A place that no longer exists.** If you delete the map you are standing on, or shrink it so your tile is gone, the game starts again from the beginning and the toolbar says why.

With **Keep my place** off, every edit starts the game again from the beginning.

Edits made while the game is **paused** are not applied at once. The status line says _The project changed; the game updates when you resume_, and the game catches up in one step before it moves again.

New or replaced pictures show up on their own: save a sprite in the [Sprite Editor](sprite-editor.md) and the character changes in the game.

## When the game cannot start

If something would also stop you from [exporting](playing-and-exporting.md#when-an-export-is-refused), the Play tab lists it instead of showing a black screen: an enabled [plugin](plugins.md) whose files are missing or invalid, or a map that uses a tileset that is not in the project. Fix it and the game starts by itself.

If the project becomes unplayable while you are playing, the game you have keeps running and a red notice names the problem; the next good edit reloads it. If the game itself hits an error it pauses and offers **Restart**.

## How it differs from an exported game

It is the same engine, started by the same code, but it runs inside the editor rather than as a separate page:

- A plugin's game-side code runs in the editor's page. A plugin that never finishes would freeze the editor, which an exported game would only freeze itself.
- Sound starts after your first click or key press, as in any browser.
- It does not check that the _export_ works. Export and play it ([Playing and Exporting](playing-and-exporting.md)) before you publish.

## On a phone

The Play tab works on a phone: the D-pad and **A** button appear below the game in portrait and over the corners in landscape, as in an exported game. See [Mobile and Touch](mobile-and-touch.md).

## For AI agents

An agent can ask what the Play tab is doing with the `GET_PREVIEW_STATE` query: whether it is open, whether it is running or why it is paused, how many times it has reloaded (so the agent can tell its edit landed), and the game's map, position, switches, variables, gold and message. See [AI Companion](ai-companion.md#the-browser-console).
