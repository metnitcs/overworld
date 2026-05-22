// Slice 23: stat-point allocation. Pure — no IO, no derivation. Caller
// re-runs deriveStats() after this if HP/MP needed to refresh.
//
// Operations:
//   spendPoints           — incrementally bump one stat by `amount`
//                           (server-validated via the same code path so
//                           cheating is impossible).
//   resetStats            — reset all 6 primary stats to STAT_BASE and
//                           refund every spent point as unspentPoints.
//   applyRaceModifiers    — Slice 25: add a race's flat per-stat modifier
//                           to a fresh STAT_BASE pool (used at character
//                           creation).
//   shiftRaceModifierDiff — Slice 25: apply (newRace - oldRace) modifiers
//                           on transcend, clamping to STAT_BASE so players
//                           never drop below the floor.
import type { GameState, PrimaryStat, StatModifier } from '../types.js'
import { STAT_BASE, STAT_HARD_CAP, STAT_POINTS_PER_LEVEL } from '../data.js'

const STAT_KEYS: readonly PrimaryStat[] = ['str', 'int', 'dex', 'agi', 'luk', 'vit']

export type AllocateResult =
  | { ok: true; state: GameState }
  | { ok: false; error:
      | 'insufficient-points'
      | 'invalid-amount'
      | 'exceeds-hard-cap'
      | 'unknown-stat' }

const ALLOWED_STATS: ReadonlySet<PrimaryStat> = new Set<PrimaryStat>([
  'str', 'int', 'dex', 'agi', 'luk', 'vit',
])

/** Try to spend `amount` unspentPoints on `stat`. Validates:
 *   1. amount ≥ 1 (no zero/negative spends — rest is a separate op)
 *   2. enough unspentPoints
 *   3. resulting stat ≤ STAT_HARD_CAP
 *   4. stat name is a known primary stat (guards against API typos)
 *
 *  Returns a tagged result so the server can map errors to 400-class
 *  responses without exceptions. */
export function spendPoints(
  state: GameState,
  stat: PrimaryStat,
  amount: number,
): AllocateResult {
  if (!ALLOWED_STATS.has(stat)) return { ok: false, error: 'unknown-stat' }
  if (!Number.isInteger(amount) || amount < 1) return { ok: false, error: 'invalid-amount' }
  if (amount > state.unspentPoints) return { ok: false, error: 'insufficient-points' }
  const current = state[stat] as number
  const next = current + amount
  if (next > STAT_HARD_CAP) return { ok: false, error: 'exceeds-hard-cap' }
  return {
    ok: true,
    state: {
      ...state,
      [stat]: next,
      unspentPoints: state.unspentPoints - amount,
    },
  }
}

/** Reset all six primary stats to STAT_BASE and refund every spent point
 *  into unspentPoints. The refund formula assumes the player has only ever
 *  spent points granted by levelling (STAT_POINTS_PER_LEVEL × (lv-1) total),
 *  so the post-reset pool equals exactly that amount — regardless of how
 *  many points were sunk into each stat.
 *
 *  This makes the operation idempotent (resetting an already-reset character
 *  is a no-op) and admin-safe (a manually edited stat doesn't get extra
 *  refunded points). */
export function resetStats(state: GameState): GameState {
  return {
    ...state,
    str: STAT_BASE,
    int: STAT_BASE,
    dex: STAT_BASE,
    agi: STAT_BASE,
    luk: STAT_BASE,
    vit: STAT_BASE,
    unspentPoints: Math.max(0, (state.lv - 1) * STAT_POINTS_PER_LEVEL),
  }
}

/** Slice 25 — apply a race's flat per-stat modifiers on top of the
 *  STAT_BASE pool. Used by the server at character creation so a มาร
 *  doesn't start with the same numbers as a มนุษย์. Negative modifiers
 *  are clamped to STAT_BASE (a fresh character never sinks below the floor).
 *  Pure. */
export function applyRaceModifiers(state: GameState, mod: StatModifier): GameState {
  const next = { ...state }
  for (const k of STAT_KEYS) {
    const delta = mod[k] ?? 0
    if (delta === 0) continue
    next[k] = Math.max(STAT_BASE, (state[k] as number) + delta)
  }
  return next
}

/** Slice 25 — on transcend, apply the *diff* between the new race and the
 *  old race's modifiers to the player's current primary stats. Preserves
 *  their hard-earned allocations while shifting the racial baseline.
 *  Clamps each stat at STAT_BASE (10) so a player can't sink below the
 *  floor even after a strongly negative net diff. Pure. */
export function shiftRaceModifierDiff(
  state: GameState,
  oldMod: StatModifier,
  newMod: StatModifier,
): GameState {
  const next = { ...state }
  for (const k of STAT_KEYS) {
    const delta = (newMod[k] ?? 0) - (oldMod[k] ?? 0)
    if (delta === 0) continue
    next[k] = Math.max(STAT_BASE, (state[k] as number) + delta)
  }
  return next
}
