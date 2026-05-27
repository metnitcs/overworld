import { describe, it, expect } from 'vitest'
import type { GameState } from '../types'
import { deriveStats, deriveCombatStats } from './stats'
import { STAT_BASE, BASE_HP, BASE_MP } from '../data'

/** Minimal GameState for stat tests; callers override the relevant fields.
 *  Slice 25: race/class no longer contribute legacy hp/atk/def/spd offsets,
 *  so the fixture's raceId / classId values don't influence the formulas. */
function gs(overrides: Partial<GameState> = {}): GameState {
  return {
    name: 'T', raceId: 'human', classId: 'berserk',
    lv: 1, exp: 0,
    hp: 9999, maxHp: 0, mp: 9999, maxMp: 0,
    atk: 0, def: 0, spd: 0, gold: 0,
    str: STAT_BASE, int: STAT_BASE, dex: STAT_BASE,
    agi: STAT_BASE, luk: STAT_BASE, vit: STAT_BASE,
    unspentPoints: 0,
    inventory: [], equipWeapon: null, equipArmor: null,
    // Slice 52a: 7 new equip slots — all null in the fixture.
    equipShield: null, equipHelmet: null, equipBoots: null, equipCloak: null,
    equipNecklace: null, equipRing1: null, equipRing2: null,
    map: 'village', px: 0, py: 0, steps: 0,
    transcended: false, classChanged: false,
    ...overrides,
  }
}

/** Slice 47: helper to build a GameState whose equipWeapon/Armor FK points
 *  at a synthesised InventoryItem row carrying the given itemKey + plus.
 *  Slice 52a: extended to all 9 equip slots. Each key matches the
 *  GameState.equipXxx field name (weapon, armor, shield, helmet, boots,
 *  cloak, necklace, ring1, ring2). */
type GearSpec = { itemKey: string; plus?: number }
type GsEq = Partial<Record<
  'weapon' | 'armor' | 'shield' | 'helmet' | 'boots' | 'cloak' | 'necklace' | 'ring1' | 'ring2',
  GearSpec
>>
function gsWith(eq: GsEq, overrides: Partial<GameState> = {}): GameState {
  const inv: GameState['inventory'] = []
  const equipPatch: Partial<GameState> = {}
  const slotToField = {
    weapon: 'equipWeapon', armor: 'equipArmor', shield: 'equipShield',
    helmet: 'equipHelmet', boots: 'equipBoots', cloak: 'equipCloak',
    necklace: 'equipNecklace', ring1: 'equipRing1', ring2: 'equipRing2',
  } as const
  let idx = 0
  for (const [slot, spec] of Object.entries(eq) as [keyof GsEq, GearSpec][]) {
    if (!spec) continue
    const id = `iv-${idx++}`
    inv.push({ id, itemKey: spec.itemKey, qty: 1, plus: spec.plus ?? 0 })
    ;(equipPatch as Record<string, string>)[slotToField[slot]] = id
  }
  return gs({ inventory: inv, ...equipPatch, ...overrides })
}

describe('deriveStats — primary-stat formulas', () => {
  it('maxHp = BASE_HP + VIT*10 + (lv-1)*5  (no race offset)', () => {
    // Lv1, VIT 10 → 50 + 100 + 0 = 150
    const g = deriveStats(gs({ lv: 1 }))
    expect(g.maxHp).toBe(BASE_HP + 10 * 10)

    // VIT 20 → 50 + 200 = 250
    const beefy = deriveStats(gs({ lv: 1, vit: 20 }))
    expect(beefy.maxHp).toBe(BASE_HP + 20 * 10)
  })

  it('maxMp = BASE_MP + INT*3 + (lv-1)*2  (no race/class offset)', () => {
    // Lv1, INT 10 → 20 + 30 = 50
    const g = deriveStats(gs({ lv: 1 }))
    expect(g.maxMp).toBe(BASE_MP + 30)
  })

  it('pAtk scales with STR only (race/class atk offsets removed in Slice 25)', () => {
    // STR 10 → 20 + 0 = 20
    const g = deriveStats(gs({ lv: 1 }))
    expect(g.atk).toBe(10 * 2)

    // STR 50 → 100
    const buff = deriveStats(gs({ lv: 1, str: 50 }))
    expect(buff.atk).toBe(50 * 2)
  })

  it('pDef = floor(VIT*0.5) + floor((lv-1)*1.0)  (no race/class offset)', () => {
    // VIT 10 → 5 + 0 = 5
    const g = deriveStats(gs({ lv: 1 }))
    expect(g.def).toBe(5)
  })

  it('spd = floor(AGI*0.5) + floor((lv-1)*0.4)  (no race/class offset)', () => {
    // AGI 10, Lv 1 → 5 + 0 = 5
    const g = deriveStats(gs({ lv: 1 }))
    expect(g.spd).toBe(5)
  })

  it('Slice 51: weapon ATK + step plus bonus folds into pAtk', () => {
    // base pAtk (STR 10) = 20 ; sword-1 atk 8 ; plus 2 → step bonus 4
    // (low tier: +1, +2 → +2 each, cumulative 2,4) → 20 + 8 + 4 = 32
    const g = deriveStats(gsWith({ weapon: { itemKey: 'sword-1', plus: 2 } }, { lv: 1 }))
    expect(g.atk).toBe(20 + 8 + 4)
  })

  it('Slice 51: weapon mATK uses the same step bonus, but only when the weapon has matk', () => {
    // base mAtk (INT 10) = 20
    // staff-1 (matk 4) → 24
    const eq = deriveCombatStats(gsWith({ weapon: { itemKey: 'staff-1' } }, { lv: 1 }))
    expect(eq.mAtk).toBe(20 + 4)
    // plus 2 → step bonus 4 → 28
    const enh = deriveCombatStats(gsWith({ weapon: { itemKey: 'staff-1', plus: 2 } }, { lv: 1 }))
    expect(enh.mAtk).toBe(20 + 4 + 4)
    // non-matk weapon plus → mAtk unchanged (sword has no matk; step
    // bonus is suppressed in the mAtk fold).
    const noMatk = deriveCombatStats(gsWith({ weapon: { itemKey: 'sword-1', plus: 5 } }, { lv: 1 }))
    expect(noMatk.mAtk).toBe(20)
  })

  it('Slice 51: armor DEF + step plus bonus folds into pDef', () => {
    // base pDef (VIT 10) = 5 ; armor-1 def 5 ; plus 3 → step bonus 3
    // (low tier: +1,+2,+3 → +1 each, cumulative 1,2,3) → 5 + 5 + 3 = 13
    const g = deriveStats(gsWith({ armor: { itemKey: 'armor-1', plus: 3 } }, { lv: 1 }))
    expect(g.def).toBe(5 + 5 + 3)
  })

  it('Slice 51: enhancePlusAtkBonus curve hits 10 at +5 and 35 at +10', async () => {
    const { enhancePlusAtkBonus } = await import('./stats')
    expect(enhancePlusAtkBonus(0)).toBe(0)
    expect(enhancePlusAtkBonus(1)).toBe(2)
    expect(enhancePlusAtkBonus(5)).toBe(10) // 5 * 2
    expect(enhancePlusAtkBonus(6)).toBe(15) // 5*2 + 1*5
    expect(enhancePlusAtkBonus(10)).toBe(35) // 5*2 + 5*5
  })

  it('Slice 51: enhancePlusDefBonus curve hits 5 at +5 and 20 at +10', async () => {
    const { enhancePlusDefBonus } = await import('./stats')
    expect(enhancePlusDefBonus(0)).toBe(0)
    expect(enhancePlusDefBonus(1)).toBe(1)
    expect(enhancePlusDefBonus(5)).toBe(5) // 5 * 1
    expect(enhancePlusDefBonus(6)).toBe(8) // 5*1 + 1*3
    expect(enhancePlusDefBonus(10)).toBe(20) // 5*1 + 5*3
  })

  it('Slice 51: per-item primary stat bonuses fold into derived stats before deriving', () => {
    // Create an item override map with a bonus weapon adding +10 STR + 5 VIT.
    const itemsOverride: Record<string, import('../types').ItemDef> = {
      'buff-sword': { name: 'B', emoji: '🗡', type: 'weapon', atk: 5, bonusStr: 10, bonusVit: 5, desc: 'test' },
    }
    const g = gsWith({ weapon: { itemKey: 'buff-sword' } }, { lv: 1 })
    const d = deriveCombatStats(g, { items: itemsOverride })
    // effStr = 10 + 10 = 20 → pAtk = 20*2 = 40 + weapon atk 5 = 45
    expect(d.pAtk).toBe(40 + 5)
    // effVit = 10 + 5 = 15 → maxHp = 50 + 15*10 = 200 (BASE_HP 50)
    expect(d.maxHp).toBe(BASE_HP + 15 * 10)
    // pDef from effVit too: floor(15*0.5) = 7
    expect(d.pDef).toBe(7)
  })

  it('Slice 52a: shield + helmet contribute def with Plus step bonus', () => {
    const itemsOverride: Record<string, import('../types').ItemDef> = {
      'iron-shield':  { name: 'IS', emoji: '🛡', type: 'shield', def: 4, desc: 'test' },
      'iron-helmet':  { name: 'IH', emoji: '🪖', type: 'helmet', def: 3, desc: 'test' },
    }
    // Plus 6 → enhancePlusDefBonus(6) = 8 (cumulative)
    const g = gsWith({
      shield: { itemKey: 'iron-shield', plus: 6 },
      helmet: { itemKey: 'iron-helmet', plus: 0 },
    }, { lv: 1 })
    const d = deriveCombatStats(g, { items: itemsOverride })
    // base pDef = floor(10*0.5) = 5
    // shield: +4 + 8 (Plus step) = 12
    // helmet: +3 + 0 = 3
    // total pDef = 5 + 12 + 3 = 20
    expect(d.pDef).toBe(20)
  })

  it('Slice 52a: boots / cloak / necklace / ring deliver via bonusXxx only (no slot-typed contribution)', () => {
    const itemsOverride: Record<string, import('../types').ItemDef> = {
      'speed-boots': { name: 'SB', emoji: '👢', type: 'boots',    bonusAgi: 8, desc: 'test' },
      'mage-cloak':  { name: 'MC', emoji: '🧥', type: 'cloak',    bonusInt: 6, desc: 'test' },
      'ruby-neck':   { name: 'RN', emoji: '📿', type: 'necklace', bonusInt: 4, desc: 'test' },
      'crit-ring':   { name: 'CR', emoji: '💍', type: 'ring',     bonusLuk: 10, desc: 'test' },
      'hp-ring':     { name: 'HR', emoji: '💍', type: 'ring',     bonusVit: 5, desc: 'test' },
    }
    const g = gsWith({
      boots:    { itemKey: 'speed-boots' },
      cloak:    { itemKey: 'mage-cloak' },
      necklace: { itemKey: 'ruby-neck' },
      ring1:    { itemKey: 'crit-ring' },
      ring2:    { itemKey: 'hp-ring' },
    }, { lv: 1 })
    const d = deriveCombatStats(g, { items: itemsOverride })
    // effAgi = 10 + 8 = 18 → spd = floor(18*0.5) = 9; dodge = floor(0.5 + 7.2) = 7
    expect(d.spd).toBe(9)
    expect(d.dodge).toBe(7)
    // effInt = 10 + 6 + 4 = 20 → mAtk = 20*2 = 40; mDef = floor(20*0.5) = 10; maxMp = 20 + 60 = 80
    expect(d.mAtk).toBe(40)
    expect(d.mDef).toBe(10)
    expect(d.maxMp).toBe(80)
    // effLuk = 10 + 10 = 20 → crit = floor(20*0.3) = 6
    expect(d.crit).toBe(6)
    // effVit = 10 + 5 = 15 → maxHp = 50 + 150 = 200; pDef = floor(15*0.5) = 7
    expect(d.maxHp).toBe(BASE_HP + 150)
    expect(d.pDef).toBe(7)
  })

  it('clamps current hp/mp to new maxima; falsy current = full', () => {
    const capped = deriveStats(gs({ lv: 1, hp: 9999, mp: 9999 }))
    expect(capped.hp).toBe(capped.maxHp)
    expect(capped.mp).toBe(capped.maxMp)

    const filled = deriveStats(gs({ lv: 1, hp: 0, mp: 0 }))
    expect(filled.hp).toBe(filled.maxHp)
    expect(filled.mp).toBe(filled.maxMp)
  })
})

describe('deriveCombatStats — accuracy / dodge / crit / mAtk / mDef', () => {
  it('acc = 85 + Lv + floor(DEX * 1.5) — high baseline so low-Lv players rarely miss', () => {
    expect(deriveCombatStats(gs({ lv: 1, dex: 10 })).acc).toBe(101)
    expect(deriveCombatStats(gs({ lv: 5, dex: 50 })).acc).toBe(165)
  })

  it('dodge = floor(Lv*0.5 + AGI*0.4) — slow scaling so monsters rarely miss too', () => {
    expect(deriveCombatStats(gs({ lv: 1, agi: 10 })).dodge).toBe(4)
    expect(deriveCombatStats(gs({ lv: 10, agi: 50 })).dodge).toBe(25)
  })

  it('crit = min(50, floor(LUK * 0.3))', () => {
    expect(deriveCombatStats(gs({ luk: 10 })).crit).toBe(3)
    expect(deriveCombatStats(gs({ luk: 100 })).crit).toBe(30)
    expect(deriveCombatStats(gs({ luk: 200 })).crit).toBe(50)
  })

  it('mAtk = INT*2 + floor((lv-1)*1.0)', () => {
    expect(deriveCombatStats(gs({ int: 10, lv: 1 })).mAtk).toBe(20)
    expect(deriveCombatStats(gs({ int: 30, lv: 11 })).mAtk).toBe(60 + 10)
  })

  it('mDef = floor(INT * 0.5)', () => {
    expect(deriveCombatStats(gs({ int: 10 })).mDef).toBe(5)
    expect(deriveCombatStats(gs({ int: 25 })).mDef).toBe(12)
  })
})
