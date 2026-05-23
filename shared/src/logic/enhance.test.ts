import { describe, it, expect } from 'vitest'
import { resolveEnhance, enhanceGoldCost } from './enhance'

function seq(...values: number[]) {
  let i = 0
  return () => values[i++]
}

describe('resolveEnhance', () => {
  it('succeeds at +0: stone cost 1, gold cost 100, 95% chance, raises the plus by one', () => {
    // cost = 1 + floor(0/2) = 1 ; gold = 100*(0+1) = 100 ; success% = 95 ; roll 0 < 95 → ok
    expect(resolveEnhance(0, 10, 1000, seq(0))).toEqual({
      outcome: 'ok',
      cost: 1, goldCost: 100,
      newPlus: 1,
      stonesConsumed: 1, goldConsumed: 100,
    })
  })

  it('reports no-stone without consuming anything when stones < cost', () => {
    // cur 4 → stone cost 3, only 2 stones → no-stone (gold irrelevant)
    expect(resolveEnhance(4, 2, 99999, seq(0))).toEqual({
      outcome: 'no-stone',
      cost: 3, goldCost: 500,
      newPlus: 4,
      stonesConsumed: 0, goldConsumed: 0,
    })
  })

  it('Slice 48: reports no-gold when stones are enough but gold < goldCost', () => {
    // cur 5 → stone cost 3 (have 10), gold cost 600, only 599 → no-gold
    expect(resolveEnhance(5, 10, 599, seq(0))).toEqual({
      outcome: 'no-gold',
      cost: 3, goldCost: 600,
      newPlus: 5,
      stonesConsumed: 0, goldConsumed: 0,
    })
  })

  it('on failure below +5, keeps the plus level but consumes both stones and gold', () => {
    // cur 2 → stone cost 2, gold cost 300, success% 77, roll 99 ≥ 77 → fail
    expect(resolveEnhance(2, 9, 1000, seq(0.99))).toEqual({
      outcome: 'fail',
      cost: 2, goldCost: 300,
      newPlus: 2,
      stonesConsumed: 2, goldConsumed: 300,
    })
  })

  it('on failure at +5 or above, drops the plus level by one', () => {
    // cur 6 → stone cost 4, gold cost 700, success% 41, roll 99 → fail + downgrade
    expect(resolveEnhance(6, 9, 1000, seq(0.99))).toEqual({
      outcome: 'fail',
      cost: 4, goldCost: 700,
      newPlus: 5,
      stonesConsumed: 4, goldConsumed: 700,
    })
  })

  it('floors the success chance at 5% for very high plus levels', () => {
    // cur 11 → success% 5, roll 4 < 5 → ok ; stone cost 6, gold 1200
    expect(resolveEnhance(11, 99, 99999, seq(0.04))).toEqual({
      outcome: 'ok',
      cost: 6, goldCost: 1200,
      newPlus: 12,
      stonesConsumed: 6, goldConsumed: 1200,
    })
  })

  it('enhanceGoldCost scales 100 * (cur + 1)', () => {
    expect(enhanceGoldCost(0)).toBe(100)
    expect(enhanceGoldCost(5)).toBe(600)
    expect(enhanceGoldCost(9)).toBe(1000)
  })
})
