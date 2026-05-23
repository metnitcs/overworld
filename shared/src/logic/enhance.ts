import type { Rng } from './combat.js'

/** Slice 48: 'no-gold' added — Blacksmith ceremony charges a gold fee on
 *  top of the plus-stones, and an attempt with enough stones but not
 *  enough gold returns this outcome (no mutation). */
export type EnhanceOutcome = 'no-stone' | 'no-gold' | 'ok' | 'fail'

export interface EnhanceResult {
  outcome: EnhanceOutcome
  /** plus-stones the attempt requires */
  cost: number
  /** Slice 48: gold the Blacksmith charges for the attempt. */
  goldCost: number
  /** plus level after the attempt */
  newPlus: number
  /** plus-stones actually spent (0 only when there weren't enough) */
  stonesConsumed: number
  /** Slice 48: gold actually spent (0 only on no-stone / no-gold). */
  goldConsumed: number
}

/** Compute the Blacksmith gold fee for an attempt at plus level `cur`.
 *  Flat scaling — `100 * (cur + 1)` — so +0 costs 100 and +9 costs 1000.
 *  Pure so server + UI agree without round-tripping. */
export function enhanceGoldCost(cur: number): number {
  return 100 * (cur + 1)
}

/** Resolve one enhance attempt on an item at plus level `cur`, given the
 *  number of plus-stones and gold available. Pure.
 *
 *  - stone cost = 1 + floor(cur / 2)
 *  - gold  cost = enhanceGoldCost(cur)
 *  - success%   = max(5, 95 - cur*9)
 *  - on success: +1
 *  - on failure: -1 if already +5 or higher, otherwise unchanged
 *  Both resources are consumed on success and failure, never on
 *  'no-stone' / 'no-gold'. */
export function resolveEnhance(cur: number, stones: number, gold: number, rng: Rng): EnhanceResult {
  const cost = 1 + Math.floor(cur / 2)
  const goldCost = enhanceGoldCost(cur)
  if (stones < cost) {
    return { outcome: 'no-stone', cost, goldCost, newPlus: cur, stonesConsumed: 0, goldConsumed: 0 }
  }
  if (gold < goldCost) {
    return { outcome: 'no-gold', cost, goldCost, newPlus: cur, stonesConsumed: 0, goldConsumed: 0 }
  }
  const success = Math.max(5, 95 - cur * 9)
  const roll = rng() * 100
  if (roll < success) {
    return { outcome: 'ok', cost, goldCost, newPlus: cur + 1, stonesConsumed: cost, goldConsumed: goldCost }
  }
  const newPlus = cur >= 5 ? cur - 1 : cur
  return { outcome: 'fail', cost, goldCost, newPlus, stonesConsumed: cost, goldConsumed: goldCost }
}
