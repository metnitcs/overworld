import { describe, it, expect } from 'vitest'
import type { TileDef } from '../types'
import { rollSpawns } from './spawn'

/** RNG stub: returns the queued values in order, one per call. */
function seq(...values: number[]): () => number {
  let i = 0
  return () => values[i++] ?? 0
}

/** Build a uniform-walkable layout of given dimensions. */
function flatLayout(w: number, h: number): TileDef[][] {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ walkable: true })),
  )
}

describe('rollSpawns', () => {
  it('places nothing when monsterCount is 0', () => {
    const out = rollSpawns({
      layout: flatLayout(5, 5),
      monsterCount: 0,
      monsters: ['wolf-shadow'],
      occupied: [],
      rng: seq(),
    })
    expect(out).toEqual([])
  })

  it('places nothing when the monster pool is empty', () => {
    const out = rollSpawns({
      layout: flatLayout(5, 5),
      monsterCount: 3,
      monsters: [],
      occupied: [],
      rng: seq(),
    })
    expect(out).toEqual([])
  })

  it('skips non-walkable cells when selecting spawn coordinates', () => {
    // 2×2 grid: only (1,1) is walkable.
    const layout: TileDef[][] = [
      [{ walkable: false }, { walkable: false }],
      [{ walkable: false }, { walkable: true }],
    ]
    const out = rollSpawns({
      layout,
      monsterCount: 5,
      monsters: ['ghost-fire'],
      occupied: [],
      rng: seq(0.0, 0.0),
    })
    expect(out).toEqual([{ x: 1, y: 1, monsterId: 'ghost-fire' }])
  })

  it('respects the `occupied` exclusion list', () => {
    // 1×2 grid both walkable; (0,0) occupied by the player.
    const layout: TileDef[][] = [
      [{ walkable: true }],
      [{ walkable: true }],
    ]
    const out = rollSpawns({
      layout,
      monsterCount: 5,
      monsters: ['demon-lord'],
      occupied: [{ x: 0, y: 0 }],
      rng: seq(0, 0),
    })
    expect(out).toEqual([{ x: 0, y: 1, monsterId: 'demon-lord' }])
  })

  it("when any cell has kind='spawn', restricts to those (designer opt-in)", () => {
    // 2×2 all walkable; only (1,0) is explicitly tagged kind='spawn'.
    const layout: TileDef[][] = [
      [{ walkable: true }, { walkable: true, kind: 'spawn' }],
      [{ walkable: true }, { walkable: true }],
    ]
    const out = rollSpawns({
      layout,
      monsterCount: 10,
      monsters: ['wolf'],
      occupied: [],
      rng: seq(0, 0),
    })
    expect(out).toEqual([{ x: 1, y: 0, monsterId: 'wolf' }])
  })

  it('falls back to all walkable cells when no kind=spawn cells exist (backward compat)', () => {
    const out = rollSpawns({
      layout: flatLayout(2, 1),
      monsterCount: 2,
      monsters: ['rat'],
      occupied: [],
      // Two cells → first rng picks idx 0 (cell (0,0)) for placement, monster idx 0;
      // second rng picks idx 0 of the now-single-element pool (cell (1,0)), monster idx 0.
      rng: seq(0, 0, 0, 0),
    })
    expect(out).toEqual([
      { x: 0, y: 0, monsterId: 'rat' },
      { x: 1, y: 0, monsterId: 'rat' },
    ])
  })

  it('samples without replacement — never spawns two monsters on the same tile', () => {
    const out = rollSpawns({
      layout: flatLayout(3, 1),
      monsterCount: 3,
      monsters: ['m1'],
      occupied: [],
      rng: seq(0, 0, 0, 0, 0, 0),
    })
    const coords = out.map((p) => `${p.x},${p.y}`)
    expect(new Set(coords).size).toBe(out.length)
  })

  it('caps placements at the number of available candidate cells', () => {
    // Only 1 walkable cell; request 5 monsters → 1 placement returned.
    const out = rollSpawns({
      layout: [[{ walkable: true }, { walkable: false }]],
      monsterCount: 5,
      monsters: ['x'],
      occupied: [],
      rng: seq(0, 0),
    })
    expect(out).toHaveLength(1)
  })

  it('picks monster ids using rng — different rolls pick different ids', () => {
    const out = rollSpawns({
      layout: flatLayout(2, 1),
      monsterCount: 2,
      monsters: ['a', 'b'],
      occupied: [],
      // For each placement: rng for cell pick, then rng for monster pick.
      // First: pick cell idx 0 of 2 (→ (0,0)), then monster idx 1 of 2 (→ 'b').
      // Second: pick cell idx 0 of 1 (→ (1,0)), then monster idx 0 of 2 (→ 'a').
      rng: seq(0.0, 0.99, 0.0, 0.0),
    })
    expect(out).toEqual([
      { x: 0, y: 0, monsterId: 'b' },
      { x: 1, y: 0, monsterId: 'a' },
    ])
  })
})
