// Slice 23: deriveStats rewritten on top of the 6 primary stats
// (str/int/dex/agi/luk/vit). Race + class still contribute *base* offsets
// (legacy `r.atk` / `c.atk` columns) which get folded into the derived
// numbers — this preserves existing balance while the new system rolls in.
// The race/class redesign (next slice) will replace those legacy offsets
// with explicit per-stat modifiers.
import type { GameState, DerivedStats } from '../types.js'
import {
  RACES, CLASSES, ITEMS,
  BASE_HP, BASE_MP,
} from '../data.js'

/** Pure derivation from primary stats + lv. Exposed for callers that need
 *  the raw numbers without mutating a full GameState (e.g. preview in the
 *  Status modal, server validation). */
export function deriveCombatStats(g: GameState): DerivedStats {
  const r = RACES.find((x) => x.id === g.raceId)!
  const c = CLASSES.find((x) => x.id === g.classId)!
  const lvb = g.lv - 1

  // Legacy race/class offsets — these flatten into the derived numbers so
  // the existing balance survives until the race/class redesign slice.
  const raceAtkBase = r.atk
  const raceDefBase = r.def
  const raceSpdBase = r.spd
  const raceHpBase  = r.hp
  const raceMpBase  = r.mp
  const classAtk    = c.atk
  const classDef    = c.def
  const classSpd    = c.spd
  const classMp     = c.mp

  // Primary-derived. Formula from the design proposal (Slice 23 docs).
  const maxHp = BASE_HP + raceHpBase + g.vit * 10 + lvb * 5
  const maxMp = BASE_MP + raceMpBase + classMp + g.int * 3 + lvb * 2
  let pAtk = raceAtkBase + classAtk + g.str * 2 + Math.floor(lvb * 1.5)
  let mAtk = g.int * 2 + Math.floor(lvb * 1.0)
  let pDef = raceDefBase + classDef + Math.floor(g.vit * 0.5) + Math.floor(lvb * 1.0)
  let mDef = Math.floor(g.int * 0.5)
  const spd  = raceSpdBase + classSpd + Math.floor(g.agi * 0.5) + Math.floor(lvb * 0.4)
  // Slice 23 rebalance: baseline acc much higher so low-Lv players hit
  // ~95% against normal monsters. Miss rate only really kicks in vs
  // high-AGI specialty enemies (and the formula still caps at 99% so even
  // a max-acc build has a sliver of RNG).
  //   acc   = 85 + Lv + floor(DEX × 1.5)
  //   dodge = floor(Lv × 0.5 + AGI × 0.4)
  const acc   = 85 + g.lv + Math.floor(g.dex * 1.5)
  const dodge = Math.floor(g.lv * 0.5 + g.agi * 0.4)
  const crit  = Math.min(50, Math.floor(g.luk * 0.3))

  // Equipment + enhance bonuses fold into the matching combat stats.
  // Slice 24 fix: weapons can carry a `matk` field (staves) — it was being
  // ignored, so casters got no mAtk benefit from their wand. Now both atk
  // and matk fold in. Enhance adds +3 per plus to pAtk (kept as-is for
  // backward compat with existing balance) and the same +3 to mAtk so
  // upgrading a wand actually matters.
  if (g.equipWeapon) {
    const it = ITEMS[g.equipWeapon]
    const plus = g.plus[g.equipWeapon + '_w'] || 0
    pAtk += (it?.atk  || 0) + plus * 3
    mAtk += (it?.matk || 0) + (it?.matk ? plus * 3 : 0)
  }
  if (g.equipArmor) {
    const it = ITEMS[g.equipArmor]
    const plus = g.plus[g.equipArmor + '_a'] || 0
    pDef += (it?.def  || 0) + plus * 2
    // Armor with a `matk` field gives mDef (rare — most armor doesn't),
    // following the same pattern. Currently no seed armor uses this.
    mDef += (it?.matk || 0)
  }

  return { maxHp, maxMp, pAtk, mAtk, pDef, mDef, spd, acc, dodge, crit }
}

/** Re-derive HP/MP/ATK/DEF/SPD from primary stats + race + class + equipment.
 *  Pure: depends only on the input state and game data constants. Current
 *  hp/mp are re-clamped to the (possibly changed) maxima; a falsy current
 *  value means "fill to max" (used right after character creation or after
 *  a stat reset). */
export function deriveStats(g: GameState): GameState {
  const d = deriveCombatStats(g)
  return {
    ...g,
    maxHp: d.maxHp,
    maxMp: d.maxMp,
    atk: d.pAtk,        // legacy cached column — = pAtk
    def: d.pDef,        // legacy cached column — = pDef
    spd: d.spd,
    hp: Math.min(g.hp || d.maxHp, d.maxHp),
    mp: Math.min(g.mp || d.maxMp, d.maxMp),
  }
}
