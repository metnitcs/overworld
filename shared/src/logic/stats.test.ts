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
    inventory: {}, equipWeapon: null, equipArmor: null, plus: {},
    map: 'village', px: 0, py: 0, steps: 0,
    transcended: false,
    ...overrides,
  }
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

  it('weapon ATK + enhance (+3 per plus) folds into pAtk', () => {
    // base pAtk (STR 10) = 20 ; sword-1 atk 8 + plus 2 (+6) → 20 + 14 = 34
    const g = deriveStats(gs({
      lv: 1,
      equipWeapon: 'sword-1',
      plus: { 'sword-1_w': 2 },
    }))
    expect(g.atk).toBe(20 + 8 + 6)
  })

  it('weapon mATK folds into mAtk; enhance adds +3 per plus only when the weapon has matk', () => {
    // base mAtk (INT 10) = 20
    // staff-1 (matk 4) → 24
    const eq = deriveCombatStats(gs({ lv: 1, equipWeapon: 'staff-1' }))
    expect(eq.mAtk).toBe(20 + 4)
    // plus 2 → +6 → 30
    const enh = deriveCombatStats(gs({
      lv: 1, equipWeapon: 'staff-1',
      plus: { 'staff-1_w': 2 },
    }))
    expect(enh.mAtk).toBe(20 + 4 + 6)
    // non-matk weapon plus → mAtk unchanged
    const noMatk = deriveCombatStats(gs({
      lv: 1, equipWeapon: 'sword-1',
      plus: { 'sword-1_w': 5 },
    }))
    expect(noMatk.mAtk).toBe(20)
  })

  it('armor DEF + enhance (+2 per plus) folds into pDef', () => {
    // base pDef (VIT 10) = 5 ; armor-1 def 5 + plus 3 (+6) → 5 + 11 = 16
    const g = deriveStats(gs({
      lv: 1,
      equipArmor: 'armor-1',
      plus: { 'armor-1_a': 3 },
    }))
    expect(g.def).toBe(5 + 5 + 6)
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
