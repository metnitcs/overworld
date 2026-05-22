/** Slice 25: race + class redesigned around primary stats.
 *  - Race contributes flat *modifiers* applied to the 6 primary stats once
 *    at character creation (and re-applied as a *diff* on transcend).
 *  - Class contributes *growth* weights — purely a recommendation to the
 *    player ("a Berserk should pump STR + VIT"), never auto-applied.
 *  - class.skill is kept here temporarily until the dedicated Skill table
 *    slice lands; future slice will move it out entirely. */
export interface StatModifier {
  str?: number
  int?: number
  dex?: number
  agi?: number
  luk?: number
  vit?: number
}

export interface Race {
  id: string
  name: string
  emoji: string
  desc: string
  /** Flat additions to each primary stat at character creation. Negative
   *  values are allowed; the resulting stat is clamped to STAT_BASE on
   *  transcend so a player never sinks below the floor. Missing keys = 0. */
  modifiers: StatModifier
  /** True when the race is offered at character-creation or in the Lv10
   *  transcend modal. False for deprecated races kept only so old saves
   *  still render (e.g. characters created before the Slice-17 reform). */
  available?: boolean
  /** True when this race is the system "starter" — every new character is
   *  created at this race before their Lv 10 transcend choice. Exactly one
   *  Race should carry this flag. */
  starter?: boolean
}

export type SkillType = 'phys' | 'magic' | 'heal' | 'holy'

export interface Skill {
  name: string
  mp: number
  mult: number
  type: SkillType
}

export interface CharClass {
  id: string
  name: string
  emoji: string
  desc: string
  /** Recommended stat-allocation weights. UI uses these for "suggested
   *  build" hints / an auto-allocate button — NEVER applied automatically
   *  by the server. Total weight has no fixed sum; treat as relative. */
  growth: StatModifier
  /** Transitional — the temporary innate skill until the Skill table slice
   *  lands. Will be removed once skills are unlockable via shop / quest /
   *  cash item per the design proposal. */
  skill: Skill
  /** Slice 26: true for the auto-assigned beginner class every character
   *  starts as. Exactly ONE class should carry this flag (currently
   *  'adventurer'). */
  starter?: boolean
  /** Slice 26: false = legacy class, kept so old saves still render but
   *  never offered in the ClassChoiceModal. Default treated as true. */
  available?: boolean
  /** Slice 27: gates which advanced classes a player can pick at the
   *  Lv-120 class-change quest. Set to the `raceId` of the tier-2 race
   *  this class belongs to (human/mara/god). The starter `adventurer`
   *  has no requirement. */
  requiredRaceId?: string
}

export type MonsterRank = 'normal' | 'elite' | 'boss'

/** A single Drop entry: a chance roll for one item with a quantity range. */
export interface MonsterDropDef {
  item: string
  chance: number
  /** Defaults to 1 when unspecified. */
  minQty?: number
  /** Defaults to 1 when unspecified. */
  maxQty?: number
}

export interface MonsterDef {
  /** Globally unique id (e.g. 'wolf-shadow'). Required for Content seed; the
   *  legacy in-MAPS shape didn't carry one — every active monster now does. */
  id: string
  name: string
  emoji: string
  /** Tier — see CONTEXT.md "Monster Rank". Defaults to 'normal' on load. */
  rank?: MonsterRank
  lv: number
  hp: number
  atk: number
  def: number
  spd: number
  exp: number
  gold: number
  /** Legacy single-Drop shape. Kept for backward compatibility with battle
   *  logic in `shared/src/logic/`; the seed converts this into a MonsterDrop
   *  row when `drops` is not provided. */
  drop?: { item: string; chance: number }
  /** Preferred multi-Drop shape. When present, supersedes `drop`. */
  drops?: MonsterDropDef[]
}

export interface WarpDef {
  x: number
  y: number
  /** target map id */
  to: string
  /** spawn position on target map */
  tx: number
  ty: number
  label?: string
}

/** Semantic role attached to a Tile beyond visual rendering. See CONTEXT.md
 *  "Tile Kind". Warps are deliberately NOT a kind — they live in their own
 *  table (slice 12). */
export type TileKind = 'spawn' | 'boss-spawn' | 'shop' | 'healer' | 'quest'

export type NpcKind = 'shop' | 'healer' | 'quest'

/** A single item a shop NPC sells, at a fixed gold price. */
export interface ShopEntry {
  /** Item id (FK to Items table). */
  item: string
  price: number
}

export interface NpcDef {
  id: string
  name: string
  /** Optional emoji sprite drawn on the Map at (mapId, x, y). */
  emoji?: string
  mapId: string
  x: number
  y: number
  kind: NpcKind
  /** For kind='shop' only. Healers and quest givers carry an empty stock. */
  shop?: ShopEntry[]
}

/** Single cell in a Map's Layout grid. `glyph` undefined = bare cell (the
 *  background colour shows through). */
export interface TileDef {
  glyph?: string
  walkable: boolean
  kind?: TileKind
}

/** Transient seed-input: stamp a non-walkable cell into the generated Layout. */
export interface WallSpec {
  x: number
  y: number
  /** Optional override glyph for the wall (e.g. '🌳' for forest trees). */
  glyph?: string
}

export interface MapDef {
  id: string
  name: string
  minLv: number
  maxLv: number
  /** Legacy decorative palette — kept transiently for the seed's layout
   *  generator. Once content moves to DB, the layout JSON is authoritative
   *  and this field is unused at runtime. */
  tiles: string[]
  bg: string
  /** color used for path/dirt accents */
  pathColor?: string
  monsters: MonsterDef[]
  warps: WarpDef[]
  /** width and height in tiles */
  w: number
  h: number
  /** number of monsters to spawn */
  monsterCount?: number
  /** Seed-only: cells to stamp as walls (walkable=false). Consumed by
   *  `makeLayout()`; not read at runtime — runtime reads the layout JSON. */
  walls?: WallSpec[]
  /** 2D grid of TileDef — `layout[y][x]`. Generated at seed time from `tiles`. */
  layout?: TileDef[][]
}

export type ItemType = 'mat' | 'consume' | 'weapon' | 'armor'

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface ItemDef {
  name: string
  emoji: string
  type: ItemType
  /** Visual tier for UI presentation (border colour, label). Does not gate
   *  drops or pricing — those are per-MonsterDrop and per-ShopItem. */
  rarity?: Rarity
  atk?: number
  def?: number
  matk?: number
  heal?: number
  healMp?: number
  desc: string
}

export interface Recipe {
  result: string
  mats: Record<string, number>
  gold: number
  classReq?: string[]
}

/** Slice 23: the 6 primary stats. Players spend `unspentPoints` on these.
 *  Race & Class contribute base modifiers only (added in deriveStats). */
export type PrimaryStat = 'str' | 'int' | 'dex' | 'agi' | 'luk' | 'vit'

/** Derived combat stats — computed by deriveStats(), never persisted directly
 *  (atk/def/spd are kept on Character as cached values for legacy callers). */
export interface DerivedStats {
  maxHp: number
  maxMp: number
  pAtk: number
  mAtk: number
  pDef: number
  mDef: number
  acc: number
  dodge: number
  crit: number
  spd: number
}

export interface GameState {
  name: string
  raceId: string
  classId: string
  lv: number
  exp: number
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  /** Cached derived combat stats — recomputed by deriveStats() from the
   *  primary stats (str/int/dex/agi/luk/vit) + race + class + equipment. */
  atk: number
  def: number
  spd: number
  /** Slice 23 — 6 primary stats. Default 10, allocated via spendPoints(). */
  str: number
  int: number
  dex: number
  agi: number
  luk: number
  vit: number
  /** Unspent stat points pool. Granted +5 per level up; player allocates
   *  via the Status modal. */
  unspentPoints: number
  gold: number
  inventory: Record<string, number>
  equipWeapon: string | null
  equipArmor: string | null
  /** key = `${itemKey}_w` (weapon) or `${itemKey}_a` (armor) */
  plus: Record<string, number>
  map: string
  px: number
  py: number
  steps: number
  /** True once the player has completed the Lv 10 race-change quest. Used
   *  to gate the modal so it only fires once. New characters start false. */
  transcended: boolean
  /** Slice 26: true once the player has completed the Lv 5 class-change
   *  quest. Mirrors `transcended` lifecycle — new chars start as
   *  STARTER_CLASS with this flag false; the modal pops once at threshold. */
  classChanged: boolean
}

export interface BattleEnemy {
  /** Slice 44: source MonsterDef.id, so the client can call
   *  POST /api/character/:id/battle/resolve with the monster identity
   *  when this enemy is defeated. Optional for back-compat with
   *  hand-rolled BattleEnemy fixtures in unit tests. */
  id?: string
  name: string
  emoji: string
  lv: number
  maxHp: number
  hp: number
  /** Cached combat values. For monsters these come straight from MonsterDef
   *  (no primary stats), so derived calls treat them as the base values. */
  atk: number
  def: number
  spd: number
  /** Slice 23: monsters get implicit derived values too — used in resolveAttack
   *  so the hit/dodge/crit roll is symmetric for both sides. Default formulas
   *  in scaleEnemy fill these from atk/def/spd. */
  acc?: number
  dodge?: number
  crit?: number
  mAtk?: number
  mDef?: number
  exp: number
  gold: number
  drop?: { item: string; chance: number }
}

export type Screen =
  | 'auth'
  | 'title'
  | 'character-select'   // Slice 16: pick which of your N characters to play
  | 'create'
  | 'game'
  | 'battle'
  | 'admin'              // Slice 20: in-game admin panel (role === 'ADMIN' only)

export type ModalType =
  | 'none'
  | 'inventory'
  | 'craft'
  | 'enhance'
  | 'class-change'
  | 'shop'
  | 'help'
  | 'race-change'        // Slice 17: Lv 10 transcend choice
  | 'status'             // Slice 23: primary-stat allocation modal
  | 'class-choice'       // Slice 26: Lv 5 class-change quest

export type ChatKind = 'normal' | 'system' | 'good' | 'bad'

export interface ChatMessage {
  id: number
  avatar: string
  speaker: string
  text: string
  time: string
  kind?: ChatKind
}
