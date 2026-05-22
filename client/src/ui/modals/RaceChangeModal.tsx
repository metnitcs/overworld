import { useState } from 'react'
import { useGame } from '../../game/store'
import {
  AVAILABLE_RACES, RACES, TRANSCEND_LV,
  type PrimaryStat, type StatModifier,
} from '@asura/shared'

/** Slice 17: Lv 10 race-change quest. Fires once via store.gainExp when the
 *  player hits the threshold lv and their character is still un-transcended.
 *  Slice 25: shows each race's stat modifiers + a preview of the diff
 *  from the player's CURRENT race so the choice is informed. */
export function RaceChangeModal() {
  const game = useGame((s) => s.game)
  const transcend = useGame((s) => s.transcend)
  const setModal = useGame((s) => s.setModal)
  const [picked, setPicked] = useState<string>(game.raceId)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const currentRace = RACES.find((r) => r.id === game.raceId)
  const currentMods = currentRace?.modifiers ?? {}

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
        เลือกเผ่าใหม่ที่จะติดตัวคุณตลอดไป (เปลี่ยนได้ครั้งเดียว) ตัวเลขด้านล่างคือ
        modifier ของแต่ละ stat — ระบบจะปรับ stats ปัจจุบันของคุณตามผลต่างทันที
        (clamp ที่ 10 หากต่ำกว่านั้น)
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
              <RaceMods mods={r.modifiers} />
              {r.id !== game.raceId && (
                <DiffPreview from={currentMods} to={r.modifiers} />
              )}
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

const STAT_LABEL: Record<PrimaryStat, string> = {
  str: 'STR', int: 'INT', dex: 'DEX', agi: 'AGI', luk: 'LUK', vit: 'VIT',
}
const ALL_STATS: PrimaryStat[] = ['str', 'int', 'dex', 'agi', 'luk', 'vit']

function RaceMods({ mods }: { mods: StatModifier }) {
  const entries = ALL_STATS
    .map((k) => [k, mods[k] ?? 0] as const)
    .filter(([, v]) => v !== 0)
  if (entries.length === 0) {
    return <div className="text-[10px] mt-0.5 text-kw-text-dim">— ไม่มี modifier (สมดุล) —</div>
  }
  return (
    <div className="text-[10px] mt-0.5 flex flex-wrap gap-1">
      {entries.map(([k, v]) => (
        <span key={k} className={v > 0 ? 'text-green-700' : 'text-kw-red'}>
          {STAT_LABEL[k]} {v > 0 ? '+' : ''}{v}
        </span>
      ))}
    </div>
  )
}

/** Show the (newRace − currentRace) modifier diff — what actually applies
 *  to the player on transcend. STAT_BASE clamp not shown explicitly here;
 *  player sees the raw diff which is the cleanest expectation. */
function DiffPreview({ from, to }: { from: StatModifier; to: StatModifier }) {
  const diffs = ALL_STATS
    .map((k) => [k, (to[k] ?? 0) - (from[k] ?? 0)] as const)
    .filter(([, v]) => v !== 0)
  if (diffs.length === 0) return null
  return (
    <div className="text-[10px] mt-0.5 text-kw-blue-deep">
      → ผลต่าง: {diffs.map(([k, v]) =>
        `${STAT_LABEL[k]} ${v > 0 ? '+' : ''}${v}`
      ).join(' · ')}
    </div>
  )
}
