import { describe, it, expect } from 'vitest'
import { resolveEnhance } from './enhance'

function seq(...values: number[]) {
  let i = 0
  return () => values[i++]
}

describe('resolveEnhance', () => {
  it('succeeds at +0: cost 1, 95% chance, raises the plus by one', () => {
    // cost = 1 + floor(0/2) = 1 ; success% = max(5, 95-0) = 95
    // roll = 0 * 100 = 0 < 95 → ok
    expect(resolveEnhance(0, 10, seq(0))).toEqual({
      outcome: 'ok',
      cost: 1,
      newPlus: 1,
      stonesConsumed: 1,
    })
  })

  it('reports no-stone without consuming anything when stones < cost', () => {
    // cur 4 → cost = 1 + floor(4/2) = 3 ; only 2 stones
    expect(resolveEnhance(4, 2, seq(0))).toEqual({
      outcome: 'no-stone',
      cost: 3,
      newPlus: 4,
      stonesConsumed: 0,
    })
  })

  it('on failure below +5, keeps the plus level but still consumes stones', () => {
    // cur 2 → cost 2, success% = max(5, 95-18) = 77 ; roll 0.99*100 = 99 ≥ 77
    expect(resolveEnhance(2, 9, seq(0.99))).toEqual({
      outcome: 'fail',
      cost: 2,
      newPlus: 2,
      stonesConsumed: 2,
    })
  })

  it('on failure at +5 or above, drops the plus level by one', () => {
    // cur 6 → cost 4, success% = max(5, 95-54) = 41 ; roll 99 ≥ 41 → fail, downgrade
    expect(resolveEnhance(6, 9, seq(0.99))).toEqual({
      outcome: 'fail',
      cost: 4,
      newPlus: 5,
      stonesConsumed: 4,
    })
  })

  it('floors the success chance at 5% for very high plus levels', () => {
    // cur 11 → success% = max(5, 95-99) = 5 ; roll 0.04*100 = 4 < 5 → ok
    expect(resolveEnhance(11, 99, seq(0.04))).toEqual({
      outcome: 'ok',
      cost: 6,
      newPlus: 12,
      stonesConsumed: 6,
    })
  })
})
