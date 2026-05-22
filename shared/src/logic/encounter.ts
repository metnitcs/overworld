// Encounter resolution — picks the queue of monsters the Player faces in a
// single in-game collision. Pure, RNG-injectable.
//
// Today the count is uniformly 1–5 (clamped to the map's spawn pool size).
// A future "lure" / "encounter-boost" item will multiply or shift that
// range; the cap stays computed from `monsterPool.length` so we never
// queue more enemies than the map has Monsters defined.
import type { MonsterDef, BattleEnemy } from '../types.js'
import { scaleEnemy } from './combat.js'

export interface EncounterInput {
  /** The Monster the Player physically stepped onto (always queue[0]). */
  primary: MonsterDef
  /** Other Monsters that may spawn on this Map — drawn for the tail of the
   *  queue. The primary may or may not be in this list; we never depend on
   *  that. */
  monsterPool: MonsterDef[]
  rng: () => number
  /** Optional override of the random size — used for tests. When omitted,
   *  size = floor(rng * 5) + 1, clamped to 1..pool+1. */
  forceSize?: number
}

/** Roll the full encounter queue. Always at least 1 (the primary). */
export function rollEncounter(opts: EncounterInput): BattleEnemy[] {
  const { primary, monsterPool, rng } = opts
  const rawSize = opts.forceSize ?? Math.floor(rng() * 5) + 1
  const maxSize = Math.max(1, monsterPool.length || 1) + (monsterPool.length === 0 ? 0 : 0)
  // We can always include the primary, plus up to monsterPool.length more.
  // If the pool is empty (shouldn't happen in practice — Maps must have
  // monsters to spawn encounters) we just fight the primary solo.
  const size = Math.min(Math.max(1, rawSize), 1 + monsterPool.length)

  const queue: BattleEnemy[] = [scaleEnemy(primary, rng)]
  for (let i = 1; i < size; i++) {
    const pick = monsterPool[Math.floor(rng() * monsterPool.length)]
    queue.push(scaleEnemy(pick, rng))
  }
  return queue
}
