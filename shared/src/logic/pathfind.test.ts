import { describe, it, expect } from 'vitest'
import type { TileDef } from '../types'
import { findPath } from './pathfind'

/** Build a layout from an ASCII grid where:
 *    '.' = walkable
 *    '#' = wall (walkable: false)
 *  Whitespace between rows is the row break in the source. */
function gridFromAscii(rows: string[]): TileDef[][] {
  return rows.map((r) =>
    r.split('').map((ch) => ({ walkable: ch !== '#' })),
  )
}

describe('findPath', () => {
  it('returns [] when source equals destination', () => {
    const layout = gridFromAscii(['...'])
    expect(findPath({ layout, from: { x: 1, y: 0 }, to: { x: 1, y: 0 } })).toEqual([])
  })

  it('returns [] when destination is a wall', () => {
    const layout = gridFromAscii([
      '...',
      '.#.',
      '...',
    ])
    expect(findPath({ layout, from: { x: 0, y: 0 }, to: { x: 1, y: 1 } })).toEqual([])
  })

  it('returns [] when destination is out of bounds', () => {
    const layout = gridFromAscii(['..'])
    expect(findPath({ layout, from: { x: 0, y: 0 }, to: { x: 5, y: 5 } })).toEqual([])
  })

  it('returns a straight horizontal Path on an open grid', () => {
    const layout = gridFromAscii(['.....'])
    const path = findPath({ layout, from: { x: 0, y: 0 }, to: { x: 3, y: 0 } })
    expect(path).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ])
  })

  it('returns a straight vertical Path on an open grid', () => {
    const layout = gridFromAscii(['.', '.', '.', '.'])
    const path = findPath({ layout, from: { x: 0, y: 0 }, to: { x: 0, y: 3 } })
    expect(path).toEqual([
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 0, y: 3 },
    ])
  })

  it('routes around a wall', () => {
    // Goal: walk from (0,1) to (2,1), with (1,1) blocked. Path must go up
    // or down around it — length 4 either way.
    const layout = gridFromAscii([
      '...',
      '.#.',
      '...',
    ])
    const path = findPath({ layout, from: { x: 0, y: 1 }, to: { x: 2, y: 1 } })
    expect(path).toHaveLength(4)
    // Last step must be the destination.
    expect(path[path.length - 1]).toEqual({ x: 2, y: 1 })
    // Never steps onto the wall.
    expect(path.some((p) => p.x === 1 && p.y === 1)).toBe(false)
  })

  it('returns [] when the destination is fully walled off', () => {
    // Goal cell is a "room" surrounded by walls.
    const layout = gridFromAscii([
      '#####',
      '#...#',
      '#.#.#',
      '#...#',
      '#####',
    ])
    // From an unreachable room into another via blocked walls.
    const path = findPath({
      layout,
      from: { x: 1, y: 1 },
      to:   { x: 3, y: 3 },
    })
    // (1,1) → (3,3) is reachable around the central pillar; should be 4-5 steps.
    expect(path.length).toBeGreaterThan(0)

    // But blocking everything: a goal cell isolated by walls.
    const isolated = gridFromAscii([
      '...',
      '###',
      '..G',
    ]).map((row, y) =>
      row.map((c, x) => (x === 2 && y === 2 ? { walkable: true } : c)),
    )
    expect(findPath({
      layout: isolated,
      from: { x: 0, y: 0 },
      to:   { x: 2, y: 2 },
    })).toEqual([])
  })

  it('produces an optimal-length Path (Manhattan distance when no obstacles)', () => {
    const layout = gridFromAscii([
      '......',
      '......',
      '......',
    ])
    const path = findPath({ layout, from: { x: 0, y: 0 }, to: { x: 4, y: 2 } })
    // Manhattan distance = 6, A* should match exactly with no obstacles.
    expect(path).toHaveLength(6)
  })

  it('treats source out-of-bounds as no Path', () => {
    const layout = gridFromAscii(['.....'])
    expect(findPath({
      layout, from: { x: -1, y: 0 }, to: { x: 3, y: 0 },
    })).toEqual([])
  })

  it('handles a single-row corridor with a gap forcing a long detour', () => {
    //  . . . . .
    //  # # # # .
    //  . . . . .
    const layout = gridFromAscii([
      '.....',
      '####.',
      '.....',
    ])
    const path = findPath({ layout, from: { x: 0, y: 2 }, to: { x: 0, y: 0 } })
    // Right along bottom 4 steps → up through gap (4,2→4,1→4,0) 2 steps →
    // left along top 4 steps = 10 total.
    expect(path).toHaveLength(10)
    expect(path[path.length - 1]).toEqual({ x: 0, y: 0 })
  })
})
