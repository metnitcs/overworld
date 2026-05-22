// Slice 23: combat rewritten on top of primary-stat derived numbers.
// New formula:
//   1. Hit roll  → rng < (attacker.acc - target.dodge) / 100   else MISS (dmg = 0)
//   2. Crit roll → rng < attacker.crit / 100
//   3. Variance → 0.85 + rng × 0.30  (85–115%)
//   4. Raw      → atk × variance × skillMult × (crit ? 1.5 : 1)
//   5. Damage   → max(1, raw - target.def)
//
// Hit roll caller passes the FULL derived acc/dodge/crit so combat stays a
// pure number transform — no race / class lookup here.
import type { MonsterDef, BattleEnemy } from '../types.js'

/** Source of randomness, injected so logic stays pure and testable.
 *  Returns a float in [0, 1) — same contract as Math.random. */
export type Rng = () => number

export interface Combatant {
  /** Physical attack power (= deriveCombatStats().pAtk for players, atk for monsters). */
  atk: number
  /** Physical defence (= pDef / def). */
  def: number
  /** Hit roll target before subtracting target.dodge. Players get 75 + DEX
   *  from deriveCombatStats; monsters default to 90 unless overridden. */
  acc: number
  /** Dodge rating subtracted from incoming acc. Players: floor(AGI × 0.8);
   *  monsters default to 5 unless overridden. */
  dodge: number
  /** Crit percentage (0–100). */
  crit: number
}

export interface AttackOptions {
  /** Skill / multiplier applied on top of the base hit (default 1). */
  mult?: number
  /** Forced critical bonus multiplier (default 1.5). */
  critMult?: number
  rng: Rng
}

export interface AttackResult {
  /** 0 means MISS. UI should show "MISS!" instead of damage. */
  dmg: number
  hit: boolean
  crit: boolean
}

/** Resolve a single physical hit through the new pipeline. Stays pure — the
 *  rng decides hit / crit / variance in that exact order so test seeds are
 *  reproducible. */
export function resolveAttack(
  attacker: Combatant,
  target: Combatant,
  opts: AttackOptions,
): AttackResult {
  const mult = opts.mult ?? 1
  const critMult = opts.critMult ?? 1.5

  // 1) Hit / miss
  const hitChance = Math.max(5, Math.min(99, attacker.acc - target.dodge))
  const hit = opts.rng() * 100 < hitChance
  if (!hit) return { dmg: 0, hit: false, crit: false }

  // 2) Crit
  const crit = opts.rng() * 100 < attacker.crit

  // 3) Variance
  const variance = 0.85 + opts.rng() * 0.30

  // 4 + 5) Damage
  const raw = attacker.atk * variance * mult * (crit ? critMult : 1)
  const dmg = Math.max(1, Math.floor(raw - target.def))
  return { dmg, hit: true, crit }
}

/** Spawn a battle enemy from a monster definition, applying a random
 *  level boost of 0–2 that scales hp/atk/def/exp/gold (spd unchanged).
 *  Slice 23: also seeds default acc/dodge/crit so resolveAttack works
 *  symmetrically for enemy turns. */
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
    // Slice 23 baseline combat numbers — symmetric with the player formula
    // so equal-Lv encounters trend toward ~95% hit. High-AGI mobs (high spd)
    // get a noticeable dodge bump from the *0.3 scaling.
    //   acc   = 85 + Lv (matches player baseline at DEX 10)
    //   dodge = floor(spd × 0.3)
    //   crit  = 3 + floor(Lv × 0.2)
    acc: 85 + def.lv + lvBoost,
    dodge: Math.floor(def.spd * 0.3),
    crit: 3 + Math.floor(def.lv * 0.2),
    mAtk: Math.floor(def.atk * 0.8),
    mDef: Math.floor(def.def * 0.5),
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
