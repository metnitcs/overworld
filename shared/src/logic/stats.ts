// Slice 25: deriveStats now depends ONLY on primary stats + lv + equipment.
// Race/class no longer contribute legacy offsets — race's effect lives in
// the primary stats themselves (folded in at creation/transcend by
// applyRaceModifiers in allocate.ts), and class is a recommendation only.
//
// Slice 35: items are admin-editable in DB (Slice 8 + 28), so the static
// `ITEMS` from data.ts is just the seed — runtime should use the live
// content cache. deriveStats / deriveCombatStats now accept an optional
// `items` map to override the seed. Client passes `content.items`; server
// + tests can still call without it and fall back to the seed.
import type { GameState, DerivedStats, ItemDef } from '../types.js'
import { ITEMS, BASE_HP, BASE_MP } from '../data.js'

export interface DeriveOptions {
  /** Live item lookup. Pass `content.items` from the store to pick up
   *  admin edits / brand-new items added via the admin panel. When
   *  omitted, falls back to the static seed in `shared/src/data.ts`. */
  items?: Record<string, ItemDef>
}

/** Pure derivation from primary stats + lv. Exposed for callers that need
 *  the raw numbers without mutating a full GameState (e.g. preview in the
 *  Status modal, server validation). */
export function deriveCombatStats(g: GameState, opts: DeriveOptions = {}): DerivedStats {
  const items = opts.items ?? ITEMS
  const lvb = g.lv - 1

  // Primary-derived. Formula from the design proposal (Slice 23 docs)
  // updated in Slice 25 to drop the legacy race/class offsets.
  const maxHp = BASE_HP + g.vit * 10 + lvb * 5
  const maxMp = BASE_MP + g.int * 3  + lvb * 2
  let pAtk = g.str * 2 + Math.floor(lvb * 1.5)
  let mAtk = g.int * 2 + Math.floor(lvb * 1.0)
  let pDef = Math.floor(g.vit * 0.5) + Math.floor(lvb * 1.0)
  let mDef = Math.floor(g.int * 0.5)
  const spd  = Math.floor(g.agi * 0.5) + Math.floor(lvb * 0.4)
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
  // Slice 24 fix: weapons can carry a `matk` field (staves) — both atk
  // and matk fold in, and enhance adds +3 per plus to the matching stat
  // (matk plus bonus only when the weapon actually has matk).
  if (g.equipWeapon) {
    const it = items[g.equipWeapon]
    const plus = g.plus[g.equipWeapon + '_w'] || 0
    pAtk += (it?.atk  || 0) + plus * 3
    mAtk += (it?.matk || 0) + (it?.matk ? plus * 3 : 0)
  }
  if (g.equipArmor) {
    const it = items[g.equipArmor]
    const plus = g.plus[g.equipArmor + '_a'] || 0
    pDef += (it?.def  || 0) + plus * 2
    mDef += (it?.matk || 0)
  }

  return { maxHp, maxMp, pAtk, mAtk, pDef, mDef, spd, acc, dodge, crit }
}

/** Re-derive HP/MP/ATK/DEF/SPD from primary stats + equipment. Pure: depends
 *  only on the input state and game data constants. Current hp/mp are
 *  re-clamped to the (possibly changed) maxima; a falsy current value means
 *  "fill to max" (used right after character creation or after a stat reset). */
export function deriveStats(g: GameState, opts: DeriveOptions = {}): GameState {
  const d = deriveCombatStats(g, opts)
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
