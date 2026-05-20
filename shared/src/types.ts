export interface Race {
  id: string
  name: string
  emoji: string
  hp: number
  mp: number
  atk: number
  def: number
  spd: number
  desc: string
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
  atk: number
  def: number
  spd: number
  mp: number
  skill: Skill
}

export interface MonsterDef {
  name: string
  emoji: string
  lv: number
  hp: number
  atk: number
  def: number
  spd: number
  exp: number
  gold: number
  drop?: { item: string; chance: number }
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

export interface MapDef {
  id: string
  name: string
  minLv: number
  maxLv: number
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
}

export type ItemType = 'mat' | 'consume' | 'weapon' | 'armor'

export interface ItemDef {
  name: string
  emoji: string
  type: ItemType
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
  atk: number
  def: number
  spd: number
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
}

export interface BattleEnemy {
  name: string
  emoji: string
  lv: number
  maxHp: number
  hp: number
  atk: number
  def: number
  spd: number
  exp: number
  gold: number
  drop?: { item: string; chance: number }
}

export type Screen = 'auth' | 'title' | 'create' | 'game' | 'battle'

export type ModalType =
  | 'none'
  | 'inventory'
  | 'craft'
  | 'enhance'
  | 'class-change'
  | 'shop'
  | 'help'

export type ChatKind = 'normal' | 'system' | 'good' | 'bad'

export interface ChatMessage {
  id: number
  avatar: string
  speaker: string
  text: string
  time: string
  kind?: ChatKind
}
