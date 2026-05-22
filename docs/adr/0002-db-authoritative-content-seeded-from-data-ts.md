# DB-authoritative content, seeded from `shared/src/data.ts`

Item, Monster, Map (with Layout JSON), MonsterDrop, MapMonster, Warp, Npc, ShopItem, Recipe, and RecipeMat all live in Postgres. On first boot against an empty DB, `npm run seed` reads `shared/src/data.ts` and upserts those rows. After that the database is the runtime source of truth; GMs edit Content via Prisma Studio (or a future admin UI), and the server reloads its in-memory cache on demand. `shared/src/data.ts` shrinks to the initial fixture plus RACES and CLASSES — the latter explicitly stay as code because they are tightly coupled to `shared/src/logic/` (skill resolution, `deriveStats`) and adding a new race or class always requires writing new logic anyway.

Clients fetch Content once per session via `GET /api/content`, cache it in the Zustand store under `state.content`, and read it synchronously thereafter. Pure rules in `shared/src/logic/` already take their inputs as parameters, so no logic moves; the cutover is purely a data-source swap.

## Considered Options

- **Keep Content in `shared/src/data.ts` forever.** Rejected — the pain points are real: non-dev (GM / designer) can't edit without a redeploy; `Character.mapId` / `equipWeapon` / `InventoryItem.itemKey` have no FK and silently corrupt on typos; and a single file scales poorly past ~100 monsters.
- **DB Content with hot-read on every battle / movement.** Rejected — every combat step would round-trip to Postgres for monster stats, drop tables, and tile data. Content is read-mostly and overwhelmingly cache-friendly; an in-memory cache on the server plus a per-session bundle on the client is just as authoritative and far cheaper.
- **DB source with a "publish to static JSON" workflow.** Rejected — adds a publish step GMs have to remember and a stale-snapshot failure mode. A cache-reload admin endpoint achieves the same freshness on demand with one button.
- **Race and Class also into DB.** Rejected — the balance code in `shared/src/logic/` reads `RACES` and `CLASSES` synchronously, and adding a new race or class always requires writing new skill logic. The GM-edit benefit doesn't apply, and the refactor cost to thread these through every pure function is steep.

## Consequences

- `shared/src/data.ts` becomes a seed fixture for Items, Monsters, Maps, MonsterDrops, MapMonster pairs, Warps, Npcs, ShopItems, Recipes, and RecipeMats. Editing it does **not** change a running production server; a re-seed is required. A future reader who finds a discrepancy between the file and live Content should trust the database, not the file.
- All client UI that imports `ITEMS` / `MAPS` / `RECIPES` must be refactored to read from the Zustand content cache. The change is mechanical (`ITEMS[k]` → `useGame(s => s.content.items[k])`) but touches most modals and the Phaser map scene.
- Pure logic tests in `shared/src/logic/` are unaffected — they already take their inputs as parameters. Server integration tests need a freshly seeded DB per run (or a schema reset hook in test setup).
- `Character.mapId`, `Character.equipWeapon`, `Character.equipArmor`, and `InventoryItem.itemKey` remain plain strings in this ADR — they are **not** converted to FKs. Validation happens at API boundaries via Zod (the schema knows what IDs exist in cache). Lifting these to FKs is a future migration we accept the cost of when we feel the pain.
- Hot Content reload requires a deployable admin endpoint (`POST /api/admin/content/reload`). Without it, GM edits to the DB are invisible to the cache until a server restart — that is the failure mode to design around when the admin path lands.
- The Portal redesign (DB-backed leaderboard, profile, etc.) is unaffected by this ADR — it touches the existing Character / User / BattleLog tables, not Content.
