import { useGame } from '../../game/store'
import { ITEMS } from '../../game/data'

export function EnhanceModal() {
  const game = useGame(s => s.game)
  const enhance = useGame(s => s.enhance)

  const equipped: { key: string; slot: '_w' | '_a'; type: 'weapon' | 'armor' }[] = []
  if (game.equipWeapon) equipped.push({ key: game.equipWeapon, slot: '_w', type: 'weapon' })
  if (game.equipArmor)  equipped.push({ key: game.equipArmor,  slot: '_a', type: 'armor' })

  const stoneCount = game.inventory['plus-stone'] || 0

  return (
    <div className="space-y-2">
      <div className="text-xs text-kw-text-dim px-1">
        ตีบวกอาวุธ/เกราะที่สวมใส่อยู่ ใช้ <b className="text-kw-orange">💠 หินตีบวก</b> โอกาสสำเร็จลดลงตามระดับ
      </div>
      <div className="panel panel-pad text-sm">
        💠 หินตีบวกที่มี: <span className="font-bold text-kw-orange">{stoneCount}</span> ชิ้น
      </div>

      {equipped.length === 0 ? (
        <div className="panel panel-pad text-center text-xs text-kw-text-dim">
          ต้องสวมอาวุธหรือเกราะก่อน (ไปที่กระเป๋า → สวม)
        </div>
      ) : equipped.map(e => {
        const it = ITEMS[e.key]
        const cur = game.plus[e.key + e.slot] || 0
        const success = Math.max(5, 95 - cur * 9)
        const cost = 1 + Math.floor(cur / 2)
        const maxed = cur >= 10
        const can = !maxed && stoneCount >= cost
        return (
          <div key={e.key + e.slot} className="panel panel-pad flex items-center gap-3">
            <div className="text-3xl">{it.emoji}</div>
            <div className="flex-1 text-xs">
              <div className="font-bold text-kw-blue-deep">
                {it.name}
                <span className="text-kw-red ml-1">+{cur}</span>
                {maxed && <span className="text-kw-text-dim ml-1">(สูงสุด)</span>}
              </div>
              <div className="mt-0.5">
                โอกาสสำเร็จ <b className={success >= 50 ? 'text-green-700' : 'text-red-700'}>{success}%</b>
                {' · '}
                ใช้ 💠 {cost} ชิ้น
              </div>
              <div className="text-kw-text-dim">
                เพิ่ม {e.type === 'weapon' ? 'ATK +3' : 'DEF +2'} ต่อระดับ
                {cur >= 5 && <span className="text-red-600"> · ล้มเหลวอาจลดบวก!</span>}
              </div>
            </div>
            <button
              className="btn btn-sm btn-pink"
              disabled={!can}
              onClick={() => enhance(e.key, e.slot)}
            >
              ตี!
            </button>
          </div>
        )
      })}
    </div>
  )
}
