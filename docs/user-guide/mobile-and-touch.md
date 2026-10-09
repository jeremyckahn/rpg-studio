# Mobile and Touch

RPG Studio works on phones and tablets, both for **building** and for **playing**.

## The editor on a small screen

Below about 900 px wide the editor switches to a **compact layout**:

- The workspace (Map, Database or Sprite Editor) fills the screen.
- The panels that sit beside it on a desktop (Assets, Tools, Properties) become a **bottom sheet**. A **navigation bar** at the bottom switches between **Assets**, **Tools** and **Properties**. Tap the open section again to **collapse** the sheet and give the map the whole screen; tap it once more to reopen it. When you have not chosen anything, the **Tools** section (maps, layers, tileset) is open.
- **Portrait:** the sheet sits below the map. **Landscape:** the sheet sits to the right of it.
- The menu bar is slimmer: the app title is hidden and the companion status is an icon.
- Buttons and fields are larger, and text fields use a size that stops iOS from zooming in when you tap them.

Everything in the editor is available in both layouts. The compact layout uses the full screen height even while the browser's address bar collapses, and respects the notch and home indicator.

### Editing the map with touch

| Gesture                                    | Result                                                |
| ------------------------------------------ | ----------------------------------------------------- |
| **One finger**, tap                        | Uses the current tool on that cell (one tile painted) |
| **One finger**, drag                       | Paints a stroke with the current tool                 |
| **Two fingers**, drag                      | Pans the map                                          |
| **Two fingers**, pinch                     | Zooms in and out, one zoom level at a time            |
| **Pan tool** (hand icon) + one finger drag | Pans without needing two fingers                      |

A stroke only begins after your finger has moved a short distance, so putting down a second finger for a pan or pinch never paints a stray tile. Lifting one finger after a pinch keeps panning with the other; it does not start painting. The zoom buttons are hidden on small screens because pinch does the job. Zoom levels are whole numbers (100% to 800%) so pixel art stays sharp.

### Tips for touch editing

- Switch to the **Pan** tool when you want to move around with one hand.
- Use the **Tools** section for maps, layers and the tileset; collapse it while you paint big areas.
- Undo and Redo are in the top bar. There is no Ctrl+Z on a phone, so use ↶.
- The **Sprite Editor** (Piskel) and the **Database** table were designed for a mouse. They work, but are the least comfortable on a phone; a tablet or desktop is better for pixel art.
- Saving to a folder is generally not available in phone browsers. Use **File ▸ Download project (.zip)** regularly, and **Import project (.zip)…** to continue.

## Playing games on a phone

The **Play** tab runs your game in the editor with the same on-screen controls ([Playing Your Game in the Editor](playtesting.md#on-a-phone)). Exported games show an on-screen **D-pad** and an **A** button on touch devices. See [Playing and Exporting](playing-and-exporting.md#controls). In **portrait** the game is shown at the top with the controls beneath it; in **landscape** the controls float over the lower corners.

## Installing the editor as an app

- **Android / Chrome:** menu ▸ _Install app_ (or the install banner).
- **iPhone / iPad (Safari):** Share ▸ _Add to Home Screen_.
- **Desktop Chrome / Edge:** the install icon in the address bar.

Installed, the editor opens in its own window and works offline. When a new version is released a banner offers **Reload** or **Later**; the update never applies until you choose, so you will not lose unsaved work. If you have unsaved changes the banner warns you ("Reload anyway").
