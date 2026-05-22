import { useState } from 'react'
import { useGame } from '../../game/store'
import { deriveCombatStats, STAT_BASE, type PrimaryStat } from '@asura/shared'

/** Slice 23 — primary-stat allocation modal. Layout:
 *   ┌────────────────────────────────────────┐
 *   │ Unspent points pill                    │
 *   ├──────────────────┬─────────────────────┤
 *   │ 6 primary stats  │  Derived combat     │
 *   │ with [+1] [+5]   │  (live preview)     │
 *   ├──────────────────┴─────────────────────┤
 *   │ Reset stats button (refunds full pool) │
 *   └────────────────────────────────────────┘
 *
 *  The [+N] buttons fire api.allocateStat() one-at-a-time. We keep a small
 *  local `busy` flag to disable buttons during the round-trip — server is
 *  authoritative, no optimistic UI.
 */

const STAT_META: Array<{ id: PrimaryStat; label: string; desc: string; color: string }> = [
  { id: 'str', label: 'STR', desc: 'พลังโจมตีกายภาพ (pATK)', color: '#dc2626' },
  { id: 'int', label: 'INT', desc: 'พลังเวทย์ (mATK) + MP',  color: '#7c3aed' },
  { id: 'dex', label: 'DEX', desc: 'ความแม่นยำ (accuracy)',  color: '#0891b2' },
  { id: 'agi', label: 'AGI', desc: 'การหลบหลีก + ลำดับการตี', color: '#16a34a' },
  { id: 'luk', label: 'LUK', desc: 'โอกาส critical',          color: '#eab308' },
  { id: 'vit', label: 'VIT', desc: 'HP + พลังป้องกัน (pDEF)', color: '#ea580c' },
]

export function StatusModal() {
  const game = useGame((s) => s.game)
  const allocateStat = useGame((s) => s.allocateStat)
  const resetStats = useGame((s) => s.resetStats)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const items = useGame((s) => s.content!.items)
  const derived = deriveCombatStats(game, { items })

  async function spend(stat: PrimaryStat, amount: number) {
    if (busy || amount > game.unspentPoints) return
    setBusy(true); setErr(null)
    try {
      await allocateStat(stat, amount)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'allocate failed')
    } finally {
      setBusy(false)
    }
  }

  async function doReset() {
    setBusy(true); setErr(null)
    try {
      await resetStats()
      setConfirmReset(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'reset failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-2 text-kw-text">
      {/* Header — unspent points + level */}
      <div className="flex items-center justify-between mb-3 px-2">
        <div>
          <div className="text-xs text-kw-text-dim">ตัวละคร</div>
          <div className="font-bold">{game.name} · Lv {game.lv}</div>
        </div>
        <div
          className={`px-4 py-2 rounded-full font-bold text-lg ${
            game.unspentPoints > 0 ? 'bg-kw-yellow text-kw-text' : 'bg-kw-panel text-kw-text-dim'
          }`}
        >
          {game.unspentPoints > 0 ? '✨ ' : ''}{game.unspentPoints} pts
        </div>
      </div>

      {err && (
        <div className="mx-2 mb-2 px-3 py-2 bg-red-100 text-red-700 text-xs rounded">
          {err}
        </div>
      )}

      <div className="grid grid-cols-[1fr_220px] gap-3">
        {/* Primary stats list */}
        <div className="flex flex-col gap-2">
          {STAT_META.map((s) => {
            const cur = game[s.id] as number
            const allocated = cur - STAT_BASE
            return (
              <div
                key={s.id}
                className="bg-white border border-kw-border rounded-lg px-3 py-2 flex items-center gap-3"
              >
                <div
                  className="w-12 h-12 rounded-lg flex flex-col items-center justify-center font-bold text-white"
                  style={{ background: s.color }}
                >
                  <span className="text-xs leading-none">{s.label}</span>
                  <span className="text-lg leading-tight">{cur}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-kw-text-dim">{s.desc}</div>
                  {allocated > 0 && (
                    <div className="text-[10px] text-kw-blue-deep mt-0.5">
                      +{allocated} จาก base
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    className="btn btn-sm"
                    disabled={busy || game.unspentPoints < 1}
                    onClick={() => spend(s.id, 1)}
                  >
                    +1
                  </button>
                  <button
                    className="btn btn-sm btn-blue"
                    disabled={busy || game.unspentPoints < 5}
                    onClick={() => spend(s.id, 5)}
                  >
                    +5
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Derived combat stats — live preview */}
        <div className="bg-kw-panel rounded-lg p-3 text-xs">
          <div className="font-bold text-sm mb-2">⚡ ค่าคอมแบต</div>
          <DerivedRow label="HP สูงสุด"  value={derived.maxHp} />
          <DerivedRow label="MP สูงสุด"  value={derived.maxMp} />
          <DerivedRow label="pATK"       value={derived.pAtk} />
          <DerivedRow label="mATK"       value={derived.mAtk} />
          <DerivedRow label="pDEF"       value={derived.pDef} />
          <DerivedRow label="mDEF"       value={derived.mDef} />
          <DerivedRow label="ACC"        value={derived.acc} />
          <DerivedRow label="DODGE"      value={derived.dodge} />
          <DerivedRow label="CRIT%"      value={derived.crit} />
          <DerivedRow label="SPD"        value={derived.spd} />
        </div>
      </div>

      {/* Reset bar */}
      <div className="mt-3 pt-3 border-t border-kw-border flex items-center justify-between gap-3">
        <div className="text-xs text-kw-text-dim">
          รีเซ็ตจะคืน point ทั้งหมดให้กระจายใหม่ ({(game.lv - 1) * 5} pts สูงสุด)
        </div>
        {!confirmReset ? (
          <button className="btn btn-pink btn-sm" disabled={busy}
            onClick={() => setConfirmReset(true)}>
            🔄 รีเซ็ตสเตตัส
          </button>
        ) : (
          <div className="flex gap-1">
            <button className="btn btn-red btn-sm" disabled={busy} onClick={doReset}>
              ยืนยัน
            </button>
            <button className="btn btn-ghost btn-sm" disabled={busy}
              onClick={() => setConfirmReset(false)}>
              ยกเลิก
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function DerivedRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-kw-text-dim">{label}</span>
      <b>{value}</b>
    </div>
  )
}
