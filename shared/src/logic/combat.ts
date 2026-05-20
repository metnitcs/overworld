import type { MonsterDef, BattleEnemy } from '../types.js'

/** Source of randomness, injected so logic stays pure and testable.
 *  Returns a float in [0, 1) — same contract as Math.random. */
export type Rng = () => number

export interface AttackOptions {
  /** skill / multiplier applied on top of the base hit (default 1) */
  mult?: number
  rng: Rng
}

export interface AttackResult {
  dmg: number
  crit: boolean
}

/** Resolve a single physical hit. Mirrors the legacy formula:
 *  base = max(1, atk - def/2), ±15% variance, 10% crit ×1.7, floored, min 1. */
export function resolveAttack(atk: number, def: number, opts: AttackOptions): AttackResult {
  const mult = opts.mult ?? 1
  const base = Math.max(1, atk - def / 2)
  const varied = base * (0.85 + opts.rng() * 0.3) * mult
  const crit = opts.rng() < 0.1
  return { dmg: Math.max(1, Math.floor(varied * (crit ? 1.7 : 1))), crit }
}

/** Spawn a battle enemy from a monster definition, applying a random
 *  level boost of 0–2 that scales hp/atk/def/exp/gold (spd unchanged). */
export function scaleEnemy(def: MonsterDef, rng: Rng): BattleEnemy {
  const lvBoost = Math.floor(rng() * 3)
  const maxHp = def.hp + lvBoost * 8
  return {
    name: def.name,
    emoji: def.emoji,
    lv: def.lv + lvBoost,
    maxHp,
    hp: maxHp,
    atk: def.atk + lvBoost * 2,
    def: def.def + lvBoost,
    spd: def.spd,
    exp: def.exp + lvBoost * 4,
    gold: def.gold + lvBoost * 3,
    drop: def.drop,
  }
}

/** Roll post-victory loot: the monster's own drop (if any, gated by its
 *  chance) followed by an independent 10% chance for a plus-stone. Returns
 *  the item keys won, in order. The drop roll is only consulted when the
 *  enemy actually has a drop. */
export function rollLoot(enemy: BattleEnemy, rng: Rng): string[] {
  const loot: string[] = []
  if (enemy.drop && rng() < enemy.drop.chance) loot.push(enemy.drop.item)
  if (rng() < 0.1) loot.push('plus-stone')
  return loot
}
