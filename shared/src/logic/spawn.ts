// Spawn resolution — pure, RNG-injectable.
// Decides where Monsters appear on a Map based on Layout walkability and
// the optional `tile.kind='spawn'` opt-in. See CONTEXT.md "Spawn".
import type { TileDef } from '../types.js'

export interface SpawnInput {
  /** Map Layout grid: layout[y][x]. */
  layout: TileDef[][]
  /** How many monsters to place on the map. */
  monsterCount: number
  /** Monster ids eligible for this Map (from MapMonster join). */
  monsters: string[]
  /** Coords to exclude — player position, Warp tiles, etc. */
  occupied: ReadonlyArray<{ x: number; y: number }>
  rng: () => number
}

export interface SpawnPlacement {
  x: number
  y: number
  monsterId: string
}

/** Collect spawn-candidate cells. Rules:
 *  1. Cell must be `walkable: true`.
 *  2. Cell must not be in `occupied`.
 *  3. If any cell in the layout has `kind === 'spawn'`, only those count
 *     (designer opt-in). Otherwise every walkable + free cell qualifies
 *     (backward compat for layouts authored before tile.kind landed). */
function listSpawnCells(
  layout: TileDef[][],
  occupied: Set<string>,
): Array<{ x: number; y: number }> {
  const explicit: Array<{ x: number; y: number }> = []
  const walkable: Array<{ x: number; y: number }> = []
  for (let y = 0; y < layout.length; y++) {
    const row = layout[y]
    if (!row) continue
    for (let x = 0; x < row.length; x++) {
      const cell = row[x]
      if (!cell?.walkable) continue
      if (occupied.has(`${x},${y}`)) continue
      walkable.push({ x, y })
      if (cell.kind === 'spawn') explicit.push({ x, y })
    }
  }
  return explicit.length > 0 ? explicit : walkable
}

/** Roll Monster spawn placements for a Map.
 *  Samples spawn cells without replacement (no two monsters share a tile).
 *  Returns `[]` cleanly if `monsterCount === 0`, the spawn pool is empty,
 *  or no candidates remain after walkability + occupancy filtering. */
export function rollSpawns(opts: SpawnInput): SpawnPlacement[] {
  const { layout, monsterCount, monsters, occupied, rng } = opts
  if (!monsterCount || monsters.length === 0) return []
  const occupiedSet = new Set(occupied.map((p) => `${p.x},${p.y}`))
  const pool = listSpawnCells(layout, occupiedSet)
  if (pool.length === 0) return []

  const placements: SpawnPlacement[] = []
  const remaining = [...pool]
  const cap = Math.min(monsterCount, remaining.length)
  for (let i = 0; i < cap; i++) {
    const pickIdx = Math.floor(rng() * remaining.length)
    const cell = remaining.splice(pickIdx, 1)[0]
    const monsterId = monsters[Math.floor(rng() * monsters.length)]
    placements.push({ x: cell.x, y: cell.y, monsterId })
  }
  return placements
}
