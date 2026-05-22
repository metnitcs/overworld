import { describe, it, expect } from 'vitest'
import type { MonsterDef, BattleEnemy } from '../types'
import { resolveAttack, scaleEnemy, rollLoot, type Combatant } from './combat'

/** RNG stub: returns the queued values in order, one per call. */
function seq(...values: number[]) {
  let i = 0
  return () => values[i++]
}

/** Convenience factory for a vanilla 100-acc / 0-dodge / 0-crit combatant
 *  so each test only tweaks the field it cares about. */
function c(o: Partial<Combatant> = {}): Combatant {
  return { atk: 20, def: 10, acc: 100, dodge: 0, crit: 0, ...o }
}

describe('resolveAttack', () => {
  it('hit roll: rng(0.5) vs hitChance 100 → hit lands', () => {
    // hit roll 0.5*100=50 < hitChance 100 → hit
    // crit roll 0.5*100=50 < crit 0 → no crit
    // variance 0.5 → 1.0
    // raw = 20 * 1.0 = 20 ; dmg = 20 - 10 = 10
    const r = resolveAttack(c(), c(), { rng: seq(0.5, 0.5, 0.5) })
    expect(r).toEqual({ dmg: 10, hit: true, crit: false })
  })

  it('hit roll: when target dodge >= attacker acc the hit chance is clamped to 5%', () => {
    // hitChance = max(5, min(99, 100 - 200)) = 5
    // hit roll 0.1*100=10 ≥ 5 → MISS
    const r = resolveAttack(c({ acc: 100 }), c({ dodge: 200 }), { rng: seq(0.1) })
    expect(r).toEqual({ dmg: 0, hit: false, crit: false })
  })

  it('hit roll: when hitChance > 99 it caps to 99 (always-a-chance-to-miss)', () => {
    // hitChance = max(5, min(99, 500 - 0)) = 99
    // hit roll 0.99*100=99 ≥ 99 → MISS  (edge of the window)
    const r = resolveAttack(c({ acc: 500 }), c(), { rng: seq(0.99) })
    expect(r).toEqual({ dmg: 0, hit: false, crit: false })
  })

  it('crit roll: when rng beats crit% the damage gets ×1.5', () => {
    // hit 0 → land ; crit 0.05*100=5 < crit 50 → crit ; variance 0.5 → 1.0
    // raw = 20 * 1.0 * 1.5 = 30 ; dmg = 30 - 10 = 20
    const r = resolveAttack(c({ crit: 50 }), c(), { rng: seq(0, 0.05, 0.5) })
    expect(r).toEqual({ dmg: 20, hit: true, crit: true })
  })

  it('skill mult applies on top of variance and crit', () => {
    // hit 0 ; crit 0 ; variance 0.5 → 1.0
    // raw = 20 * 1.0 * 2 = 40 ; dmg = 40 - 10 = 30
    const r = resolveAttack(c(), c(), { mult: 2, rng: seq(0, 0.5, 0.5) })
    expect(r).toEqual({ dmg: 30, hit: true, crit: false })
  })

  it('damage floors at 1 even when def dwarfs raw damage', () => {
    // hit 0 ; crit 0 ; variance 0 → 0.85 ; raw = 2 * 0.85 = 1.7 ; dmg = max(1, 1.7 - 100) = 1
    const r = resolveAttack(c({ atk: 2 }), c({ def: 100 }), { rng: seq(0, 0.5, 0) })
    expect(r).toEqual({ dmg: 1, hit: true, crit: false })
  })

  it('variance band: lower bound 0.85, upper 1.15', () => {
    // lower: rng 0 → factor 0.85 ; 20 * 0.85 = 17 ; - 10 = 7
    const lo = resolveAttack(c(), c(), { rng: seq(0, 0.5, 0) })
    expect(lo.dmg).toBe(7)
    // upper: rng 0.999... → factor 0.85+0.2997=1.1497 ; 20 * 1.1497 = 22.99 ; - 10 = 12.99 → floor 12
    const hi = resolveAttack(c(), c(), { rng: seq(0, 0.5, 0.999) })
    expect(hi.dmg).toBe(12)
  })
})

const wolf: MonsterDef = {
  id: 'wolf-shadow',
  name: 'หมาป่าเงา', emoji: '🐺', lv: 5,
  hp: 100, atk: 10, def: 4, spd: 6, exp: 20, gold: 12,
  drop: { item: 'fang', chance: 0.5 },
}

describe('scaleEnemy', () => {
  it('returns the monster unscaled (full hp) when the level boost rolls 0', () => {
    const e = scaleEnemy(wolf, () => 0)
    expect(e.lv).toBe(5)
    expect(e.maxHp).toBe(100)
    expect(e.hp).toBe(100)
    expect(e.atk).toBe(10)
    expect(e.def).toBe(4)
    expect(e.spd).toBe(6)
    expect(e.exp).toBe(20)
    expect(e.gold).toBe(12)
    expect(e.drop).toEqual({ item: 'fang', chance: 0.5 })
  })

  it('applies the maximum boost (floor(rng*3)=2): +2 lv, +16 hp, +4 atk, +2 def, +8 exp, +6 gold', () => {
    const e = scaleEnemy(wolf, () => 0.9)
    expect(e.lv).toBe(7)
    expect(e.maxHp).toBe(116)
    expect(e.atk).toBe(14)
    expect(e.def).toBe(6)
    expect(e.exp).toBe(28)
    expect(e.gold).toBe(18)
  })

  it('seeds default acc/dodge/crit/mAtk/mDef for symmetric combat', () => {
    const e = scaleEnemy(wolf, () => 0)
    expect(e.acc).toBe(85 + 5)             // 85 + lv (no lvBoost when rng=0)
    expect(e.dodge).toBe(Math.floor(6 * 0.3)) // floor(spd*0.3) = 1
    expect(e.crit).toBe(3 + Math.floor(5 * 0.2)) // 3 + floor(lv*0.2)
    expect(e.mAtk).toBe(Math.floor(10 * 0.8))
    expect(e.mDef).toBe(Math.floor(4 * 0.5))
  })
})

const enemyWithDrop: BattleEnemy = {
  name: 'หมาป่าเงา', emoji: '🐺', lv: 5,
  maxHp: 100, hp: 0, atk: 10, def: 4, spd: 6, exp: 20, gold: 12,
  drop: { item: 'fang', chance: 0.5 },
}

describe('rollLoot', () => {
  it('drops the monster item when its roll beats the chance, no plus-stone otherwise', () => {
    expect(rollLoot(enemyWithDrop, seq(0.4, 0.5))).toEqual(['fang'])
  })

  it('can drop both the monster item and a plus-stone, in that order', () => {
    expect(rollLoot(enemyWithDrop, seq(0.1, 0.05))).toEqual(['fang', 'plus-stone'])
  })

  it('skips the drop roll entirely when the enemy has no drop (stone roll is consulted first)', () => {
    const noDrop: BattleEnemy = { ...enemyWithDrop, drop: undefined }
    expect(rollLoot(noDrop, seq(0.05))).toEqual(['plus-stone'])
  })

  it('returns nothing when both rolls fail', () => {
    expect(rollLoot(enemyWithDrop, seq(0.9, 0.9))).toEqual([])
  })
})
