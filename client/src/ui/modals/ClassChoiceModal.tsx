import { useState } from 'react'
import { useGame, useRaces, useClassesForRace } from '../../game/store'
import {
  CLASS_CHANGE_LV,
  type PrimaryStat, type StatModifier,
} from '@asura/shared'

/** Slice 26 → Slice 27: Lv 120 class-change quest. Only shows classes
 *  whose `requiredRaceId` matches the player's chosen race (Lv 10
 *  transcend). Mirror of RaceChangeModal — fires once via store.gainExp
 *  when the player crosses CLASS_CHANGE_LV. The player MUST pick. */
export function ClassChoiceModal() {
  const game = useGame((s) => s.game)
  const classChange = useGame((s) => s.classChange)
  const setModal = useGame((s) => s.setModal)
  // Slice 27 + 28: filter to the 2 classes available for this player's
  // race, reading from the live DB cache (admin edits show up here).
  const choices = useClassesForRace(game.raceId)
  const races = useRaces()
  const race = races.find((r) => r.id === game.raceId)
  const [picked, setPicked] = useState<string>(choices[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function confirm() {
    setBusy(true); setErr(null)
    try {
      await classChange(picked)
      setModal('none')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'เปลี่ยนคลาสไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-kw-text-dim px-1">
        <b className="text-kw-blue-deep">เควสเลือกอาชีพสุดท้าย (Lv {CLASS_CHANGE_LV})</b>
        {' — '}สาย <b>{race?.emoji} {race?.name}</b> ปลดล็อก 2 อาชีพนี้
        เลือกหนึ่งที่จะติดตัวคุณตลอด (เปลี่ยนได้ครั้งเดียว)
        ตัวเลขด้านล่างคือ <b>growth weights</b> ที่แนะนำให้เทใส่ stats
        ตอน lv up — ไม่ได้ apply อัตโนมัติ ผู้เล่นเลือกเอง
      </div>

      <div className="space-y-2">
        {choices.length === 0 && (
          <div className="text-xs text-kw-red p-2 text-center">
            ⚠ ไม่พบอาชีพสำหรับเผ่า "{game.raceId}" — แจ้ง admin
          </div>
        )}
        {choices.map((c) => (
          <div
            key={c.id}
            className={`option-card ${picked === c.id ? 'selected' : ''}`}
            onClick={() => !busy && setPicked(c.id)}
          >
            <div className="text-3xl">{c.emoji}</div>
            <div className="flex-1">
              <div className="font-bold text-kw-blue-deep text-sm">{c.name}</div>
              <div className="text-[11px] text-kw-text-dim">{c.desc}</div>
              <div className="text-[10px] mt-0.5">
                สกิล: <b>{c.skill.name}</b> ({c.skill.type === 'magic' || c.skill.type === 'holy' ? 'mAtk' : 'pAtk'} × {c.skill.mult})
              </div>
              <GrowthHint growth={c.growth} />
            </div>
            {picked === c.id && (
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
        disabled={busy || !picked}
      >
        {busy ? 'กำลังเปลี่ยน…' : `ยืนยันเป็น ${choices.find((c) => c.id === picked)?.name ?? '?'}`}
      </button>
    </div>
  )
}

const STAT_LABEL: Record<PrimaryStat, string> = {
  str: 'STR', int: 'INT', dex: 'DEX', agi: 'AGI', luk: 'LUK', vit: 'VIT',
}
const ALL_STATS: PrimaryStat[] = ['str', 'int', 'dex', 'agi', 'luk', 'vit']

function GrowthHint({ growth }: { growth: StatModifier }) {
  const entries = ALL_STATS
    .map((k) => [k, growth[k] ?? 0] as const)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return null
  return (
    <div className="text-[10px] mt-0.5 text-kw-blue-deep">
      แนะนำเทใส่: {entries.map(([k, v]) => `${STAT_LABEL[k]}×${v}`).join(' / ')}
    </div>
  )
}
