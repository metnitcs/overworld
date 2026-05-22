# Kenney pixel-art assets (CC0)

The game wires sprites from two free Kenney.nl packs. Until you drop the
files in place the game falls back to emoji rendering and prints a console
warning — **gameplay is not blocked**, just less pretty.

License: every Kenney pack used here is CC0 (public domain). No attribution
required, commercial use allowed. See https://kenney.nl/license

## What to download

| Pack | Link | Where to put it |
|---|---|---|
| **Tiny Town** | https://kenney.nl/assets/tiny-town | `tiny-town/tilemap_packed.png` |
| **Tiny Dungeon** | https://kenney.nl/assets/tiny-dungeon | `tiny-dungeon/tilemap_packed.png` |

## Step-by-step

1. Open each pack link → click **Download** (no signup needed).
2. Unzip the downloaded `.zip`.
3. Inside the unzipped folder navigate to `Tilemap/` — you'll find
   `tilemap_packed.png` (single atlas with 1px transparent padding).
4. Drop that file into the matching path above. Final layout should be:

   ```
   client/public/assets/kenney/
   ├── tiny-town/
   │   └── tilemap_packed.png
   └── tiny-dungeon/
       └── tilemap_packed.png
   ```

5. Refresh the browser. Phaser preload will pick them up — you'll see
   sprites replace the emoji and the warning will stop.

## Tweaking sprite mappings

The mapping from in-game concept (tile glyph, race id, monster id, NPC id)
to atlas frame lives in [`client/src/game/assets.ts`](../../../src/game/assets.ts).

Each Kenney atlas is a fixed grid of **16×16** tiles, **12 columns** wide.
Frame index = `row * 12 + col` (0-based from top-left).

To swap a sprite:
1. Open `tilemap_packed.png` in an image viewer that shows pixel
   coordinates (Photoshop, GIMP, Aseprite, Krita).
2. Hover the tile you want → divide coords by `(16+1)` to skip the 1px
   spacing — that gives you `(col, row)`.
3. Frame number = `row * 12 + col`.
4. Edit the number in `assets.ts`. Vite hot-reloads.

The defaults shipped in `assets.ts` are best-guesses based on typical
Kenney layouts — adjust if a sprite looks wrong.

## What about animation?

This integration is **static frames only** — every sprite is one snapshot.
Walk/idle animation is a future slice (Phaser supports it natively via
`anims.create` + frame sequences from the same atlas).
