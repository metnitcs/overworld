import { describe, it, expect } from 'vitest'
import type { MonsterDef } from '../types'
import type { BattleEnemy } from '../types'
import { resolveAttack, scaleEnemy, rollLoot } from './combat'

/** RNG stub: returns the queued values in order, one per call. */
function seq(...values: number[]) {
  let i = 0
  return () => values[i++]
}

describe('resolveAttack', () => {
  it('applies base = atk - def/2 with variance and no crit when the crit roll misses', () => {
    // variance roll 0.5 → factor 0.85 + 0.5*0.3 = 1.0 ; crit roll 0.5 → 0.5 < 0.1 is false
    const result = resolveAttack(20, 10, { rng: seq(0.5, 0.5) })

    // base = max(1, 20 - 10/2) = 15 ; 15 * 1.0 = 15
    expect(result).toEqual({ dmg: 15, crit: false })
  })

  it('multiplies damage by 1.7 and reports crit when the crit roll hits', () => {
    // variance roll 0.5 → factor 1.0 ; crit roll 0.05 → 0.05 < 0.1 is true
    const result = resolveAttack(20, 10, { rng: seq(0.5, 0.05) })

    // 15 * 1.0 * 1.7 = 25.5 → floor 25
    expect(result).toEqual({ dmg: 25, crit: true })
  })

  it('never deals less than 1 damage even when defense dwarfs attack', () => {
    // base clamps to 1; variance roll 0 → 0.85 → floor 0 → clamped to 1
    const result = resolveAttack(2, 100, { rng: seq(0, 0.5) })

    expect(result).toEqual({ dmg: 1, crit: false })
  })

  it('scales damage by the skill multiplier', () => {
    // base 15, factor 1.0, mult 2 → 30 ; no crit
    const result = resolveAttack(20, 10, { mult: 2, rng: seq(0.5, 0.5) })

    expect(result).toEqual({ dmg: 30, crit: false })
  })
})

const wolf: MonsterDef = {
  name: 'หมาป่าเงา', emoji: '🐺', lv: 5,
  hp: 100, atk: 10, def: 4, spd: 6, exp: 20, gold: 12,
  drop: { item: 'fang', chance: 0.5 },
}

describe('scaleEnemy', () => {
  it('returns the monster unscaled (full hp) when the level boost rolls 0', () => {
    // floor(0 * 3) = 0
    const e = scaleEnemy(wolf, () => 0)

    expect(e).toEqual({
      name: 'หมาป่าเงา', emoji: '🐺', lv: 5,
      maxHp: 100, hp: 100, atk: 10, def: 4, spd: 6,
      exp: 20, gold: 12, drop: { item: 'fang', chance: 0.5 },
    })
  })

  it('applies the maximum boost (floor(rng*3)=2): +2 lv, +16 hp, +4 atk, +2 def, +8 exp, +6 gold', () => {
    const e = scaleEnemy(wolf, () => 0.9)

    expect(e).toEqual({
      name: 'หมาป่าเงา', emoji: '🐺', lv: 7,
      maxHp: 116, hp: 116, atk: 14, def: 6, spd: 6,
      exp: 28, gold: 18, drop: { item: 'fang', chance: 0.5 },
    })
  })
})

const enemyWithDrop: BattleEnemy = {
  name: 'หมาป่าเงา', emoji: '🐺', lv: 5,
  maxHp: 100, hp: 0, atk: 10, def: 4, spd: 6, exp: 20, gold: 12,
  drop: { item: 'fang', chance: 0.5 },
}

describe('rollLoot', () => {
  it('drops the monster item when its roll beats the chance, no plus-stone otherwise', () => {
    // drop roll 0.4 < 0.5 → fang ; stone roll 0.5 ≮ 0.1 → no stone
    expect(rollLoot(enemyWithDrop, seq(0.4, 0.5))).toEqual(['fang'])
  })

  it('can drop both the monster item and a plus-stone, in that order', () => {
    expect(rollLoot(enemyWithDrop, seq(0.1, 0.05))).toEqual(['fang', 'plus-stone'])
  })

  it('skips the drop roll entirely when the enemy has no drop (stone roll is consulted first)', () => {
    const noDrop: BattleEnemy = { ...enemyWithDrop, drop: undefined }
    // single rng call, used for the plus-stone roll
    expect(rollLoot(noDrop, seq(0.05))).toEqual(['plus-stone'])
  })

  it('returns nothing when both rolls fail', () => {
    expect(rollLoot(enemyWithDrop, seq(0.9, 0.9))).toEqual([])
  })
})
