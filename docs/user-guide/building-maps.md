# Building Maps

Maps are grids of square tiles. Open the **Map** tab to edit them. The **Tools** panel (left) lists your maps and layers and holds the tileset palette; the **Properties** panel (right) has map settings.

## Maps

- The **Maps** list shows `id. name` with the size, and marks the **start** map. Click a map to edit it.
- **+** creates a map. Choose a name, a width and height (1 to 512 tiles) and a tile size of 16, 24, 32 or 48 pixels. New maps are filled with the first tile (grass) and use the project's default tileset, `img/tilesets/basic.png`, which has **16-pixel** tiles, so pick **16** unless you have replaced that tileset (see [Assets](assets.md#tilesets)).
- The trash button deletes a map. It is disabled for the start map, and refused if any event on another map still sends the player there.
- Each map stores its own tile size and tileset path, and the tile size must match the tiles in the tileset image. The editor has no control for choosing a different tileset yet; see [Assets](assets.md#tilesets) for how to use your own.

## Layers

Each map has up to **8 layers**, drawn bottom to top. New maps have three:

| Layer       | Purpose                                             |
| ----------- | --------------------------------------------------- |
| **Ground**  | Floors and terrain (filled with grass at first)     |
| **Objects** | Walls, trees, furniture                             |
| **Overlay** | Drawn **above** characters: roofs, treetops, arches |

In the **Layers** list (top layer first):

- Click a layer to paint on it.
- The **eye** hides or shows it in the editor (hiding does not delete it).
- The **arrow-up** button toggles "draw above characters".
- **+** adds a layer; the trash button removes one.

Turn on **Dim inactive layers** (the layers icon in the toolbar) to fade every layer except the one you are painting.

## The toolbar

| Tool               | Icon                | What it does                                                                                                                                                                                                                       |
| ------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pencil**         | brush               | Paints the selected tile. Drag to paint a line without gaps.                                                                                                                                                                       |
| **Fill**           | paint bucket        | Floods a connected area of identical tiles on the current layer.                                                                                                                                                                   |
| **Eraser**         | magic wand          | Clears tiles (sets them to empty) on the current layer.                                                                                                                                                                            |
| **Collision**      | circle with a slash | Marks cells solid or passable. See below.                                                                                                                                                                                          |
| **Pan**            | hand                | Dragging moves the view instead of painting. Handy on touch screens and trackpads.                                                                                                                                                 |
| **Play from here** | play button         | Click a tile to open the **Play** tab with the game starting on it, instead of at the project's start. Changes nothing in the project, and your previous tool comes back. See [Play from a tile](playtesting.md#play-from-a-tile). |

Next to the tools are three toggles: **grid**, **collision overlay** and **dim inactive layers**, then **zoom out / in** with the current percentage. The caption at the right shows the map name, layer and selected tile.

## Choosing a tile

At the bottom of the **Tools** panel is the **Tileset**. Click a tile to select it; a yellow outline marks it, and a preview follows your cursor on the map. Tiles are numbered left to right, top to bottom, starting at **1**; tile **0** is empty. The default tileset has 16 tiles: grass, dirt, water, sand, stone floor, wall, tree, flowers, wood floor, door, bridge, lava, snow, cobblestone, chest and pit.

## Collision

Collision decides where characters can walk. Use the **Collision** tool and turn on the **collision overlay** to see it (red cells are solid).

- The **first cell** you click decides the stroke: clicking a passable cell makes everything you drag over solid; clicking a solid cell clears everything you drag over.
- Collision is separate from tiles. A wall tile does not block anyone until you also mark the cells solid.
- One-way ledges (blocking only one direction) exist in the data format but have no tool yet; an AI agent or a hand-edited map file can set them. See [Current Limitations](current-limitations.md).

## Moving around the map

| Action | Mouse                                                                    | Touch                            |
| ------ | ------------------------------------------------------------------------ | -------------------------------- |
| Pan    | Hold **Space** and drag, middle or right mouse drag, or the **Pan** tool | Two fingers, or the **Pan** tool |
| Zoom   | Mouse wheel (steps through 100%, 200%, 300%, 400%, 600%, 800%)           | Pinch                            |
| Paint  | Left-drag                                                                | One finger                       |

Zoom steps are whole numbers so pixel art stays crisp.

## Map properties

In the **Properties** panel:

- **Name**: rename the map (applies when you leave the field or press Enter).
- **Width / Height**: resizing keeps existing tiles where they still fit, discards what falls outside, removes events that end up off the map, and moves the start position back inside if needed. The editor refuses a resize that would break something (for example an event that teleports the player to a cell that no longer exists) and tells you why.
- The tileset path and tile size are shown for reference.

## Game start

Under **Game start**: **Start map**, **Start X**, **Start Y** (in tiles, counting from 0 at the top-left) and the **Project name**. Changing the start map resets the position to 0, 0, so set X and Y afterwards. The start cell must be inside the map: if you type a position outside it, a warning says so and the field goes back to the old value.

## Tips

- Paint the ground first, then objects, then overlays; keep collision for last.
- Use the Overlay layer for anything the player should walk _behind_ (tree canopies, roof edges).
- Undo is your friend: every stroke is one step.
- Events (NPCs, doors, chests) are added in the **Properties** panel; see [Events](events.md).
