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
  Race as PrismaRace,
  CharClass as PrismaCharClass,
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
  Race,
  CharClass,
  StatModifier,
  Skill,
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
  /** Slice 28: races + classes moved to DB so admin can edit them. */
  races: Race[]
  classes: CharClass[]
}

function toRace(row: PrismaRace): Race {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    desc: row.desc,
    modifiers: (row.modifiers as unknown as StatModifier) ?? {},
    available: row.available,
    starter: row.starter || undefined,
  }
}

function toCharClass(row: PrismaCharClass): CharClass {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    desc: row.desc,
    growth: (row.growth as unknown as StatModifier) ?? {},
    skill: row.skill as unknown as Skill,
    starter: row.starter || undefined,
    available: row.available,
    requiredRaceId: row.requiredRaceId ?? undefined,
  }
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
    const [
      itemRows, monsterRows, mapRows, recipeRows, raceRows, classRows,
    ] = await Promise.all([
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
      this.prisma.race.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.charClass.findMany({ orderBy: { id: 'asc' } }),
    ])
    const items: Record<string, ItemDef> = {}
    for (const row of itemRows) items[row.id] = toItemDef(row)
    const monsters: Record<string, MonsterDef> = {}
    for (const row of monsterRows) monsters[row.id] = toMonsterDef(row)
    const maps: Record<string, MapBundle> = {}
    for (const row of mapRows) maps[row.id] = toMapBundle(row)
    const recipes: Recipe[] = recipeRows.map(toRecipe)
    const races: Race[] = raceRows.map(toRace)
    const classes: CharClass[] = classRows.map(toCharClass)
    this.bundle = { items, monsters, maps, recipes, races, classes }
    return this.bundle
  }

  // ─── Slice 28 helpers: race + class lookups against the loaded bundle ─
  // These mirror the static helpers from @asura/shared (STARTER_RACE,
  // AVAILABLE_RACES, classesForRace) but read from the live DB cache so
  // admin edits are picked up after invalidate().
  async getStarterRace(): Promise<Race> {
    const b = await this.get()
    const r = b.races.find((x) => x.starter)
    if (!r) throw new Error('no race marked starter in DB')
    return r
  }
  async getStarterClass(): Promise<CharClass> {
    const b = await this.get()
    const c = b.classes.find((x) => x.starter)
    if (!c) throw new Error('no class marked starter in DB')
    return c
  }
  async getAvailableRaces(): Promise<Race[]> {
    const b = await this.get()
    return b.races.filter((r) => r.available)
  }
  async getAvailableClasses(): Promise<CharClass[]> {
    const b = await this.get()
    return b.classes.filter((c) => !c.starter && c.available)
  }
  /** Slice 27: classes a player with the given race can pick at Lv 120. */
  async getClassesForRace(raceId: string): Promise<CharClass[]> {
    const available = await this.getAvailableClasses()
    return available.filter((c) => c.requiredRaceId === raceId)
  }
  async getRaceById(id: string): Promise<Race | undefined> {
    const b = await this.get()
    return b.races.find((r) => r.id === id)
  }

  /** Drop the cache; the next get() refreshes from DB. */
  invalidate(): void {
    this.bundle = null
  }
}
