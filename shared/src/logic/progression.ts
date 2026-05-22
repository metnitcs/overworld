import { expForLv, STAT_POINTS_PER_LEVEL } from '../data.js'

export interface ExpResult {
  lv: number
  exp: number
  levelsGained: number
  /** Slice 23: stat points the caller should add to `unspentPoints` —
   *  STAT_POINTS_PER_LEVEL × levelsGained. Returned here so call sites don't
   *  duplicate the constant. */
  pointsGained: number
}

/** Apply gained exp to a level/exp pair, levelling up (and carrying the
 *  remainder) as many times as the exp allows. Pure. */
export function applyExp(lv: number, exp: number, amt: number): ExpResult {
  let newLv = lv
  let newExp = exp + amt
  let levelsGained = 0
  while (newExp >= expForLv(newLv)) {
    newExp -= expForLv(newLv)
    newLv += 1
    levelsGained += 1
  }
  return {
    lv: newLv,
    exp: newExp,
    levelsGained,
    pointsGained: levelsGained * STAT_POINTS_PER_LEVEL,
  }
}
