import type { Race, CharClass, MapDef, ItemDef, Recipe, TileDef, NpcDef } from './types.js'

// Slice 17 race reform: starter = มนุษย์ (human). At Lv 10, character can
// transcend into มาร or เทพ via the race-change quest (see RaceChangeModal).
// Slice 25 redesign: race contributes flat *modifiers* to primary stats,
// applied once at character creation. Race no longer holds hp/mp/atk/def/spd
// directly — all combat numbers now derive from primary stats + lv.
//
// Modifier budget guideline: net total ≈ 0 (boons offset by banes) so no race
// is strictly stronger than another. Sum of |values| ≈ 6–10 keeps differences
// noticeable without being game-defining at low lv.
export const RACES: Race[] = [
  { id: 'human', name: 'เผ่ามนุษย์', emoji: '🧑',
    desc: 'สมดุลทุกด้าน — เผ่าเริ่มต้นของผู้กล้า ไม่มี modifier ใดๆ',
    modifiers: {},
    available: true, starter: true },
  { id: 'mara',  name: 'เผ่ามาร',     emoji: '😈',
    desc: 'สายลุย/แทงค์ — STR + VIT สูง แลกกับ INT และ LUK',
    modifiers: { str: +3, vit: +2, int: -3, luk: -2 },
    available: true },
  { id: 'god',   name: 'เผ่าเทพ',     emoji: '👑',
    desc: 'สายเวท — INT และ LUK สูง แลกกับพละกำลังและความอึด',
    modifiers: { int: +4, luk: +2, str: -2, vit: -2, agi: -2 },
    available: true },
  // ─── deprecated (kept for backward compatibility with old saves) ────
  { id: 'angel', name: 'เผ่านางฟ้า',   emoji: '👼',
    desc: 'MP เยอะ ฟื้นฟูเก่ง',
    modifiers: { int: +3, luk: +2, vit: -2, str: -3 },
    available: false },
  { id: 'beast', name: 'เผ่าสัตว์อสูร', emoji: '🐺',
    desc: 'รวดเร็ว ป้องกันดี',
    modifiers: { agi: +4, vit: +1, int: -3, dex: -2 },
    available: false },
  { id: 'yaksa', name: 'เผ่ายักษ์',    emoji: '👺',
    desc: 'อึดสุด พลังถึก',
    modifiers: { vit: +5, str: +3, agi: -4, dex: -2, int: -2 },
    available: false },
  { id: 'phaya', name: 'เผ่าพญามาร',  emoji: '🦹',
    desc: 'สมดุลระดับสูง',
    modifiers: { str: +2, int: +2, agi: +1, vit: -2, luk: -3 },
    available: false },
]

/** Helper for UI: race-change modal + character-create flow show only these. */
export const AVAILABLE_RACES: Race[] = RACES.filter((r) => r.available)
/** The starter race assigned at character creation (Slice 17). */
export const STARTER_RACE = RACES.find((r) => r.starter)!

/** Lv at which the race-change quest unlocks. */
export const TRANSCEND_LV = 10
/** Max characters per account before the slot-expansion item ships. */
export const CHARACTER_SLOT_LIMIT = 3

// ─── Slice 23: Primary-stat tuning constants ─────────────────────────────
// All gameplay numbers live here as `export const` so admin tuning + future
// content slices have a single source of truth. Race/class redesign (next
// slice) will replace the legacy `Race.hp/atk/...` with stat MODIFIERS that
// add into the primary pool.
export const STAT_POINTS_PER_LEVEL = 5
/** Every new character starts with this in each primary stat (10×6 = 60). */
export const STAT_BASE = 10
/** Soft cap shown in UI; player can still allocate above this (end-game). */
export const STAT_SOFT_CAP = 99
/** Hard cap — server rejects allocations beyond this. */
export const STAT_HARD_CAP = 200
/** Flat HP floor, before VIT and Lv add in. */
export const BASE_HP = 50
/** Flat MP floor, before INT and Lv add in. */
export const BASE_MP = 20

// Slice 25 redesign: class.growth is a *recommendation* — UI uses it to
// suggest builds or power an "auto-allocate by class" button. The server
// never applies it automatically. Values are relative weights (typical
// range 1–4), no fixed sum. The temporary `skill` field stays until the
// dedicated Skill table slice.
//
// Slice 26: 'adventurer' is the new starter class. Every fresh character
// begins as Adventurer; at CLASS_CHANGE_LV the player picks one of the six
// advanced classes via the ClassChoiceModal.
export const CLASSES: CharClass[] = [
  { id: 'adventurer', name: 'นักผจญภัย',           emoji: '🎒',
    desc: 'มือใหม่ — สมดุลทุกด้าน รอเปลี่ยนคลาสที่ Lv 5',
    growth: { str: 1, dex: 1, vit: 1 },
    skill: { name: 'ฟันธรรมดา',      mp: 0,  mult: 1.2, type: 'phys' },
    starter: true },
  { id: 'berserk',    name: 'นักดาบเดือด',          emoji: '⚔️',
    desc: 'นักรบสายลุย — โจมตีหนัก ทนทาน เข้าใกล้',
    growth: { str: 3, vit: 2, dex: 1 },
    skill: { name: 'ฟันสายฟ้า',     mp: 10, mult: 2.0, type: 'phys' } },
  { id: 'gunslinger', name: 'มือปืนเงา',            emoji: '🔫',
    desc: 'มือปืนระยะไกล — เน้น DEX ให้ยิงแม่น',
    growth: { dex: 3, agi: 2, luk: 1 },
    skill: { name: 'กระสุนเจาะ',     mp: 8,  mult: 1.7, type: 'phys' } },
  { id: 'assassin',   name: 'อัสซาซิน',             emoji: '🗡️',
    desc: 'นักลอบสังหาร — ไว คริติคัล',
    growth: { agi: 3, luk: 2, str: 1 },
    skill: { name: 'ลอบสังหาร',      mp: 8,  mult: 1.9, type: 'phys' } },
  { id: 'heavenkn',   name: 'อัศวินสวรรค์',         emoji: '🛡️',
    desc: 'อัศวินทนทาน — เน้น VIT ป้องกัน',
    growth: { vit: 3, str: 2, dex: 1 },
    skill: { name: 'ฟันศักดิ์สิทธิ์', mp: 10, mult: 1.8, type: 'holy' } },
  { id: 'musician',   name: 'นักดนตรีศักดิ์สิทธิ์', emoji: '🎵',
    desc: 'สาย support — INT สำหรับ MP, DEX สำหรับเล่นโน้ตแม่น',
    growth: { int: 3, dex: 2, luk: 1 },
    skill: { name: 'บทเพลงสมาน',    mp: 12, mult: 0,   type: 'heal' } },
  { id: 'shaman',     name: 'ชาแมนเร้นลับ',         emoji: '🔮',
    desc: 'สายเวท — INT สูง mAtk แรง',
    growth: { int: 4, luk: 2 },
    skill: { name: 'สายฟ้าโบราณ',    mp: 12, mult: 2.2, type: 'magic' } },
]

/** Slice 26: classes offered in the ClassChoiceModal (excludes the starter
 *  class itself + any future deprecated entries with available:false). */
export const AVAILABLE_CLASSES: CharClass[] = CLASSES.filter(
  (c) => !c.starter && (c.available ?? true),
)
/** The starter class assigned at character creation (Slice 26). */
export const STARTER_CLASS = CLASSES.find((c) => c.starter)!
/** Lv at which the class-change quest unlocks (mirrors TRANSCEND_LV pattern). */
export const CLASS_CHANGE_LV = 5

export const ITEMS: Record<string, ItemDef> = {
  // Materials
  'silk':         { name: 'ไหมดักแด้',     emoji: '🧵', type: 'mat', rarity: 'common',    desc: 'วัตถุดิบเย็บผ้า' },
  'pollen':       { name: 'เกสรพิษ',       emoji: '🌼', type: 'mat', rarity: 'common',    desc: 'วัตถุดิบเวทย์' },
  'fang':         { name: 'เขี้ยวหมาป่า',   emoji: '🦷', type: 'mat', rarity: 'common',    desc: 'แข็งและคม' },
  'scale':        { name: 'เกล็ดงู',        emoji: '🐍', type: 'mat', rarity: 'common',    desc: 'เหนียวทนทาน' },
  'mushroom':     { name: 'เห็ดอาถรรพ์',   emoji: '🍄', type: 'mat', rarity: 'common',    desc: 'มีพลังเวทย์' },
  'magma':        { name: 'หินลาวา',       emoji: '🪨', type: 'mat', rarity: 'rare',      desc: 'ร้อนระอุ' },
  'dragon-scale': { name: 'เกล็ดมังกร',    emoji: '🔶', type: 'mat', rarity: 'rare',      desc: 'แข็งดั่งเพชร' },
  'soul':         { name: 'ดวงวิญญาณ',    emoji: '👻', type: 'mat', rarity: 'rare',      desc: 'พลังเร้นลับ' },
  'demon-horn':   { name: 'เขาปีศาจ',      emoji: '🦴', type: 'mat', rarity: 'epic',      desc: 'พลังมืด' },
  'soul-gem':     { name: 'อัญมณีวิญญาณ',  emoji: '💎', type: 'mat', rarity: 'legendary', desc: 'หายากสุดๆ' },
  'crown':        { name: 'มงกุฎมาร',      emoji: '👑', type: 'mat', rarity: 'legendary', desc: 'พลังจอมมาร' },
  'plus-stone':   { name: 'หินตีบวก',      emoji: '💠', type: 'mat', rarity: 'rare',      desc: 'เพิ่มพลังอาวุธ' },
  // Consumables
  'potion-s': { name: 'ยาฟื้น HP เล็ก',  emoji: '🧪', type: 'consume', rarity: 'common', heal: 50,  desc: 'ฟื้น HP 50' },
  'potion-m': { name: 'ยาฟื้น HP กลาง', emoji: '🍶', type: 'consume', rarity: 'rare',   heal: 150, desc: 'ฟื้น HP 150' },
  'potion-l': { name: 'ยาฟื้น HP ใหญ่', emoji: '🏺', type: 'consume', rarity: 'epic',   heal: 400, desc: 'ฟื้น HP 400' },
  'ether-s':  { name: 'น้ำมนตร์เล็ก',    emoji: '💧', type: 'consume', rarity: 'common', healMp: 30, desc: 'ฟื้น MP 30' },
  // Weapons
  'sword-1': { name: 'ดาบไหม',         emoji: '🗡️', type: 'weapon', rarity: 'common',    atk: 8,  desc: 'อาวุธพื้นฐาน' },
  'sword-2': { name: 'ดาบเขี้ยว',       emoji: '⚔️', type: 'weapon', rarity: 'rare',      atk: 18, desc: 'อาวุธป่า' },
  'sword-3': { name: 'ดาบลาวา',        emoji: '🔥', type: 'weapon', rarity: 'epic',      atk: 38, desc: 'อาวุธภูเขาไฟ' },
  'sword-4': { name: 'ดาบจอมมาร',      emoji: '👿', type: 'weapon', rarity: 'legendary', atk: 80, desc: 'อาวุธในตำนาน' },
  'gun-1':   { name: 'ปืนพก',          emoji: '🔫', type: 'weapon', rarity: 'common',    atk: 7,  desc: 'อาวุธมือปืน' },
  'gun-2':   { name: 'ปืนเขี้ยวงู',     emoji: '🐍', type: 'weapon', rarity: 'rare',      atk: 17, desc: 'อาวุธมือปืน' },
  'gun-3':   { name: 'ปืนเพลิงมังกร',  emoji: '🐉', type: 'weapon', rarity: 'epic',      atk: 36, desc: 'อาวุธมือปืน' },
  'staff-1': { name: 'ไม้เท้าซากุระ',   emoji: '🌸', type: 'weapon', rarity: 'common',    atk: 6,  matk: 4,  desc: 'อาวุธชาแมน' },
  'staff-2': { name: 'ไม้เท้าเห็ด',     emoji: '🍄', type: 'weapon', rarity: 'rare',      atk: 14, matk: 10, desc: 'อาวุธชาแมน' },
  'staff-3': { name: 'ไม้เท้าวิญญาณ',  emoji: '👻', type: 'weapon', rarity: 'epic',      atk: 30, matk: 24, desc: 'อาวุธชาแมน' },
  // Armor
  'armor-1': { name: 'เกราะไหม',      emoji: '👕', type: 'armor', rarity: 'common',    def: 5,  desc: 'เกราะพื้นฐาน' },
  'armor-2': { name: 'เกราะเกล็ด',    emoji: '🦺', type: 'armor', rarity: 'rare',      def: 12, desc: 'เกราะป่า' },
  'armor-3': { name: 'เกราะลาวา',    emoji: '🥋', type: 'armor', rarity: 'epic',      def: 26, desc: 'เกราะภูเขาไฟ' },
  'armor-4': { name: 'เกราะมงกุฎมาร', emoji: '👘', type: 'armor', rarity: 'legendary', def: 55, desc: 'เกราะตำนาน' },
}

// Maps are connected via warps (run into a warp tile → teleport to another map)
//
//   village  ←→  sakura  ←→  forest  ←→  volcano  ←→  hell
//
export const MAPS: Record<string, MapDef> = {
  village: {
    id: 'village', name: 'หมู่บ้านแห่งสายลม', minLv: 1, maxLv: 99,
    tiles: ['🏠', '🌳', '⛲', '🌷'], bg: '#a8d8a0', pathColor: '#d4a878',
    w: 12, h: 10, monsterCount: 0,
    monsters: [],
    warps: [
      { x: 11, y: 5, to: 'sakura', tx: 0, ty: 5, label: '→ ทุ่งซากุระ' },
    ],
  },
  sakura: {
    id: 'sakura', name: 'ทุ่งซากุระ', minLv: 1, maxLv: 5,
    tiles: ['🌸', '🌿', '🌱'], bg: '#f8c8d8', pathColor: '#d4a4b8',
    w: 14, h: 10, monsterCount: 6,
    monsters: [
      { id: 'larva-small',    name: 'ดักแด้น้อย', emoji: '🐛', lv: 1, hp: 25, atk: 5, def: 2, spd: 5, exp: 8,  gold: 5,  drop: { item: 'silk',   chance: 0.6 } },
      { id: 'butterfly',      name: 'ผีเสื้อ',    emoji: '🦋', lv: 2, hp: 35, atk: 7, def: 3, spd: 8, exp: 12, gold: 7,  drop: { item: 'silk',   chance: 0.5 } },
      { id: 'poison-flower',  name: 'ดอกพิษ',    emoji: '🌺', lv: 3, hp: 50, atk: 9, def: 4, spd: 4, exp: 16, gold: 10, drop: { item: 'pollen', chance: 0.7 } },
    ],
    warps: [
      { x: 0, y: 5, to: 'village', tx: 10, ty: 5, label: '← หมู่บ้าน' },
      { x: 13, y: 5, to: 'forest', tx: 0, ty: 5, label: '→ ป่าเร้นลับ' },
    ],
  },
  forest: {
    id: 'forest', name: 'ป่ามืดเร้นลับ', minLv: 5, maxLv: 12,
    tiles: ['🌲', '🌳', '🍄'], bg: '#7fb070', pathColor: '#8a6a4a',
    w: 14, h: 11, monsterCount: 7,
    monsters: [
      { id: 'wolf-shadow',     name: 'หมาป่าเงา',   emoji: '🐺', lv: 6,  hp: 85,  atk: 14, def: 6,  spd: 11, exp: 30, gold: 18, drop: { item: 'fang',     chance: 0.5 } },
      { id: 'snake-giant',     name: 'งูยักษ์',      emoji: '🐍', lv: 8,  hp: 110, atk: 18, def: 7,  spd: 9,  exp: 42, gold: 24, drop: { item: 'scale',    chance: 0.55 } },
      { id: 'mushroom-mystic', name: 'เห็ดอาถรรพ์', emoji: '🍄', lv: 10, hp: 140, atk: 20, def: 10, spd: 6,  exp: 60, gold: 35, drop: { item: 'mushroom', chance: 0.6 } },
    ],
    warps: [
      { x: 0, y: 5, to: 'sakura', tx: 12, ty: 5, label: '← ทุ่งซากุระ' },
      { x: 13, y: 5, to: 'volcano', tx: 0, ty: 5, label: '→ ภูเขาไฟ' },
    ],
    // Slice 11 smoke test: 6 tree walls flanking the central east-west path
    // so the player has to weave around them. None of these block the path
    // tiles (y=5) or the warps at (0,5)/(13,5).
    walls: [
      { x: 3,  y: 3, glyph: '🌳' },
      { x: 3,  y: 7, glyph: '🌳' },
      { x: 7,  y: 2, glyph: '🌳' },
      { x: 7,  y: 8, glyph: '🌳' },
      { x: 10, y: 4, glyph: '🌳' },
      { x: 10, y: 6, glyph: '🌳' },
    ],
  },
  volcano: {
    id: 'volcano', name: 'ภูเขาไฟอสูร', minLv: 12, maxLv: 25,
    tiles: ['🌋', '🔥', '🪨'], bg: '#d57a4a', pathColor: '#6a2a1a',
    w: 14, h: 11, monsterCount: 7,
    monsters: [
      { id: 'demon-lava',       name: 'อสูรลาวา',    emoji: '👹', lv: 14, hp: 220, atk: 28, def: 14, spd: 10, exp: 110, gold: 60,  drop: { item: 'magma',        chance: 0.5 } },
      { id: 'dragon-fire-small', name: 'มังกรไฟน้อย', emoji: '🐉', lv: 18, hp: 320, atk: 38, def: 18, spd: 12, exp: 180, gold: 90,  drop: { item: 'dragon-scale', chance: 0.4 } },
      { id: 'ghost-fire',       name: 'ผีไฟ',        emoji: '👻', lv: 20, hp: 280, atk: 42, def: 12, spd: 16, exp: 220, gold: 120, drop: { item: 'soul',         chance: 0.5 } },
    ],
    warps: [
      { x: 0, y: 5, to: 'forest', tx: 12, ty: 5, label: '← ป่า' },
      { x: 13, y: 5, to: 'hell', tx: 0, ty: 5, label: '→ นรกลึก' },
    ],
  },
  hell: {
    id: 'hell', name: 'นรกลึก', minLv: 25, maxLv: 50,
    tiles: ['🔥', '💀', '🩸'], bg: '#7a3050', pathColor: '#3a0e1a',
    w: 14, h: 11, monsterCount: 7,
    monsters: [
      { id: 'demon-half-moon', name: 'ปีศาจครึ่งดวงจันทร์', emoji: '🦇', lv: 28, hp: 480,  atk: 60,  def: 24, spd: 18, exp: 360, gold: 200, drop: { item: 'demon-horn', chance: 0.45 } },
      // พญายมราช: elite tier — rarer encounter, signature drop is soul-gem (legendary).
      { id: 'death-lord',      name: 'พญายมราช',          emoji: '☠️', lv: 35, hp: 720,  atk: 82,  def: 32, spd: 20, exp: 560, gold: 320, rank: 'elite', drop: { item: 'soul-gem',  chance: 0.3 } },
      // จอมมาร: boss — slice 11 will gate its spawn behind tile.kind='boss-spawn'.
      { id: 'demon-lord',      name: 'จอมมาร',            emoji: '😈', lv: 45, hp: 1100, atk: 110, def: 44, spd: 22, exp: 900, gold: 600, rank: 'boss',  drops: [
        { item: 'crown',    chance: 0.5, minQty: 1, maxQty: 1 },
        { item: 'soul-gem', chance: 0.8, minQty: 1, maxQty: 2 },
        { item: 'demon-horn', chance: 1.0, minQty: 2, maxQty: 4 },
      ] },
    ],
    warps: [
      { x: 0, y: 5, to: 'volcano', tx: 12, ty: 5, label: '← ภูเขาไฟ' },
    ],
  },
}

export const RECIPES: Recipe[] = [
  { result: 'sword-1', mats: { silk: 3, pollen: 2 },               gold: 50,   classReq: ['berserk', 'heavenkn', 'assassin'] },
  { result: 'sword-2', mats: { fang: 5, scale: 3 },                gold: 200,  classReq: ['berserk', 'heavenkn', 'assassin'] },
  { result: 'sword-3', mats: { magma: 5, 'dragon-scale': 2 },      gold: 800,  classReq: ['berserk', 'heavenkn', 'assassin'] },
  { result: 'sword-4', mats: { 'demon-horn': 4, 'soul-gem': 1 },   gold: 3000, classReq: ['berserk', 'heavenkn', 'assassin'] },
  { result: 'gun-1',   mats: { silk: 3, pollen: 2 },               gold: 50,   classReq: ['gunslinger'] },
  { result: 'gun-2',   mats: { fang: 5, scale: 3 },                gold: 200,  classReq: ['gunslinger'] },
  { result: 'gun-3',   mats: { magma: 5, 'dragon-scale': 2 },      gold: 800,  classReq: ['gunslinger'] },
  { result: 'staff-1', mats: { silk: 2, pollen: 4 },               gold: 50,   classReq: ['shaman', 'musician'] },
  { result: 'staff-2', mats: { mushroom: 5, scale: 2 },            gold: 200,  classReq: ['shaman', 'musician'] },
  { result: 'staff-3', mats: { soul: 4, 'dragon-scale': 1 },       gold: 800,  classReq: ['shaman', 'musician'] },
  { result: 'armor-1', mats: { silk: 5 },                          gold: 60 },
  { result: 'armor-2', mats: { scale: 6, fang: 2 },                gold: 220 },
  { result: 'armor-3', mats: { magma: 6, soul: 1 },                gold: 850 },
  { result: 'armor-4', mats: { crown: 1, 'soul-gem': 1 },          gold: 3500 },
]

export function expForLv(lv: number): number {
  return 20 + Math.floor(Math.pow(lv, 2.2) * 5)
}

/** Fixed gold cost for a Healer NPC's full HP/MP restore. Single source of
 *  truth — modal UI and any future server-authoritative heal handler both
 *  read from here. */
export const HEAL_FULL_COST = 50

export const NPCS: Record<string, NpcDef> = {
  'village-shopkeeper': {
    id: 'village-shopkeeper',
    name: 'แม่ค้าประจำหมู่บ้าน',
    emoji: '🧙‍♀️',
    mapId: 'village',
    x: 3, y: 3,
    kind: 'shop',
    shop: [
      { item: 'potion-s',   price: 30 },
      { item: 'potion-m',   price: 100 },
      { item: 'potion-l',   price: 300 },
      { item: 'ether-s',    price: 50 },
      { item: 'plus-stone', price: 250 },
    ],
  },
  'village-healer': {
    id: 'village-healer',
    name: 'หมอประจำหมู่บ้าน',
    emoji: '👩‍⚕️',
    mapId: 'village',
    x: 8, y: 3,
    kind: 'healer',
  },
}

/** Generate a deterministic decorative Layout from a Map's tile palette.
 *  Produces the same scattered-glyph pattern the legacy MapScene drew
 *  procedurally — pinning it to JSON so it survives the move to DB.
 *
 *  Slice 10: every cell `walkable: true`, no `kind` set.
 *  Slice 11: optional `walls` parameter stamps walkable=false cells. */
export function makeLayout(map: Pick<MapDef, 'id' | 'w' | 'h' | 'tiles' | 'walls'>): TileDef[][] {
  const rows: TileDef[][] = []
  const idHash = map.id.length * 3
  for (let y = 0; y < map.h; y++) {
    const row: TileDef[] = []
    for (let x = 0; x < map.w; x++) {
      const h = (x * 7 + y * 13 + idHash) % 19
      const cell: TileDef = { walkable: true }
      // ~26% of cells get a decorative glyph; suppress the two strongest
      // glyphs on the centre horizontal path so it stays visually clear.
      if (h < 5) {
        const isPath = y === Math.floor(map.h / 2)
        if (!(isPath && h < 2)) {
          cell.glyph = map.tiles[h % map.tiles.length]
        }
      }
      row.push(cell)
    }
    rows.push(row)
  }
  // Stamp walls after the base layout — wall glyph overrides any decorative one.
  for (const w of map.walls ?? []) {
    if (w.y < 0 || w.y >= map.h || w.x < 0 || w.x >= map.w) continue
    rows[w.y][w.x] = {
      walkable: false,
      glyph: w.glyph ?? rows[w.y][w.x].glyph,
    }
  }
  return rows
}
