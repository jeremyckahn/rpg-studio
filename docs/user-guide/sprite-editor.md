# Sprite Editor

The **Sprite Editor** tab embeds [Piskel](https://www.piskelapp.com/), a free pixel-art editor, and connects it to your project. When you save a sprite, every map and event using it updates **immediately**, with no reload and no export step.

## Opening a sprite

1. Add the image to your project (see [Assets](assets.md)), or use one already there such as the default tileset `img/tilesets/basic.png`.
2. **Double-click** the `.png` or `.piskel` file in the Assets browser. The editor switches to the **Sprite Editor** tab and loads it.

The toolbar above the editor shows which file is open. Until you open something it reads _"Double-click a .png or .piskel in the asset browser to edit it"_.

There is no "new sprite" button yet. To draw something from scratch, add any small PNG (even a blank one from another program) of the size you need, then open and paint over it.

## Drawing

The embedded editor is the standard Piskel interface: pen, eraser, bucket, shapes, selection, mirror, colour palette, layers, and animation frames. Piskel's own help describes every tool. The pixel-art-friendly defaults apply: no smoothing, hard edges.

## Saving

Click **Save to project** (above the editor, not Piskel's own save or export menus). This writes two files next to each other:

| File            | Contents                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `<name>.png`    | The finished picture. All animation frames are laid out **side by side, left to right** in one image; layers are flattened. |
| `<name>.piskel` | The editable Piskel document with layers and frames intact.                                                                 |

A message confirms the saved size, such as _"Saved hero.png (48×64) and hero.piskel"_. Reopening the file later loads the `.piskel` if it exists, so layers survive; if only a `.png` exists it opens as a single flat frame.

Saving uses the project's normal asset path, so it counts as an unsaved change until you **File ▸ Save** the project. Sprite saves are **not** part of undo.

## Character sheets: draw the whole sheet as one frame

The engine reads walking animation from a **grid inside one image**: four rows (down, left, right, up) of three poses each (see [Assets](assets.md#character-sheets)). So draw the **whole sheet on one canvas**. For example, with 16×16-pixel characters the canvas is 48 pixels wide (3 poses) and 64 pixels tall (4 directions). Do not use Piskel's animation frames for walking: frames you add become extra columns to the right of the image, which is useful for animations you drive yourself but breaks the walk layout.

## Troubleshooting

- **"The embedded Piskel editor did not respond"**: the editor build is missing or still loading. Reload the page. If you run the editor from source, see [Troubleshooting and FAQ](troubleshooting-and-faq.md#the-sprite-editor-does-not-load).
- **My sprite did not change on the map**: make sure you clicked **Save to project**. The map redraws as soon as the save completes.
- **It will not open a file**: only `.png` and `.piskel` files can be opened.
