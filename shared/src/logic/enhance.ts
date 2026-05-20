import type { Rng } from './combat.js'

export type EnhanceOutcome = 'no-stone' | 'ok' | 'fail'

export interface EnhanceResult {
  outcome: EnhanceOutcome
  /** plus-stones the attempt requires */
  cost: number
  /** plus level after the attempt */
  newPlus: number
  /** plus-stones actually spent (0 only when there weren't enough) */
  stonesConsumed: number
}

/** Resolve one enhance attempt on an item at plus level `cur`, given the
 *  number of plus-stones available. Pure.
 *
 *  - cost      = 1 + floor(cur / 2)
 *  - success%  = max(5, 95 - cur*9)
 *  - on success: +1
 *  - on failure: -1 if already +5 or higher, otherwise unchanged
 *  Stones are consumed on both success and failure, never on 'no-stone'. */
export function resolveEnhance(cur: number, stones: number, rng: Rng): EnhanceResult {
  const cost = 1 + Math.floor(cur / 2)
  if (stones < cost) {
    return { outcome: 'no-stone', cost, newPlus: cur, stonesConsumed: 0 }
  }
  const success = Math.max(5, 95 - cur * 9)
  const roll = rng() * 100
  if (roll < success) {
    return { outcome: 'ok', cost, newPlus: cur + 1, stonesConsumed: cost }
  }
  const newPlus = cur >= 5 ? cur - 1 : cur
  return { outcome: 'fail', cost, newPlus, stonesConsumed: cost }
}
