import { describe, it, expect } from 'vitest'
import type { GameState } from '../types'
import {
  spendPoints, resetStats,
  applyRaceModifiers, shiftRaceModifierDiff,
} from './allocate'
import { STAT_BASE, STAT_HARD_CAP, STAT_POINTS_PER_LEVEL } from '../data'

function gs(overrides: Partial<GameState> = {}): GameState {
  return {
    name: 'T', raceId: 'human', classId: 'berserk',
    lv: 1, exp: 0,
    hp: 100, maxHp: 100, mp: 50, maxMp: 50,
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

describe('spendPoints', () => {
  it('moves the requested amount from unspentPoints into the chosen stat', () => {
    const r = spendPoints(gs({ unspentPoints: 5 }), 'str', 3)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.state.str).toBe(STAT_BASE + 3)
      expect(r.state.unspentPoints).toBe(2)
    }
  })

  it('rejects when unspentPoints is too low', () => {
    const r = spendPoints(gs({ unspentPoints: 2 }), 'str', 5)
    expect(r).toEqual({ ok: false, error: 'insufficient-points' })
  })

  it('rejects non-positive or non-integer amounts', () => {
    expect(spendPoints(gs({ unspentPoints: 5 }), 'str', 0)).toEqual({ ok: false, error: 'invalid-amount' })
    expect(spendPoints(gs({ unspentPoints: 5 }), 'str', -1)).toEqual({ ok: false, error: 'invalid-amount' })
    expect(spendPoints(gs({ unspentPoints: 5 }), 'str', 1.5)).toEqual({ ok: false, error: 'invalid-amount' })
  })

  it('rejects when allocation would exceed the hard cap', () => {
    const r = spendPoints(
      gs({ str: STAT_HARD_CAP - 1, unspentPoints: 100 }),
      'str',
      5,
    )
    expect(r).toEqual({ ok: false, error: 'exceeds-hard-cap' })
  })

  it('rejects unknown stat names', () => {
    const r = spendPoints(gs({ unspentPoints: 5 }), 'foo' as unknown as 'str', 1)
    expect(r).toEqual({ ok: false, error: 'unknown-stat' })
  })

  it('does not mutate the input state', () => {
    const before = gs({ unspentPoints: 5 })
    const snap = JSON.stringify(before)
    spendPoints(before, 'str', 3)
    expect(JSON.stringify(before)).toBe(snap)
  })
})

describe('resetStats', () => {
  it('refunds the entire (lv-1) × STAT_POINTS_PER_LEVEL pool, regardless of prior allocation', () => {
    // Lv 5: total pool = 4 × 5 = 20. Whatever was sunk into stats, post-reset
    // each stat is STAT_BASE and unspent is exactly 20.
    const r = resetStats(gs({
      lv: 5,
      str: 30, vit: 20, dex: 14, int: 12, agi: 12, luk: 12,
      unspentPoints: 0,
    }))
    expect(r.str).toBe(STAT_BASE)
    expect(r.vit).toBe(STAT_BASE)
    expect(r.dex).toBe(STAT_BASE)
    expect(r.unspentPoints).toBe(4 * STAT_POINTS_PER_LEVEL)
  })

  it('Lv 1 character ends with 0 unspent (nothing to refund)', () => {
    const r = resetStats(gs({ lv: 1 }))
    expect(r.unspentPoints).toBe(0)
  })

  it('is idempotent — second reset doesn\'t change anything', () => {
    const once = resetStats(gs({ lv: 10, str: 30, unspentPoints: 5 }))
    const twice = resetStats(once)
    expect(twice).toEqual(once)
  })
})

describe('applyRaceModifiers (Slice 25)', () => {
  it('adds positive modifiers on top of the current stats', () => {
    const r = applyRaceModifiers(gs(), { str: +3, vit: +2 })
    expect(r.str).toBe(STAT_BASE + 3)
    expect(r.vit).toBe(STAT_BASE + 2)
    expect(r.int).toBe(STAT_BASE)
  })

  it('subtracts negative modifiers but clamps to STAT_BASE', () => {
    // Fresh char with stats at STAT_BASE — negatives would go below 10
    // but clamp keeps them at 10 (race never pushes below floor).
    const r = applyRaceModifiers(gs(), { int: -3, luk: -5 })
    expect(r.int).toBe(STAT_BASE)
    expect(r.luk).toBe(STAT_BASE)
  })

  it('subtraction respects existing investment — only clamps when result < STAT_BASE', () => {
    // Player who already pumped INT to 20: -3 modifier → 17 (above floor)
    const r = applyRaceModifiers(gs({ int: 20 }), { int: -3 })
    expect(r.int).toBe(17)
  })

  it('missing keys are treated as 0 (no change)', () => {
    const r = applyRaceModifiers(gs(), {})
    expect(r.str).toBe(STAT_BASE)
    expect(r.int).toBe(STAT_BASE)
  })
})

describe('shiftRaceModifierDiff (Slice 25 — transcend)', () => {
  it('applies (new - old) modifier as a diff on current stats', () => {
    // human (modifiers: {}) → mara (str+3, vit+2, int-3, luk-2)
    // Player at str=15 (invested +5), defaults elsewhere
    const r = shiftRaceModifierDiff(
      gs({ str: 15 }),
      {},                                         // old: human
      { str: +3, vit: +2, int: -3, luk: -2 },     // new: mara
    )
    expect(r.str).toBe(15 + 3)
    expect(r.vit).toBe(STAT_BASE + 2)
    expect(r.int).toBe(STAT_BASE)   // 10 - 3 = 7 → clamped to 10
    expect(r.luk).toBe(STAT_BASE)   // 10 - 2 = 8 → clamped to 10
    expect(r.dex).toBe(STAT_BASE)
    expect(r.agi).toBe(STAT_BASE)
  })

  it('zero net diff (same race) is a no-op', () => {
    const r = shiftRaceModifierDiff(
      gs({ str: 25 }),
      { str: +3 },
      { str: +3 },
    )
    expect(r.str).toBe(25)
  })

  it('does not mutate the input state', () => {
    const before = gs({ str: 15 })
    const snap = JSON.stringify(before)
    shiftRaceModifierDiff(before, {}, { str: +5 })
    expect(JSON.stringify(before)).toBe(snap)
  })
})
