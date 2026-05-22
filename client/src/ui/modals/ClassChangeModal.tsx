import { useGame } from '../../game/store'
import { CLASSES } from '@asura/shared'

const COST = 500

export function ClassChangeModal() {
  const game = useGame(s => s.game)
  const changeClass = useGame(s => s.changeClass)
  const setModal = useGame(s => s.setModal)

  return (
    <div className="space-y-2">
      <div className="text-xs text-kw-text-dim px-1">
        เปลี่ยนอาชีพได้ทุกเวลา ใช้ 💰 <b className="text-kw-orange">{COST} ทอง</b>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {CLASSES.map(c => {
          const cur = c.id === game.classId
          return (
            <div key={c.id} className={`option-card ${cur ? 'selected' : ''}`}>
              <div className="text-3xl">{c.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-kw-blue-deep text-sm">{c.name}</div>
                <div className="text-[10px] text-kw-text-dim">
                  สกิล: {c.skill.name}
                </div>
                <div className="text-[10px] text-kw-text-dim">{c.desc}</div>
              </div>
              {cur ? (
                <span className="text-[10px] text-green-700 font-semibold">ปัจจุบัน</span>
              ) : (
                <button
                  className="btn btn-sm"
                  disabled={game.gold < COST}
                  onClick={() => {
                    if (changeClass(c.id, COST)) setModal('none')
                  }}
                >เลือก</button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
