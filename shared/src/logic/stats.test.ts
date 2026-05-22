import { describe, it, expect } from 'vitest'
import type { GameState } from '../types'
import { deriveStats, deriveCombatStats } from './stats'
import { STAT_BASE, BASE_HP, BASE_MP } from '../data'

/** Minimal GameState for stat tests; callers override the relevant fields.
 *  All primary stats default to STAT_BASE (10) — the Lv1 starting allocation. */
function gs(overrides: Partial<GameState> = {}): GameState {
  return {
    name: 'T', raceId: 'mara', classId: 'berserk',
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
  it('maxHp = BASE_HP + race.hp + VIT*10 + (lv-1)*5', () => {
    // Lv1, mara (hp110), VIT 10 → 50 + 110 + 100 + 0 = 260
    const g = deriveStats(gs({ raceId: 'mara', classId: 'berserk', lv: 1 }))
    expect(g.maxHp).toBe(BASE_HP + 110 + 10 * 10 + 0)

    // bump VIT to 20 → 50 + 110 + 200 = 360
    const beefy = deriveStats(gs({ raceId: 'mara', classId: 'berserk', lv: 1, vit: 20 }))
    expect(beefy.maxHp).toBe(BASE_HP + 110 + 20 * 10)
  })

  it('maxMp = BASE_MP + race.mp + class.mp + INT*3 + (lv-1)*2', () => {
    // Lv1, mara (mp80), berserk (mp0), INT 10 → 20 + 80 + 0 + 30 + 0 = 130
    const g = deriveStats(gs({ raceId: 'mara', classId: 'berserk', lv: 1 }))
    expect(g.maxMp).toBe(BASE_MP + 80 + 0 + 30 + 0)
  })

  it('pAtk scales with STR: race.atk + class.atk + STR*2 + floor((lv-1)*1.5)', () => {
    // mara atk12 + berserk atk6 + STR10*2 = 38
    const g = deriveStats(gs({ raceId: 'mara', classId: 'berserk', lv: 1 }))
    expect(g.atk).toBe(12 + 6 + 10 * 2)

    // STR 50 → +80 from STR alone
    const buff = deriveStats(gs({ raceId: 'mara', classId: 'berserk', lv: 1, str: 50 }))
    expect(buff.atk).toBe(12 + 6 + 50 * 2)
  })

  it('pDef = race.def + class.def + floor(VIT*0.5) + floor((lv-1)*1.0)', () => {
    // mara def8 + berserk def2 + VIT10*0.5=5 + 0 = 15
    const g = deriveStats(gs({ raceId: 'mara', classId: 'berserk', lv: 1 }))
    expect(g.def).toBe(8 + 2 + 5)
  })

  it('spd = race.spd + class.spd + floor(AGI*0.5) + floor((lv-1)*0.4)', () => {
    // mara spd10 + berserk spd1 + AGI10*0.5=5 = 16
    const g = deriveStats(gs({ raceId: 'mara', classId: 'berserk', lv: 1 }))
    expect(g.spd).toBe(10 + 1 + 5)
  })

  it('weapon ATK + enhance (+3 per plus) folds into pAtk', () => {
    // base 38 ; sword-1 atk8 +2 → +8+6 = 14 → 52
    const g = deriveStats(gs({
      lv: 1, raceId: 'mara', classId: 'berserk',
      equipWeapon: 'sword-1',
      plus: { 'sword-1_w': 2 },
    }))
    expect(g.atk).toBe(12 + 6 + 20 + 8 + 6)
  })

  it('weapon mATK folds into mAtk; enhance adds +3 per plus only when the weapon has matk', () => {
    // Slice 24 fix: staff-1 has matk 4. Base mAtk = INT*2 = 20.
    // With staff-1 equipped: mAtk = 20 + 4 = 24
    const eq = deriveCombatStats(gs({ lv: 1, equipWeapon: 'staff-1' }))
    expect(eq.mAtk).toBe(20 + 4)
    // Plus 2 → +6 mAtk → 30
    const enh = deriveCombatStats(gs({
      lv: 1, equipWeapon: 'staff-1',
      plus: { 'staff-1_w': 2 },
    }))
    expect(enh.mAtk).toBe(20 + 4 + 6)
    // Plus on a non-matk weapon (sword-1) does NOT bump mAtk
    const noMatk = deriveCombatStats(gs({
      lv: 1, equipWeapon: 'sword-1',
      plus: { 'sword-1_w': 5 },
    }))
    expect(noMatk.mAtk).toBe(20)
  })

  it('armor DEF + enhance (+2 per plus) folds into pDef', () => {
    // base 15 ; armor-1 def5 +3 → +5+6 = 11 → 26
    const g = deriveStats(gs({
      lv: 1, raceId: 'mara', classId: 'berserk',
      equipArmor: 'armor-1',
      plus: { 'armor-1_a': 3 },
    }))
    expect(g.def).toBe(8 + 2 + 5 + 5 + 6)
  })

  it('clamps current hp/mp to new maxima; falsy current = full', () => {
    const capped = deriveStats(gs({ raceId: 'mara', lv: 1, hp: 9999, mp: 9999 }))
    expect(capped.hp).toBe(capped.maxHp)
    expect(capped.mp).toBe(capped.maxMp)

    const filled = deriveStats(gs({ raceId: 'mara', lv: 1, hp: 0, mp: 0 }))
    expect(filled.hp).toBe(filled.maxHp)
    expect(filled.mp).toBe(filled.maxMp)
  })
})

describe('deriveCombatStats — accuracy / dodge / crit / mAtk / mDef', () => {
  it('acc = 85 + Lv + floor(DEX * 1.5) — high baseline so low-Lv players rarely miss', () => {
    // Lv 1, DEX 10: 85 + 1 + 15 = 101
    expect(deriveCombatStats(gs({ lv: 1, dex: 10 })).acc).toBe(101)
    // Lv 5, DEX 50: 85 + 5 + 75 = 165
    expect(deriveCombatStats(gs({ lv: 5, dex: 50 })).acc).toBe(165)
  })

  it('dodge = floor(Lv*0.5 + AGI*0.4) — slow scaling so monsters rarely miss too', () => {
    // Lv 1, AGI 10: floor(0.5 + 4) = 4
    expect(deriveCombatStats(gs({ lv: 1, agi: 10 })).dodge).toBe(4)
    // Lv 10, AGI 50: floor(5 + 20) = 25
    expect(deriveCombatStats(gs({ lv: 10, agi: 50 })).dodge).toBe(25)
  })

  it('crit = min(50, floor(LUK * 0.3))', () => {
    expect(deriveCombatStats(gs({ luk: 10 })).crit).toBe(3)
    expect(deriveCombatStats(gs({ luk: 100 })).crit).toBe(30)
    expect(deriveCombatStats(gs({ luk: 200 })).crit).toBe(50) // capped
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
