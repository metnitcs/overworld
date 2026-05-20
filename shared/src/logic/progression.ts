import { expForLv } from '../data.js'

export interface ExpResult {
  lv: number
  exp: number
  levelsGained: number
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
  return { lv: newLv, exp: newExp, levelsGained }
}
