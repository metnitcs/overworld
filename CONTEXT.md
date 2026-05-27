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
Non-player character placed at a coordinate on a Map. Has a kind: `shop` (sells ShopItems), `healer` (restores HP/MP for gold), `blacksmith` (gates Enhance — see Blacksmith), `quest` (placeholder; not yet implemented).

**Inventory**:
The Character's bag of Items they currently hold but are not wearing. Stored as `InventoryItem` rows. Stack policy depends on ItemType: `weapon` / `armor` are **per-instance** (one row = one physical item, `qty` always 1, carries its own Plus level); `mat` / `consume` are **stackable** (one row per (characterId, itemKey) pair with `qty`). Items that are equipped are **not** shown in the Inventory list — see Equipment Slot.
_Avoid_: "bag" alone (ambiguous with UI elements), "items" alone.

**Inventory Item**:
A single row in `InventoryItem`, the canonical entity for "a thing the Character owns." Has its own `id`. For weapon/armor this id is the per-instance identity that survives equip/unequip and carries the item's Plus level. For mat/consume, the id is incidental — those rows are addressed by (characterId, itemKey).
_Avoid_: "item slot" (overloaded with Equipment Slot), "stack" (only meaningful for mat/consume).

**Equipment Slot**:
A named slot on the Character that holds at most one equipped Inventory Item. **Slice 52a: nine slots** — `equipWeapon`, `equipArmor`, `equipShield`, `equipHelmet`, `equipBoots`, `equipCloak`, `equipNecklace`, `equipRing1`, `equipRing2`. Each is a foreign key from `Character` to `InventoryItem.id`. **Transfer model is logical, not physical**: the equipped Inventory Item stays in the `InventoryItem` table; the Inventory list filters out any row whose id appears in any Equipment Slot, so the player never sees the same item in two places. Unequipping = clearing the FK; the item's `id` and Plus level are unchanged.

The 9 slots split by behavior:

- **Enhanceable** (Plus step scales the slot-typed stat): weapon → ATK, armor / shield / helmet → DEF
- **Bonus-only** (Plus does nothing — Blacksmith refuses): boots, cloak, necklace, ring×2 — these deliver effects purely through Slice 51 per-item primary stat bonuses (`bonusStr/Int/Dex/Agi/Luk/Vit`)

Ring has two slots (`ring1`, `ring2`) that both accept ItemType=`ring`. The equip endpoint auto-fills the empty ring slot first; if both are full it displaces ring1.
_Avoid_: "equip pointer" — that was the rejected Slice 36 model where an item shown as equipped was also still listed in the bag.
_History_: Slice 33 introduced Transfer. Slice 36 reverted to a Pointer model (Demon-Online style). Slice 46 returned to Transfer (physical move). Slice 47 made the slot reference an Inventory Item id (per-instance identity). Slice 52a expanded from 2 → 9 slots.

**Plus**:
A non-negative integer (0..10) attached to a single weapon or armor Inventory Item, representing how many successful Enhance attempts it has accumulated. Plus contributes a **step-scaled** bonus to the slot's primary combat stat: `enhancePlusAtkBonus(plus)` for weapon ATK (`+1..+5` = +2 each, `+6..+10` = +5 each, max +35 at +10) and `enhancePlusDefBonus(plus)` for armor DEF (`+1..+5` = +1 each, `+6..+10` = +3 each, max +20 at +10). Mat and consume items never carry a Plus. Two Inventory Items of the same itemKey can have different Plus values — that is the whole reason gear is per-instance. Per-item primary stat bonuses (see Item Stat) are NOT affected by Plus.
_Avoid_: "+level" (no leading symbol in prose), "refine level" (RO term we don't use), "upgrade" (overloaded with class/race progression).

**Enhance**:
The act of attempting to raise an Inventory Item's Plus by 1. Resolved by `resolveEnhance` (pure, server-runs-the-RNG). Costs plus-stones (`1 + floor(cur/2)`) and a gold fee (scales with current Plus). On success: `+1`. On failure at `cur >= 5`: `-1`. Stones and gold are consumed on both success and failure, never when the player can't afford. Always gated by a Blacksmith NPC — the Enhance modal is opened by interacting with one and lists only **unequipped** weapon/armor.
_Avoid_: "upgrade", "refine", "+ตี" without context.

**Blacksmith**:
A new NpcKind that gates Enhance. The Blacksmith refuses to work on equipped items — the Character must unequip first. Listed alongside `shop`, `healer`, and `quest` as the fourth NpcKind. Placed on a Map like any other NPC.
_Avoid_: "smith", "enhancer", "refiner".

**Item Stat**:
A field on an ItemDef that contributes to a Character's combat stats when the Item is equipped. Two flavors:

- **Slot-typed stats** (Slice 23 → 52a): contribution rule depends on the item type, not the field:
  - `weapon` → `atk` + `matk`
  - `armor` / `shield` / `helmet` → `def`
  - `boots` / `cloak` / `necklace` / `ring` → no slot-typed contribution
- **Primary stat bonuses** (Slice 51): all 8 equippable types may carry `bonusStr / bonusInt / bonusDex / bonusAgi / bonusLuk / bonusVit`. These fold into the Character's effective primary stats BEFORE the derived formulas run, so a sword with `bonusVit: 5` raises maxHp, pDef, and every other VIT-derived stat — not just one combat number. Flat — NOT scaled by Plus.

**Plus** scales only `atk` (Weapon) and `def` (Armor / Shield / Helmet) — via the `enhancePlusAtkBonus` / `enhancePlusDefBonus` step curves. The four non-enhanceable types (boots / cloak / necklace / ring) deliver everything through bonus primary stats — Blacksmith refuses to enhance them.

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
