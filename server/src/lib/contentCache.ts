// In-memory content cache (ADR 0002).
// Loaded lazily on first read; the admin endpoint (slice 15) will trigger
// `invalidate()` to force a refresh on the next read.
import type {
  PrismaClient,
  Item as PrismaItem,
  Monster as PrismaMonster,
  MonsterDrop as PrismaMonsterDrop,
  Map as PrismaMap,
  MapMonster as PrismaMapMonster,
  Warp as PrismaWarp,
  Npc as PrismaNpc,
  ShopItem as PrismaShopItem,
  Recipe as PrismaRecipe,
  RecipeMat as PrismaRecipeMat,
} from '@prisma/client'
import type {
  ItemDef,
  ItemType,
  Rarity,
  MonsterDef,
  MonsterDropDef,
  MonsterRank,
  TileDef,
  WarpDef,
  NpcKind,
  ShopEntry,
  Recipe,
} from '@asura/shared'

/** NPC entry on the wire. Embeds the shop stock so the client doesn't need
 *  a second round-trip when opening the shop modal. */
export interface NpcBundle {
  id: string
  name: string
  emoji: string | null
  x: number
  y: number
  kind: NpcKind
  shop: ShopEntry[]
}

/** Wire-shape for a map sent over /api/content. Embeds the spawn-list of
 *  monster ids, outgoing Warps, and NPCs inline so the client can do a
 *  single round-trip on boot. */
export interface MapBundle {
  id: string
  name: string
  minLv: number
  maxLv: number
  w: number
  h: number
  bg: string
  /** Slice 21: optional bg image path (e.g. '/assets/maps/forest.png'). */
  bgImage: string | null
  pathColor: string | null
  monsterCount: number
  layout: TileDef[][]
  /** Monster ids that may spawn on this Map (resolve via bundle.monsters). */
  monsters: string[]
  /** Outgoing Warps from this Map — each carries source (x,y) plus target
   *  map id and target (tx,ty). */
  warps: WarpDef[]
  /** NPCs placed on this Map (shop, healer, quest). */
  npcs: NpcBundle[]
}

export interface ContentBundle {
  items: Record<string, ItemDef>
  monsters: Record<string, MonsterDef>
  maps: Record<string, MapBundle>
  /** Crafting recipes — array preserves stable seed order. Mats use the
   *  legacy `Record<itemKey, qty>` shape so client code can drop in with
   *  zero changes. */
  recipes: Recipe[]
}

function toItemDef(row: PrismaItem): ItemDef {
  return {
    name: row.name,
    emoji: row.emoji,
    type: row.type as ItemType,
    rarity: row.rarity as Rarity,
    atk: row.atk ?? undefined,
    def: row.def ?? undefined,
    matk: row.matk ?? undefined,
    heal: row.heal ?? undefined,
    healMp: row.healMp ?? undefined,
    desc: row.desc,
  }
}

function toMonsterDef(
  row: PrismaMonster & { drops: PrismaMonsterDrop[] },
): MonsterDef {
  const drops: MonsterDropDef[] = row.drops.map((d) => ({
    item: d.itemId,
    chance: d.chance,
    minQty: d.minQty,
    maxQty: d.maxQty,
  }))
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    rank: row.rank as MonsterRank,
    lv: row.lv,
    hp: row.hp,
    atk: row.atk,
    def: row.def,
    spd: row.spd,
    exp: row.exp,
    gold: row.gold,
    drops,
  }
}

function toRecipe(row: PrismaRecipe & { mats: PrismaRecipeMat[] }): Recipe {
  const mats: Record<string, number> = {}
  for (const m of row.mats) mats[m.itemId] = m.qty
  // classReq is a Json column; null on the wire means "any class".
  const classReq = Array.isArray(row.classReq)
    ? (row.classReq as string[])
    : undefined
  return {
    result: row.id,
    gold: row.gold,
    classReq,
    mats,
  }
}

function toNpcBundle(row: PrismaNpc & { shopItems: PrismaShopItem[] }): NpcBundle {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    x: row.x,
    y: row.y,
    kind: row.kind as NpcKind,
    shop: row.shopItems.map((s) => ({ item: s.itemId, price: s.price })),
  }
}

function toMapBundle(
  row: PrismaMap & {
    monsters: PrismaMapMonster[]
    warpsFrom: PrismaWarp[]
    npcs: Array<PrismaNpc & { shopItems: PrismaShopItem[] }>
  },
): MapBundle {
  return {
    id: row.id,
    name: row.name,
    minLv: row.minLv,
    maxLv: row.maxLv,
    w: row.w,
    h: row.h,
    bg: row.bg,
    bgImage: row.bgImage,
    pathColor: row.pathColor,
    monsterCount: row.monsterCount,
    layout: row.layout as unknown as TileDef[][],
    monsters: row.monsters.map((mm) => mm.monsterId),
    warps: row.warpsFrom.map((w) => ({
      x: w.x,
      y: w.y,
      to: w.toMapId,
      tx: w.tx,
      ty: w.ty,
      label: w.label ?? undefined,
    })),
    npcs: row.npcs.map(toNpcBundle),
  }
}

export class ContentCache {
  private bundle: ContentBundle | null = null

  constructor(private readonly prisma: PrismaClient) {}

  async get(): Promise<ContentBundle> {
    if (this.bundle) return this.bundle
    const [itemRows, monsterRows, mapRows, recipeRows] = await Promise.all([
      this.prisma.item.findMany(),
      this.prisma.monster.findMany({ include: { drops: true } }),
      this.prisma.map.findMany({
        include: {
          monsters: true,
          warpsFrom: true,
          npcs: { include: { shopItems: true } },
        },
      }),
      this.prisma.recipe.findMany({ include: { mats: true } }),
    ])
    const items: Record<string, ItemDef> = {}
    for (const row of itemRows) items[row.id] = toItemDef(row)
    const monsters: Record<string, MonsterDef> = {}
    for (const row of monsterRows) monsters[row.id] = toMonsterDef(row)
    const maps: Record<string, MapBundle> = {}
    for (const row of mapRows) maps[row.id] = toMapBundle(row)
    const recipes: Recipe[] = recipeRows.map(toRecipe)
    this.bundle = { items, monsters, maps, recipes }
    return this.bundle
  }

  /** Drop the cache; the next get() refreshes from DB. */
  invalidate(): void {
    this.bundle = null
  }
}
