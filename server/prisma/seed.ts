// Seed Content tables from shared/src/data.ts.
// Idempotent: upserts by primary key, so re-running is safe in dev.
// See ADR 0002 for the architecture rationale.
import 'dotenv/config'
import {
  PrismaClient,
  type ItemType,
  type Rarity,
  type MonsterRank,
  type NpcKind,
  type Prisma,
} from '@prisma/client'
import {
  ITEMS, MAPS, NPCS, RECIPES, makeLayout,
  type MonsterDef, type MonsterDropDef, type TileDef, type TileKind,
} from '@asura/shared'

const prisma = new PrismaClient()

async function seedItems(): Promise<number> {
  const entries = Object.entries(ITEMS)
  for (const [id, def] of entries) {
    await prisma.item.upsert({
      where: { id },
      create: {
        id,
        name: def.name,
        emoji: def.emoji,
        type: def.type as ItemType,
        rarity: (def.rarity ?? 'common') as Rarity,
        atk: def.atk ?? null,
        def: def.def ?? null,
        matk: def.matk ?? null,
        heal: def.heal ?? null,
        healMp: def.healMp ?? null,
        desc: def.desc,
      },
      update: {
        // Update only mutable display fields; do not touch the id.
        name: def.name,
        emoji: def.emoji,
        type: def.type as ItemType,
        rarity: (def.rarity ?? 'common') as Rarity,
        atk: def.atk ?? null,
        def: def.def ?? null,
        matk: def.matk ?? null,
        heal: def.heal ?? null,
        healMp: def.healMp ?? null,
        desc: def.desc,
      },
    })
  }
  return entries.length
}

/** Collect every MonsterDef across all maps and dedupe by id.
 *  Today each id appears in exactly one map (slice 9 invariant); the dedupe
 *  protects future content drift before MapMonster (slice 10) takes over. */
function collectMonsters(): MonsterDef[] {
  const byId = new Map<string, MonsterDef>()
  for (const map of Object.values(MAPS)) {
    for (const m of map.monsters) {
      if (!byId.has(m.id)) byId.set(m.id, m)
    }
  }
  return [...byId.values()]
}

/** Pick the multi-drop list (preferred) or upgrade the legacy single drop. */
function resolveDrops(m: MonsterDef): MonsterDropDef[] {
  if (m.drops && m.drops.length > 0) return m.drops
  if (m.drop) return [{ item: m.drop.item, chance: m.drop.chance }]
  return []
}

async function seedMonsters(): Promise<{ monsters: number; drops: number }> {
  const monsters = collectMonsters()
  let dropRows = 0
  for (const m of monsters) {
    await prisma.monster.upsert({
      where: { id: m.id },
      create: {
        id: m.id,
        name: m.name,
        emoji: m.emoji,
        rank: (m.rank ?? 'normal') as MonsterRank,
        lv: m.lv, hp: m.hp, atk: m.atk, def: m.def, spd: m.spd,
        exp: m.exp, gold: m.gold,
      },
      update: {
        name: m.name,
        emoji: m.emoji,
        rank: (m.rank ?? 'normal') as MonsterRank,
        lv: m.lv, hp: m.hp, atk: m.atk, def: m.def, spd: m.spd,
        exp: m.exp, gold: m.gold,
      },
    })

    // Replace-by-monster: simplest way to keep drops in sync with data.ts.
    // Cheap (a handful of rows per monster) and avoids per-entry diffing.
    await prisma.monsterDrop.deleteMany({ where: { monsterId: m.id } })
    const drops = resolveDrops(m)
    if (drops.length > 0) {
      await prisma.monsterDrop.createMany({
        data: drops.map((d) => ({
          monsterId: m.id,
          itemId: d.item,
          chance: d.chance,
          minQty: d.minQty ?? 1,
          maxQty: d.maxQty ?? 1,
        })),
      })
      dropRows += drops.length
    }
  }
  return { monsters: monsters.length, drops: dropRows }
}

/** Stamp NPC tile kinds onto a Map layout in place. Each NPC's (x,y) on its
 *  Map gets `kind` set to the NPC's `kind` so client tryMove can react. */
function overlayNpcKinds(mapId: string, layout: TileDef[][]): void {
  for (const npc of Object.values(NPCS)) {
    if (npc.mapId !== mapId) continue
    const row = layout[npc.y]
    if (!row) continue
    const cell = row[npc.x]
    if (!cell) continue
    cell.kind = npc.kind as TileKind
  }
}

async function seedMaps(): Promise<{ maps: number; mapMonsters: number; warps: number }> {
  const maps = Object.values(MAPS)
  let mapMonsterRows = 0
  let warpRows = 0
  // Two passes: insert/update all Maps first so cross-map Warp FKs
  // (Warp.toMapId → Map.id) can resolve regardless of seed order.
  for (const m of maps) {
    const layout = makeLayout(m)
    overlayNpcKinds(m.id, layout)
    await prisma.map.upsert({
      where: { id: m.id },
      create: {
        id: m.id,
        name: m.name,
        minLv: m.minLv,
        maxLv: m.maxLv,
        w: m.w,
        h: m.h,
        bg: m.bg,
        pathColor: m.pathColor ?? null,
        monsterCount: m.monsterCount ?? 0,
        layout: layout as unknown as Prisma.InputJsonValue,
      },
      update: {
        name: m.name,
        minLv: m.minLv,
        maxLv: m.maxLv,
        w: m.w,
        h: m.h,
        bg: m.bg,
        pathColor: m.pathColor ?? null,
        monsterCount: m.monsterCount ?? 0,
        layout: layout as unknown as Prisma.InputJsonValue,
      },
    })
  }
  // Now relations — MapMonster + Warp — replace-by-source for both.
  for (const m of maps) {
    await prisma.mapMonster.deleteMany({ where: { mapId: m.id } })
    if (m.monsters.length > 0) {
      await prisma.mapMonster.createMany({
        data: m.monsters.map((mon) => ({
          mapId: m.id,
          monsterId: mon.id,
          spawnWeight: 1,
        })),
      })
      mapMonsterRows += m.monsters.length
    }

    await prisma.warp.deleteMany({ where: { mapId: m.id } })
    if (m.warps.length > 0) {
      await prisma.warp.createMany({
        data: m.warps.map((w) => ({
          mapId: m.id,
          x: w.x,
          y: w.y,
          toMapId: w.to,
          tx: w.tx,
          ty: w.ty,
          label: w.label ?? null,
        })),
      })
      warpRows += m.warps.length
    }
  }
  return { maps: maps.length, mapMonsters: mapMonsterRows, warps: warpRows }
}

async function seedNpcs(): Promise<{ npcs: number; shopItems: number }> {
  const all = Object.values(NPCS)
  let shopItemRows = 0
  for (const npc of all) {
    await prisma.npc.upsert({
      where: { id: npc.id },
      create: {
        id: npc.id,
        name: npc.name,
        emoji: npc.emoji ?? null,
        mapId: npc.mapId,
        x: npc.x,
        y: npc.y,
        kind: npc.kind as NpcKind,
      },
      update: {
        name: npc.name,
        emoji: npc.emoji ?? null,
        mapId: npc.mapId,
        x: npc.x,
        y: npc.y,
        kind: npc.kind as NpcKind,
      },
    })
    // Replace ShopItems for this NPC so price edits stay in sync with data.ts.
    await prisma.shopItem.deleteMany({ where: { npcId: npc.id } })
    if (npc.shop && npc.shop.length > 0) {
      await prisma.shopItem.createMany({
        data: npc.shop.map((s) => ({
          npcId: npc.id,
          itemId: s.item,
          price: s.price,
        })),
      })
      shopItemRows += npc.shop.length
    }
  }
  return { npcs: all.length, shopItems: shopItemRows }
}

async function seedRecipes(): Promise<{ recipes: number; mats: number }> {
  let matRows = 0
  for (const r of RECIPES) {
    await prisma.recipe.upsert({
      where: { id: r.result },
      create: {
        id: r.result,
        gold: r.gold,
        classReq: (r.classReq ?? null) as Prisma.InputJsonValue | null,
      },
      update: {
        gold: r.gold,
        classReq: (r.classReq ?? null) as Prisma.InputJsonValue | null,
      },
    })
    // Replace mats so qty edits in data.ts stay in sync.
    await prisma.recipeMat.deleteMany({ where: { recipeId: r.result } })
    const matEntries = Object.entries(r.mats)
    if (matEntries.length > 0) {
      await prisma.recipeMat.createMany({
        data: matEntries.map(([itemId, qty]) => ({
          recipeId: r.result,
          itemId,
          qty,
        })),
      })
      matRows += matEntries.length
    }
  }
  return { recipes: RECIPES.length, mats: matRows }
}

async function main(): Promise<void> {
  console.log('seeding content from shared/src/data.ts …')
  const itemCount = await seedItems()
  console.log(`  ✓ items:    ${itemCount}`)
  const { monsters, drops } = await seedMonsters()
  console.log(`  ✓ monsters: ${monsters} (${drops} drop rows)`)
  const { maps, mapMonsters, warps } = await seedMaps()
  console.log(`  ✓ maps:     ${maps} (${mapMonsters} MapMonster rows, ${warps} warp rows)`)
  const { npcs, shopItems } = await seedNpcs()
  console.log(`  ✓ npcs:     ${npcs} (${shopItems} ShopItem rows)`)
  const { recipes, mats } = await seedRecipes()
  console.log(`  ✓ recipes:  ${recipes} (${mats} RecipeMat rows)`)
  console.log('done.')
}

main()
  .catch((err) => {
    console.error('seed failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
