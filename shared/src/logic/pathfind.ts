// Click-to-Walk pathfinding (CONTEXT.md: "Path", "Click-to-Walk").
// Pure A* over a tile grid with 4-connected movement and unit step cost.
// Pathfinding obstacles are walls only — Monsters, Warps, and NPCs are
// walkable in pathfinding, and their side-effects fire from `tryMove` when
// the Character actually steps onto them.
import type { TileDef } from '../types.js'

export interface PathfindInput {
  layout: TileDef[][]
  /** Source tile (where the Character is now). */
  from: { x: number; y: number }
  /** Destination tile the user clicked. */
  to: { x: number; y: number }
}

export interface PathStep {
  x: number
  y: number
}

/** Find a Path from `from` to `to`. Returns the destination as the last
 *  step. Empty array means no Path exists (or `from === to`).
 *
 *  Behaviour notes:
 *  - 4-connected (no diagonals — matches keyboard movement).
 *  - Source cell IS walkable for the purposes of the search (we obviously
 *    stand on it), but cells flagged `walkable: false` are blocked.
 *  - Destination cell may be non-walkable; in that case no Path is found.
 *  - Caller is expected to feed each step through `tryMove(dx, dy)` so
 *    monster/warp/NPC interactions trigger naturally. */
export function findPath(opts: PathfindInput): PathStep[] {
  const { layout, from, to } = opts
  const h = layout.length
  if (h === 0) return []
  const w = layout[0].length
  if (w === 0) return []
  if (from.x === to.x && from.y === to.y) return []
  if (!inBounds(to, w, h)) return []
  if (!isWalkable(layout, to.x, to.y)) return []
  if (!inBounds(from, w, h)) return []

  // Open set is a simple array; for our 12×11 maps a binary heap is
  // overkill and the constant factor of array `findIndex` wins.
  const openIds = new Set<number>()
  const gScore = new Map<number, number>()
  const fScore = new Map<number, number>()
  const cameFrom = new Map<number, number>()
  const cellId = (x: number, y: number) => y * w + x

  const startId = cellId(from.x, from.y)
  openIds.add(startId)
  gScore.set(startId, 0)
  fScore.set(startId, manhattan(from, to))

  const dirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]]

  while (openIds.size > 0) {
    // Pick the open node with the lowest fScore.
    let currentId = -1
    let bestF = Infinity
    for (const id of openIds) {
      const f = fScore.get(id) ?? Infinity
      if (f < bestF) { bestF = f; currentId = id }
    }
    if (currentId === -1) break

    const cx = currentId % w
    const cy = Math.floor(currentId / w)
    if (cx === to.x && cy === to.y) {
      return reconstruct(cameFrom, currentId, w)
    }

    openIds.delete(currentId)
    const curG = gScore.get(currentId) ?? Infinity
    for (const [dx, dy] of dirs) {
      const nx = cx + dx
      const ny = cy + dy
      if (!inBounds({ x: nx, y: ny }, w, h)) continue
      if (!isWalkable(layout, nx, ny)) continue
      const nid = cellId(nx, ny)
      const tentative = curG + 1
      if (tentative < (gScore.get(nid) ?? Infinity)) {
        cameFrom.set(nid, currentId)
        gScore.set(nid, tentative)
        fScore.set(nid, tentative + manhattan({ x: nx, y: ny }, to))
        openIds.add(nid)
      }
    }
  }
  return []
}

function inBounds(p: { x: number; y: number }, w: number, h: number): boolean {
  return p.x >= 0 && p.x < w && p.y >= 0 && p.y < h
}

function isWalkable(layout: TileDef[][], x: number, y: number): boolean {
  return layout[y]?.[x]?.walkable === true
}

function manhattan(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function reconstruct(
  cameFrom: Map<number, number>, endId: number, w: number,
): PathStep[] {
  const out: PathStep[] = []
  let id: number | undefined = endId
  while (id !== undefined && cameFrom.has(id)) {
    out.unshift({ x: id % w, y: Math.floor(id / w) })
    id = cameFrom.get(id)
  }
  return out
}
