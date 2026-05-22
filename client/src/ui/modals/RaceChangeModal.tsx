import { useState } from 'react'
import { useGame } from '../../game/store'
import { AVAILABLE_RACES, TRANSCEND_LV } from '@asura/shared'

/** Slice 17: Lv 10 race-change quest. Fires once via store.gainExp when the
 *  player hits the threshold lv and their character is still un-transcended.
 *  The player MUST pick a race — there's no "close without choosing". */
export function RaceChangeModal() {
  const game = useGame((s) => s.game)
  const transcend = useGame((s) => s.transcend)
  const setModal = useGame((s) => s.setModal)
  const [picked, setPicked] = useState<string>(game.raceId)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setErr(null)
    try {
      await transcend(picked)
      setModal('none')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'เปลี่ยนเผ่าไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-kw-text-dim px-1">
        <b className="text-kw-blue-deep">เควสเปลี่ยนเผ่า (Lv {TRANSCEND_LV})</b> —
        เลือกเผ่าใหม่ที่จะติดตัวคุณตลอดไป (เปลี่ยนได้ครั้งเดียว)
      </div>

      <div className="space-y-2">
        {AVAILABLE_RACES.map((r) => (
          <div
            key={r.id}
            className={`option-card ${picked === r.id ? 'selected' : ''}`}
            onClick={() => !busy && setPicked(r.id)}
          >
            <div className="text-3xl">{r.emoji}</div>
            <div className="flex-1">
              <div className="font-bold text-kw-blue-deep text-sm">{r.name}</div>
              <div className="text-[11px] text-kw-text-dim">{r.desc}</div>
              <div className="text-[10px] mt-0.5 text-kw-orange">
                HP {r.hp} · MP {r.mp} · ATK {r.atk} · DEF {r.def} · SPD {r.spd}
              </div>
            </div>
            {picked === r.id && (
              <div className="text-green-600 font-bold text-lg">✓</div>
            )}
          </div>
        ))}
      </div>

      {err && (
        <div className="text-xs text-kw-red px-1" role="alert">{err}</div>
      )}

      <button
        className="btn"
        onClick={confirm}
        disabled={busy}
      >
        {busy ? 'กำลังเปลี่ยน…' : `ยืนยันเป็น ${AVAILABLE_RACES.find((r) => r.id === picked)?.name ?? '?'}`}
      </button>
    </div>
  )
}
