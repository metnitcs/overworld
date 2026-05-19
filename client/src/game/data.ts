import type { Race, CharClass, MapDef, ItemDef, Recipe } from './types'

export const RACES: Race[] = [
  { id: 'mara',  name: 'เผ่ามาร',     emoji: '😈', hp: 110, mp: 80,  atk: 12, def: 8,  spd: 10, desc: 'พลังโจมตีและ HP สูง' },
  { id: 'angel', name: 'เผ่านางฟ้า',   emoji: '👼', hp: 90,  mp: 120, atk: 10, def: 9,  spd: 11, desc: 'MP เยอะ ฟื้นฟูเก่ง' },
  { id: 'beast', name: 'เผ่าสัตว์อสูร', emoji: '🐺', hp: 100, mp: 70,  atk: 11, def: 10, spd: 13, desc: 'รวดเร็ว ป้องกันดี' },
  { id: 'god',   name: 'เผ่าเทพ',      emoji: '👑', hp: 95,  mp: 100, atk: 13, def: 8,  spd: 9,  desc: 'พลังเวทย์รุนแรง' },
  { id: 'yaksa', name: 'เผ่ายักษ์',    emoji: '👺', hp: 130, mp: 60,  atk: 14, def: 12, spd: 7,  desc: 'อึดสุด พลังถึก' },
  { id: 'phaya', name: 'เผ่าพญามาร',  emoji: '🦹', hp: 105, mp: 90,  atk: 13, def: 9,  spd: 11, desc: 'สมดุลระดับสูง' },
]

export const CLASSES: CharClass[] = [
  { id: 'berserk',    name: 'นักดาบเดือด',          emoji: '⚔️', atk: 6, def: 2, spd: 1, mp: 0,  skill: { name: 'ฟันสายฟ้า',     mp: 10, mult: 2.0, type: 'phys' } },
  { id: 'gunslinger', name: 'มือปืนเงา',            emoji: '🔫', atk: 5, def: 1, spd: 3, mp: 0,  skill: { name: 'กระสุนเจาะ',     mp: 8,  mult: 1.7, type: 'phys' } },
  { id: 'assassin',   name: 'อัสซาซิน',             emoji: '🗡️', atk: 5, def: 1, spd: 4, mp: 0,  skill: { name: 'ลอบสังหาร',      mp: 8,  mult: 1.9, type: 'phys' } },
  { id: 'heavenkn',   name: 'อัศวินสวรรค์',         emoji: '🛡️', atk: 4, def: 4, spd: 1, mp: 0,  skill: { name: 'ฟันศักดิ์สิทธิ์', mp: 10, mult: 1.8, type: 'holy' } },
  { id: 'musician',   name: 'นักดนตรีศักดิ์สิทธิ์', emoji: '🎵', atk: 3, def: 2, spd: 2, mp: 15, skill: { name: 'บทเพลงสมาน',    mp: 12, mult: 0,   type: 'heal' } },
  { id: 'shaman',     name: 'ชาแมนเร้นลับ',         emoji: '🔮', atk: 6, def: 1, spd: 2, mp: 10, skill: { name: 'สายฟ้าโบราณ',    mp: 12, mult: 2.2, type: 'magic' } },
]

export const ITEMS: Record<string, ItemDef> = {
  // Materials
  'silk':         { name: 'ไหมดักแด้',     emoji: '🧵', type: 'mat', desc: 'วัตถุดิบเย็บผ้า' },
  'pollen':       { name: 'เกสรพิษ',       emoji: '🌼', type: 'mat', desc: 'วัตถุดิบเวทย์' },
  'fang':         { name: 'เขี้ยวหมาป่า',   emoji: '🦷', type: 'mat', desc: 'แข็งและคม' },
  'scale':        { name: 'เกล็ดงู',        emoji: '🐍', type: 'mat', desc: 'เหนียวทนทาน' },
  'mushroom':     { name: 'เห็ดอาถรรพ์',   emoji: '🍄', type: 'mat', desc: 'มีพลังเวทย์' },
  'magma':        { name: 'หินลาวา',       emoji: '🪨', type: 'mat', desc: 'ร้อนระอุ' },
  'dragon-scale': { name: 'เกล็ดมังกร',    emoji: '🔶', type: 'mat', desc: 'แข็งดั่งเพชร' },
  'soul':         { name: 'ดวงวิญญาณ',    emoji: '👻', type: 'mat', desc: 'พลังเร้นลับ' },
  'demon-horn':   { name: 'เขาปีศาจ',      emoji: '🦴', type: 'mat', desc: 'พลังมืด' },
  'soul-gem':     { name: 'อัญมณีวิญญาณ',  emoji: '💎', type: 'mat', desc: 'หายากสุดๆ' },
  'crown':        { name: 'มงกุฎมาร',      emoji: '👑', type: 'mat', desc: 'พลังจอมมาร' },
  'plus-stone':   { name: 'หินตีบวก',      emoji: '💠', type: 'mat', desc: 'เพิ่มพลังอาวุธ' },
  // Consumables
  'potion-s': { name: 'ยาฟื้น HP เล็ก',  emoji: '🧪', type: 'consume', heal: 50,  desc: 'ฟื้น HP 50' },
  'potion-m': { name: 'ยาฟื้น HP กลาง', emoji: '🍶', type: 'consume', heal: 150, desc: 'ฟื้น HP 150' },
  'potion-l': { name: 'ยาฟื้น HP ใหญ่', emoji: '🏺', type: 'consume', heal: 400, desc: 'ฟื้น HP 400' },
  'ether-s':  { name: 'น้ำมนตร์เล็ก',    emoji: '💧', type: 'consume', healMp: 30, desc: 'ฟื้น MP 30' },
  // Weapons
  'sword-1': { name: 'ดาบไหม',         emoji: '🗡️', type: 'weapon', atk: 8,  desc: 'อาวุธพื้นฐาน' },
  'sword-2': { name: 'ดาบเขี้ยว',       emoji: '⚔️', type: 'weapon', atk: 18, desc: 'อาวุธป่า' },
  'sword-3': { name: 'ดาบลาวา',        emoji: '🔥', type: 'weapon', atk: 38, desc: 'อาวุธภูเขาไฟ' },
  'sword-4': { name: 'ดาบจอมมาร',      emoji: '👿', type: 'weapon', atk: 80, desc: 'อาวุธในตำนาน' },
  'gun-1':   { name: 'ปืนพก',          emoji: '🔫', type: 'weapon', atk: 7,  desc: 'อาวุธมือปืน' },
  'gun-2':   { name: 'ปืนเขี้ยวงู',     emoji: '🐍', type: 'weapon', atk: 17, desc: 'อาวุธมือปืน' },
  'gun-3':   { name: 'ปืนเพลิงมังกร',  emoji: '🐉', type: 'weapon', atk: 36, desc: 'อาวุธมือปืน' },
  'staff-1': { name: 'ไม้เท้าซากุระ',   emoji: '🌸', type: 'weapon', atk: 6,  matk: 4,  desc: 'อาวุธชาแมน' },
  'staff-2': { name: 'ไม้เท้าเห็ด',     emoji: '🍄', type: 'weapon', atk: 14, matk: 10, desc: 'อาวุธชาแมน' },
  'staff-3': { name: 'ไม้เท้าวิญญาณ',  emoji: '👻', type: 'weapon', atk: 30, matk: 24, desc: 'อาวุธชาแมน' },
  // Armor
  'armor-1': { name: 'เกราะไหม',      emoji: '👕', type: 'armor', def: 5,  desc: 'เกราะพื้นฐาน' },
  'armor-2': { name: 'เกราะเกล็ด',    emoji: '🦺', type: 'armor', def: 12, desc: 'เกราะป่า' },
  'armor-3': { name: 'เกราะลาวา',    emoji: '🥋', type: 'armor', def: 26, desc: 'เกราะภูเขาไฟ' },
  'armor-4': { name: 'เกราะมงกุฎมาร', emoji: '👘', type: 'armor', def: 55, desc: 'เกราะตำนาน' },
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
      { name: 'ดักแด้น้อย', emoji: '🐛', lv: 1, hp: 25, atk: 5, def: 2, spd: 5, exp: 8,  gold: 5,  drop: { item: 'silk',   chance: 0.6 } },
      { name: 'ผีเสื้อ',    emoji: '🦋', lv: 2, hp: 35, atk: 7, def: 3, spd: 8, exp: 12, gold: 7,  drop: { item: 'silk',   chance: 0.5 } },
      { name: 'ดอกพิษ',    emoji: '🌺', lv: 3, hp: 50, atk: 9, def: 4, spd: 4, exp: 16, gold: 10, drop: { item: 'pollen', chance: 0.7 } },
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
      { name: 'หมาป่าเงา',   emoji: '🐺', lv: 6,  hp: 85,  atk: 14, def: 6,  spd: 11, exp: 30, gold: 18, drop: { item: 'fang',     chance: 0.5 } },
      { name: 'งูยักษ์',      emoji: '🐍', lv: 8,  hp: 110, atk: 18, def: 7,  spd: 9,  exp: 42, gold: 24, drop: { item: 'scale',    chance: 0.55 } },
      { name: 'เห็ดอาถรรพ์', emoji: '🍄', lv: 10, hp: 140, atk: 20, def: 10, spd: 6,  exp: 60, gold: 35, drop: { item: 'mushroom', chance: 0.6 } },
    ],
    warps: [
      { x: 0, y: 5, to: 'sakura', tx: 12, ty: 5, label: '← ทุ่งซากุระ' },
      { x: 13, y: 5, to: 'volcano', tx: 0, ty: 5, label: '→ ภูเขาไฟ' },
    ],
  },
  volcano: {
    id: 'volcano', name: 'ภูเขาไฟอสูร', minLv: 12, maxLv: 25,
    tiles: ['🌋', '🔥', '🪨'], bg: '#d57a4a', pathColor: '#6a2a1a',
    w: 14, h: 11, monsterCount: 7,
    monsters: [
      { name: 'อสูรลาวา',    emoji: '👹', lv: 14, hp: 220, atk: 28, def: 14, spd: 10, exp: 110, gold: 60,  drop: { item: 'magma',        chance: 0.5 } },
      { name: 'มังกรไฟน้อย', emoji: '🐉', lv: 18, hp: 320, atk: 38, def: 18, spd: 12, exp: 180, gold: 90,  drop: { item: 'dragon-scale', chance: 0.4 } },
      { name: 'ผีไฟ',        emoji: '👻', lv: 20, hp: 280, atk: 42, def: 12, spd: 16, exp: 220, gold: 120, drop: { item: 'soul',         chance: 0.5 } },
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
      { name: 'ปีศาจครึ่งดวงจันทร์', emoji: '🦇', lv: 28, hp: 480,  atk: 60,  def: 24, spd: 18, exp: 360, gold: 200, drop: { item: 'demon-horn', chance: 0.45 } },
      { name: 'พญายมราช',          emoji: '☠️', lv: 35, hp: 720,  atk: 82,  def: 32, spd: 20, exp: 560, gold: 320, drop: { item: 'soul-gem',  chance: 0.3 } },
      { name: 'จอมมาร',            emoji: '😈', lv: 45, hp: 1100, atk: 110, def: 44, spd: 22, exp: 900, gold: 600, drop: { item: 'crown',     chance: 0.2 } },
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
