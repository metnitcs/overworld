import { describe, it, expect } from 'vitest'
import type { MonsterDef } from '../types'
import { rollEncounter } from './encounter'

function seq(...values: number[]): () => number {
  let i = 0
  return () => values[i++] ?? 0
}

const mob = (id: string, lv = 1): MonsterDef => ({
  id, name: id, emoji: '🐛',
  lv, hp: 10, atk: 1, def: 1, spd: 1, exp: 1, gold: 1,
})

describe('rollEncounter', () => {
  it('always includes the primary as queue[0]', () => {
    const q = rollEncounter({
      primary: mob('wolf'),
      monsterPool: [mob('rat'), mob('bat')],
      rng: seq(0, 0, 0, 0, 0, 0, 0, 0),
      forceSize: 3,
    })
    expect(q[0].name).toBe('wolf')
  })

  it('returns at least 1 enemy even with an empty monsterPool', () => {
    const q = rollEncounter({
      primary: mob('lone'),
      monsterPool: [],
      rng: seq(0, 0),
      forceSize: 5,
    })
    expect(q).toHaveLength(1)
    expect(q[0].name).toBe('lone')
  })

  it('caps the queue length at 1 + pool.length when the roll is too big', () => {
    // forceSize = 10 but pool has only 1 other → max is 2 total.
    const q = rollEncounter({
      primary: mob('a'),
      monsterPool: [mob('b')],
      rng: seq(...new Array(20).fill(0)),
      forceSize: 10,
    })
    expect(q).toHaveLength(2)
  })

  it('default size (no forceSize) is between 1 and 5 inclusive', () => {
    // Probe by feeding rng = 0 (smallest) and rng = 0.99 (largest).
    const small = rollEncounter({
      primary: mob('a'), monsterPool: [mob('b'), mob('c'), mob('d'), mob('e'), mob('f')],
      rng: seq(0, ...new Array(20).fill(0)),
    })
    expect(small.length).toBeGreaterThanOrEqual(1)
    const big = rollEncounter({
      primary: mob('a'), monsterPool: [mob('b'), mob('c'), mob('d'), mob('e'), mob('f')],
      rng: seq(0.99, ...new Array(20).fill(0)),
    })
    expect(big.length).toBeLessThanOrEqual(5)
  })

  it('picks tail enemies from the monsterPool using rng', () => {
    // forceSize=3 → primary + 2 tail. With rng feeding 0.99 for both tail
    // picks, both should be the LAST element of the pool.
    const q = rollEncounter({
      primary: mob('a'),
      monsterPool: [mob('b'), mob('c'), mob('z')],
      // scaleEnemy consumes 1 rng per scale call (level-boost roll). Total
      // rng calls: 1 scale primary, then per tail: 1 pick + 1 scale = 2.
      rng: seq(0, 0.99, 0, 0.99, 0),
      forceSize: 3,
    })
    expect(q).toHaveLength(3)
    expect(q[1].name).toBe('z')
    expect(q[2].name).toBe('z')
  })
})
