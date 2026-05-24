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
//
// Slice 51: two related changes wired here together —
//   1. Per-item primary stat bonuses (bonusStr/Int/Dex/Agi/Luk/Vit) fold
//      into the character's effective primary stats BEFORE the derived
//      formulas run, so every downstream stat (maxHp, mAtk, dodge, …)
//      reacts to gear. They are flat — NOT scaled by Plus.
//   2. Plus on equipped weapon/armor now scales atk/def with a step
//      curve (enhancePlusAtkBonus / enhancePlusDefBonus) instead of the
//      old `plus * 3` / `plus * 2` flat lines — high+ feels jackpot,
//      low+ is gentler. Scope: only atk (weapon) + def (armor). The
//      matk-on-staves plus bonus also follows the new atk curve so
//      mage builds feel the same "+6 cliff" as melee.
import type { GameState, DerivedStats, ItemDef } from '../types.js'
import { ITEMS, BASE_HP, BASE_MP } from '../data.js'

export interface DeriveOptions {
  /** Live item lookup. Pass `content.items` from the store to pick up
   *  admin edits / brand-new items added via the admin panel. When
   *  omitted, falls back to the static seed in `shared/src/data.ts`. */
  items?: Record<string, ItemDef>
}

/** Slice 51: step-scale bonus the weapon's Plus contributes to ATK.
 *  Replaces the Slice 23 `plus * 3` flat line. Curve:
 *    +1..+5  = +2 each  →  cumulative 2,4,6,8,10
 *    +6..+10 = +5 each  →  cumulative 15,20,25,30,35
 *  Pure helper exposed so the UI tooltip + tests use the same source. */
export function enhancePlusAtkBonus(plus: number): number {
  if (plus <= 0) return 0
  const lowTier = Math.min(plus, 5) * 2
  const highTier = Math.max(0, plus - 5) * 5
  return lowTier + highTier
}

/** Slice 51: step-scale bonus the armor's Plus contributes to DEF.
 *  Replaces the Slice 23 `plus * 2` flat line. Curve:
 *    +1..+5  = +1 each  →  cumulative 1,2,3,4,5
 *    +6..+10 = +3 each  →  cumulative 8,11,14,17,20
 *  Top total (+10 = 20) matches the old `plus * 2` flat ceiling so
 *  established progression curves don't shift; only the shape changes. */
export function enhancePlusDefBonus(plus: number): number {
  if (plus <= 0) return 0
  const lowTier = Math.min(plus, 5)
  const highTier = Math.max(0, plus - 5) * 3
  return lowTier + highTier
}

/** Pure derivation from primary stats + lv. Exposed for callers that need
 *  the raw numbers without mutating a full GameState (e.g. preview in the
 *  Status modal, server validation). */
export function deriveCombatStats(g: GameState, opts: DeriveOptions = {}): DerivedStats {
  const items = opts.items ?? ITEMS
  const lvb = g.lv - 1

  // Slice 51: fold equipped item primary stat bonuses into effective
  // stats BEFORE deriving. Mat/consume rows never appear in equip slots
  // (the equip endpoint guards ItemType), so we only need to read the
  // two equipped rows.
  let effStr = g.str, effInt = g.int, effDex = g.dex
  let effAgi = g.agi, effLuk = g.luk, effVit = g.vit
  for (const id of [g.equipWeapon, g.equipArmor]) {
    if (!id) continue
    const row = g.inventory.find((r) => r.id === id)
    if (!row) continue
    const it = items[row.itemKey]
    if (!it) continue
    effStr += it.bonusStr ?? 0
    effInt += it.bonusInt ?? 0
    effDex += it.bonusDex ?? 0
    effAgi += it.bonusAgi ?? 0
    effLuk += it.bonusLuk ?? 0
    effVit += it.bonusVit ?? 0
  }

  // Primary-derived (now using effective stats — Slice 51).
  const maxHp = BASE_HP + effVit * 10 + lvb * 5
  const maxMp = BASE_MP + effInt * 3  + lvb * 2
  let pAtk = effStr * 2 + Math.floor(lvb * 1.5)
  let mAtk = effInt * 2 + Math.floor(lvb * 1.0)
  let pDef = Math.floor(effVit * 0.5) + Math.floor(lvb * 1.0)
  let mDef = Math.floor(effInt * 0.5)
  const spd  = Math.floor(effAgi * 0.5) + Math.floor(lvb * 0.4)
  const acc   = 85 + g.lv + Math.floor(effDex * 1.5)
  const dodge = Math.floor(g.lv * 0.5 + effAgi * 0.4)
  const crit  = Math.min(50, Math.floor(effLuk * 0.3))

  // Equipment base + Plus step bonus (Slice 51 step scaling).
  if (g.equipWeapon) {
    const row = g.inventory.find(i => i.id === g.equipWeapon)
    if (row) {
      const it = items[row.itemKey]
      const plusBonus = enhancePlusAtkBonus(row.plus)
      pAtk += (it?.atk  || 0) + plusBonus
      mAtk += (it?.matk || 0) + (it?.matk ? plusBonus : 0)
    }
  }
  if (g.equipArmor) {
    const row = g.inventory.find(i => i.id === g.equipArmor)
    if (row) {
      const it = items[row.itemKey]
      pDef += (it?.def  || 0) + enhancePlusDefBonus(row.plus)
      mDef += (it?.matk || 0)
    }
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
