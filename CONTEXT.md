# อสูรเว็บ Online

A web MMORPG (React + Phaser) inspired by classic 2000s-era Thai web games. This glossary pins the language used across the product so UI, store, and (Phase 2+) server code stay consistent.

## Language

**Portal**:
The public-facing front page of the game — a single content-rich page (hero, news, leaderboards, online players, events, web board) that a visitor lands on and from which they enter character creation. It is the first screen of the app.
_Avoid_: Title screen, splash, landing page, home — all refer to this same Portal.

**Character Creation**:
The flow where a visitor picks race and class to create a playable character. The Portal's primary call-to-action ("เริ่มเล่นเกม") leads here.
_Avoid_: Create screen, signup.

**Screen**:
A top-level app view selected by the store's routing state — currently `title` (→ becomes the Portal), `create`, `game`, `battle`. One screen is visible at a time.

**Pre-game**:
Everything a visitor sees before they are controlling a character in the world: the Portal and Character Creation. The point of crossing into in-game is entering the playable world.

**In-game**:
Everything reachable while controlling a character: the GameScreen HUD, BattleScreen, every modal opened from the HUD (inventory, craft, enhance, class-change, shop, help), and the chat panel. The pre-game / in-game line is also the visual-style boundary of the product.

## Content language

**Content**:
The runtime-editable game data — Items, Monsters, Maps (with Layouts), MonsterDrops, MapMonster spawns, Warps, NPCs (with ShopItems), and Recipes. Lives in the database, seeded once from `shared/src/data.ts`. After the seed runs, the database is authoritative; `data.ts` is the initial fixture, not a runtime source.
_Avoid_: "game data" (ambiguous), "static data" (no longer static).

**Race / Class**:
Character archetype definitions. **Not** Content — they stay in `shared/src/data.ts` because they are tightly coupled to balance logic (`deriveStats`, skill resolution) and adding a new race or class requires code regardless.

**Tile**:
A single cell in a Map's Layout grid. Has a glyph (visual character the scene draws), a walkable flag, and an optional kind.
_Avoid_: "square", "block". The visual palette `MapDef.tiles` in the old code was **not** a Tile — that was a render-time random palette.

**Layout**:
The 2D grid of Tiles for a Map, stored as JSON of shape `{glyph, walkable, kind?}[][]`. Replaces the old `MapDef.tiles` palette plus procedural rendering.

**Tile Kind**:
Semantic role attached to a Tile beyond visual rendering. Values: `spawn` (a normal/elite Monster spawn candidate), `boss-spawn` (a boss-rank Monster spawn point), `shop` / `healer` / `quest` (paired with an NPC at the same coordinate). Warps are **not** a Tile Kind — they live in their own table.

**Warp**:
A coordinate on a source Map that, when stepped on, teleports the Character to a target Map at fixed `(tx, ty)`. Stored as its own table with FK to both source and target Map.

**Spawn**:
The mechanism by which Monsters are placed on a Map. Driven by `tile.kind='spawn'` candidate cells plus the `MapMonster.spawnWeight` for that pair. Boss-rank Monsters spawn only at `tile.kind='boss-spawn'`.
_Avoid_: "spawn point" alone (ambiguous — be explicit whether you mean a Tile or a MapMonster row).

**Drop**:
An Item gained from defeating a Monster, resolved against the Monster's MonsterDrop entries (each: itemId, chance 0–1, minQty, maxQty). A single battle can yield multiple Drops.
_Avoid_: "loot" — used inconsistently in the old code as both "drop" and "inventory after battle".

**Monster Rank**:
Tier of a Monster: `normal` (standard spawn pool), `elite` (rarer spawn, higher stats, better Drops — same spawn mechanism as normal), `boss` (fixed spawn at `tile.kind='boss-spawn'`, unique reward).

**Item Rarity**:
Visual tier of an Item: `common` / `rare` / `epic` / `legendary`. Used only for UI presentation (border colour, label). Does **not** gate drops or pricing — those are explicit per MonsterDrop and per ShopItem.

**NPC**:
Non-player character placed at a coordinate on a Map. Has a kind: `shop` (sells ShopItems), `healer` (restores HP/MP for gold), `quest` (placeholder; not yet implemented).

## Input language

**Click-to-Walk**:
The mouse / touch input model for moving the Character. Clicking any cell on the Map enqueues a Path to that cell; the Character then walks the Path step-by-step. Coexists with keyboard input — pressing an arrow / WASD key cancels the Path and resumes single-step keyboard control.
_Avoid_: "mouse walk", "click-to-move" (we standardise on Click-to-Walk).

**Path**:
The sequence of Tile coordinates returned by the A* pathfinder, from the Character's current cell to a clicked destination. Walls are obstacles; Monsters, Warps, and NPCs are walkable in pathfinding — their side-effects fire naturally via `tryMove` when the Character actually steps onto them, which **cancels the rest of the Path**.
_Avoid_: "route", "trail".

## Example dialogue

> **Dev:** When the player clicks "เริ่มเล่นเกม" on the Portal, where do they go?
> **Designer:** Into Character Creation. The Portal is just the front door — news, ranking, who's online. The moment they want to play, they leave the Portal and never see it again that session.
> **Dev:** So the Portal isn't the in-game HUD?
> **Designer:** Right. The Portal is the website around the game. The HUD is inside the game.
>
> **Dev:** A GM wants to add a new monster "ลูกจิ้งจอกไฟ". Do we edit `data.ts`?
> **Designer:** No — that's Content now. Edit the Monster table (Prisma Studio or admin UI), add MonsterDrop rows, then put a MapMonster row for whichever Map it spawns on. `data.ts` is only the initial seed.
> **Dev:** What if the new monster is a boss?
> **Designer:** Set `rank='boss'`, and the Map's Layout needs at least one Tile with `kind='boss-spawn'` for it to appear.
