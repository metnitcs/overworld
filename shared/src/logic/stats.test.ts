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
    map: 'village', px: 0, py: 0, steps: 0,
    transcended: false, classChanged: false,
    ...overrides,
  }
}

/** Slice 47: helper to build a GameState whose equipWeapon/Armor FK points
 *  at a synthesised InventoryItem row carrying the given itemKey + plus. */
function gsWith(eq: { weapon?: { itemKey: string; plus?: number }; armor?: { itemKey: string; plus?: number } }, overrides: Partial<GameState> = {}): GameState {
  const inv: GameState['inventory'] = []
  let weaponId: string | null = null
  let armorId: string | null = null
  if (eq.weapon) {
    weaponId = 'iv-w'
    inv.push({ id: weaponId, itemKey: eq.weapon.itemKey, qty: 1, plus: eq.weapon.plus ?? 0 })
  }
  if (eq.armor) {
    armorId = 'iv-a'
    inv.push({ id: armorId, itemKey: eq.armor.itemKey, qty: 1, plus: eq.armor.plus ?? 0 })
  }
  return gs({ inventory: inv, equipWeapon: weaponId, equipArmor: armorId, ...overrides })
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
