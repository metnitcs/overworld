import type { GameState } from '../types.js'
import { RACES, CLASSES, ITEMS } from '../data.js'

/** Derive HP/MP/ATK/DEF/SPD from race + class + level + equipment + enhance
 *  level. Pure: depends only on the input state and game data constants.
 *  Current hp/mp are re-clamped to the (possibly changed) maxima; a falsy
 *  current value means "fill to max" (used right after character creation). */
export function deriveStats(g: GameState): GameState {
  const r = RACES.find(x => x.id === g.raceId)!
  const c = CLASSES.find(x => x.id === g.classId)!
  const lvb = g.lv - 1
  const maxHp = r.hp + lvb * 12
  const maxMp = r.mp + lvb * 6 + c.mp
  let atk = r.atk + c.atk + Math.floor(lvb * 1.5)
  let def = r.def + c.def + Math.floor(lvb * 1.0)
  const spd = r.spd + c.spd + Math.floor(lvb * 0.4)
  if (g.equipWeapon) {
    const it = ITEMS[g.equipWeapon]
    const plus = g.plus[g.equipWeapon + '_w'] || 0
    atk += (it?.atk || 0) + plus * 3
  }
  if (g.equipArmor) {
    const it = ITEMS[g.equipArmor]
    const plus = g.plus[g.equipArmor + '_a'] || 0
    def += (it?.def || 0) + plus * 2
  }
  return {
    ...g,
    maxHp, maxMp, atk, def, spd,
    hp: Math.min(g.hp || maxHp, maxHp),
    mp: Math.min(g.mp || maxMp, maxMp),
  }
}
