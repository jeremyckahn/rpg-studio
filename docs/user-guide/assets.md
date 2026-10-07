# Assets

Assets are the image and sound files your game uses. They live in the **Assets** browser (top of the left column on desktop, the **Assets** section on a phone).

## Adding assets

Click **Add** and choose what kind of file you are adding; the file picker then opens, and you can select several files at once. The kind decides which folder the file goes into:

| Kind              | Folder            | Accepted files       |
| ----------------- | ----------------- | -------------------- |
| Tileset image     | `img/tilesets/`   | PNG, GIF, WebP       |
| Character sheet   | `img/characters/` | PNG, GIF, WebP       |
| Picture           | `img/pictures/`   | PNG, JPEG, GIF, WebP |
| Music (BGM)       | `audio/bgm/`      | any audio file       |
| Ambience (BGS)    | `audio/bgs/`      | any audio file       |
| Jingle (ME)       | `audio/me/`       | any audio file       |
| Sound effect (SE) | `audio/se/`       | any audio file       |

Only the file's own name is used; folders in the name are dropped. **Adding a file with the same name as an existing one replaces it.**

Assets are listed by folder. **Double-click** a `.png` or `.piskel` file to edit it in the [Sprite Editor](sprite-editor.md). Other file types just show their path.

There is no button to delete or rename an asset yet. To remove one, delete it from the project folder and re-open the project. Assets are saved with the project; see [Projects and Saving](projects-and-saving.md).

### Audio formats

Use **OGG**, **MP3**, **M4A** or **WAV**. The game finds a sound by name, so an event that plays `town` looks for `town.ogg`, `town.m4a`, `town.mp3` or `town.wav` in the right folder, in that order. Pick **OGG or MP3** for the widest browser support.

The four audio kinds behave differently:

| Kind            | Typical use                 | Behaviour                                 |
| --------------- | --------------------------- | ----------------------------------------- |
| **BGM**         | Background music            | Streams, loops; one at a time             |
| **BGS**         | Ambience (wind, rain)       | Streams, loops; plays alongside BGM       |
| **ME** (jingle) | Victory fanfare, item found | Short; **ducks the music** while it plays |
| **SE**          | Footsteps, doors, UI        | Short effects that can overlap            |

A sound that is named in an event but missing from the project is skipped quietly; the game does not crash. Browsers only start audio after the player interacts with the page (a key press or tap), so the first music may start a moment after the game loads.

## Tilesets

A **tileset** is one image divided into a grid of equal square tiles. Rules:

- Tile width and height equal the map's **tile size** (16, 24, 32 or 48 pixels).
- The image's width should be a multiple of the tile size.
- Tiles are numbered **1, 2, 3, …** left to right, top to bottom. Tile `0` means empty.

The default tileset is `img/tilesets/basic.png`: 16 tiles of 16×16 pixels in two rows of eight.

### Using your own tileset

The editor does not yet let you pick a different tileset per map from a menu. Two ways to use your own art:

1. **Replace the default.** Add a **Tileset image** named exactly `basic.png`. It replaces the default, and every map using it updates immediately. Keep the map's tile size matching.
2. **Edit the map file.** Add your image (for example `town.png`) as a Tileset image, save the project to a folder, and change the `"tileset"` value in `maps/map-001.json` to `img/tilesets/town.png`, then re-open the project.

You can also paint over the default tileset yourself: double-click `basic.png` in the Assets browser to edit it in the [Sprite Editor](sprite-editor.md); saving it updates the map the moment you switch back.

## Character sheets

A **character sheet** is an image of animation frames. Events and actors reference a sheet along with the size of one frame (`frameWidth` × `frameHeight`).

If the sheet has **at least 3 columns and 4 rows** of frames, the game animates it in the common RPG layout:

```
            column 1   column 2   column 3
 row 1      down       down       down        (step, stand, step)
 row 2      left       left       left
 row 3      right      right      right
 row 4      up         up         up
```

The middle column is the standing pose; the outer columns are the two walking steps. A smaller sheet is a single still picture.

A hero is drawn when the starting party's first **actor** has a `sprite` (see [Database](database.md#actors)). Events show a picture through a page's `graphic` (see [Events](events.md#giving-an-event-a-picture)).

## Pictures

The **Picture** kind stores general images in `img/pictures/`. They are included in the export; no event command displays them yet.

## What an export includes

PNG, JPEG, GIF, WebP and AVIF images under `img/`, and OGG, MP3, M4A and WAV sound under `audio/`. Sprite-editor source files (`.piskel`) are left out of an export but stay in your project. See [Playing and Exporting](playing-and-exporting.md).
