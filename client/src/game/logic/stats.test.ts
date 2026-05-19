import { describe, it, expect } from 'vitest'
import type { GameState } from '../types'
import { deriveStats } from './stats'

/** Minimal GameState for stat tests; callers override the relevant fields. */
function gs(overrides: Partial<GameState> = {}): GameState {
  return {
    name: 'T', raceId: 'mara', classId: 'berserk',
    lv: 1, exp: 0,
    hp: 9999, maxHp: 0, mp: 9999, maxMp: 0,
    atk: 0, def: 0, spd: 0, gold: 0,
    inventory: {}, equipWeapon: null, equipArmor: null, plus: {},
    map: 'village', px: 0, py: 0, steps: 0,
    ...overrides,
  }
}

describe('deriveStats', () => {
  it('combines race and class base stats at level 1 with no equipment', () => {
    // mara: hp110 mp80 atk12 def8 spd10 ; berserk: atk6 def2 spd1 mp0
    const g = deriveStats(gs({ raceId: 'mara', classId: 'berserk', lv: 1 }))

    expect(g.maxHp).toBe(110)
    expect(g.maxMp).toBe(80)
    expect(g.atk).toBe(18)
    expect(g.def).toBe(10)
    expect(g.spd).toBe(11)
  })

  it('scales stats by level (lvb = lv - 1) with floored growth', () => {
    // Lv 11 → lvb 10 ; maxHp 110+120, maxMp 80+60, atk 18+floor(15),
    // def 10+floor(10), spd 11+floor(4)
    const g = deriveStats(gs({ raceId: 'mara', classId: 'berserk', lv: 11 }))

    expect(g.maxHp).toBe(230)
    expect(g.maxMp).toBe(140)
    expect(g.atk).toBe(33)
    expect(g.def).toBe(20)
    expect(g.spd).toBe(15)
  })

  it('adds weapon/armor base plus enhance bonus (+3 atk per weapon plus, +2 def per armor plus)', () => {
    // base atk18 def10 ; sword-1 atk8 +2 → +8+6=14 ; armor-1 def5 +3 → +5+6=11
    const g = deriveStats(gs({
      lv: 1,
      equipWeapon: 'sword-1', equipArmor: 'armor-1',
      plus: { 'sword-1_w': 2, 'armor-1_a': 3 },
    }))

    expect(g.atk).toBe(32)
    expect(g.def).toBe(21)
  })

  it('clamps current hp/mp to the new maxima, and treats a falsy current as full', () => {
    const capped = deriveStats(gs({ raceId: 'mara', lv: 1, hp: 9999, mp: 9999 }))
    expect(capped.hp).toBe(110) // clamped down to maxHp
    expect(capped.mp).toBe(80)

    const filled = deriveStats(gs({ raceId: 'mara', lv: 1, hp: 0, mp: 0 }))
    expect(filled.hp).toBe(110) // 0 → fill to max
    expect(filled.mp).toBe(80)
  })
})
