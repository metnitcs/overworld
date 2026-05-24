import { useGame } from '../../game/store'
import { enhanceGoldCost, enhancePlusAtkBonus, enhancePlusDefBonus } from '@asura/shared'

/** Slice 48: Blacksmith ceremony. Opens when the player steps on a
 *  blacksmith NPC tile. Lists weapon/armor rows in the bag (filters out
 *  the equipped ones — Blacksmith refuses worn items) and lets the player
 *  enhance each by paying plus-stones + a gold fee. Server re-runs the
 *  pure resolveEnhance with its own RNG. */
export function BlacksmithModal() {
  const game = useGame(s => s.game)
  const items = useGame(s => s.content!.items)
  const npcs = useGame(s => s.content!.maps[s.game.map].npcs)
  const enhance = useGame(s => s.enhance)

  const blacksmith = npcs.find((n) => n.kind === 'blacksmith')
  if (!blacksmith) {
    return (
      <div className="text-center text-xs text-kw-text-dim py-4">
        ไม่มีช่างตีเหล็กในแมพนี้
      </div>
    )
  }

  const stoneRow = game.inventory.find((r) => r.itemKey === 'plus-stone')
  const stoneCount = stoneRow?.qty ?? 0

  // Slice 48: only unequipped weapon/armor rows are enhanceable. Group by
  // itemKey, sort by Plus DESC (same rule as InventoryModal).
  const enhanceable = game.inventory
    .filter((r) => r.id !== game.equipWeapon && r.id !== game.equipArmor)
    .filter((r) => ['weapon', 'armor'].includes(items[r.itemKey]?.type ?? ''))
    .sort((a, b) => a.itemKey.localeCompare(b.itemKey) || b.plus - a.plus)

  return (
    <div className="space-y-2">
      <div className="panel panel-pad flex items-center gap-3">
        <div className="text-3xl">{blacksmith.emoji ?? '🛠️'}</div>
        <div className="flex-1 text-xs">
          <div className="font-bold text-kw-blue-deep text-sm">{blacksmith.name}</div>
          <div className="text-kw-text-dim">
            "ตี+ ได้เฉพาะของในกระเป๋านะ ของที่สวมอยู่ถอดก่อน"
          </div>
        </div>
      </div>

      <div className="panel panel-pad text-sm flex items-center justify-between">
        <span>💠 หินตีบวก: <b className="text-kw-orange">{stoneCount}</b> ชิ้น</span>
        <span>💰 ทอง: <b className="text-kw-orange">{game.gold.toLocaleString()}</b></span>
      </div>

      {enhanceable.length === 0 ? (
        <div className="panel panel-pad text-center text-xs text-kw-text-dim">
          ไม่มีอาวุธ/เกราะในกระเป๋าให้ตี+
          <br />
          (ถ้ามีของสวมอยู่ ถอดก่อนค่อยมา)
        </div>
      ) : enhanceable.map((row) => {
        const it = items[row.itemKey]
        if (!it) return null
        const cur = row.plus
        const success = Math.max(5, 95 - cur * 9)
        const stoneCost = 1 + Math.floor(cur / 2)
        const goldCost = enhanceGoldCost(cur)
        const maxed = cur >= 10
        const can = !maxed && stoneCount >= stoneCost && game.gold >= goldCost
        const slotIcon = it.type === 'weapon' ? '⚔' : '🛡'
        // Slice 51: per-attempt gain depends on the tier. +1..+5 step is
        // smaller; +6..+10 jackpot. Show actual delta for the NEXT level.
        const nextGain = it.type === 'weapon'
          ? enhancePlusAtkBonus(cur + 1) - enhancePlusAtkBonus(cur)
          : enhancePlusDefBonus(cur + 1) - enhancePlusDefBonus(cur)
        const statText = it.type === 'weapon' ? `ATK +${nextGain}` : `DEF +${nextGain}`
        return (
          <div key={row.id} className="panel panel-pad flex items-center gap-3">
            <div className="text-3xl">{it.emoji}</div>
            <div className="flex-1 text-xs">
              <div className="font-bold text-kw-blue-deep">
                {slotIcon} {it.name}
                <span className="text-kw-red ml-1">+{cur}</span>
                {maxed && <span className="text-kw-text-dim ml-1">(สูงสุด)</span>}
              </div>
              <div className="mt-0.5">
                โอกาสสำเร็จ <b className={success >= 50 ? 'text-green-700' : 'text-red-700'}>{success}%</b>
                {' · '}
                ใช้ 💠 {stoneCost} · 💰 {goldCost.toLocaleString()}
              </div>
              <div className="text-kw-text-dim">
                สำเร็จ → {statText} (step: +1..+5 น้อย / +6..+10 jackpot)
                {cur >= 5 && <span className="text-red-600"> · ล้มเหลวอาจลดบวก!</span>}
              </div>
            </div>
            <button
              className="btn btn-sm btn-pink"
              disabled={!can}
              onClick={() => enhance(blacksmith.id, row.id)}
            >
              ตี!
            </button>
          </div>
        )
      })}
    </div>
  )
}
