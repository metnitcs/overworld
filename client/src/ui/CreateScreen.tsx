import { useState } from 'react'
import { useGame } from '../game/store'
import {
  CLASSES, STARTER_RACE, TRANSCEND_LV,
  STAT_BASE, BASE_HP, BASE_MP,
  type PrimaryStat, type StatModifier,
} from '@asura/shared'

// Slice 17: race is auto-set to STARTER_RACE (มนุษย์) at creation. The Lv10
// race-change quest is where the player picks มนุษย์/มาร/เทพ. Create flow
// now only asks for class + name.

export function CreateScreen() {
  const [classId, setClassId] = useState(CLASSES[0].id)
  const [name, setName] = useState('')
  const newCharacter = useGame(s => s.newCharacter)
  const setScreen = useGame(s => s.setScreen)
  const characters = useGame(s => s.characters)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const selectedClass = CLASSES.find(c => c.id === classId)!

  async function confirm() {
    setBusy(true)
    setErr(null)
    try {
      await newCharacter(name.trim() || 'นักผจญภัย', classId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'สร้างไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mochi mochi-create-shell">
      <div className="create-head">
        <div>
          <h1>สร้างตัวละครใหม่</h1>
          <div className="sub" style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>
            ทุกตัวเริ่มต้นเป็น <b>{STARTER_RACE.name}</b> {STARTER_RACE.emoji} —
            ถึง Lv {TRANSCEND_LV} จะได้ทำเควสเปลี่ยนเผ่าเป็น <b>มาร</b> หรือ <b>เทพ</b>
          </div>
        </div>
        <div className="hero-eyebrow">เซิร์ฟเวอร์ ซากุระ</div>
      </div>

      <div className="create-body">
        {/* Preview — Slice 25: race modifier folded into Lv1 primary stats */}
        <aside className="preview-card">
          <div className="preview-art">
            {STARTER_RACE.emoji}
          </div>
          <div className="preview-name">{STARTER_RACE.name}</div>
          <div className="preview-sub">{selectedClass.emoji} {selectedClass.name}</div>
          {/* Starter race is human → modifiers={} so all primary stats = STAT_BASE */}
          <div className="preview-stats">
            <div className="stat"><span className="k">HP</span><span className="v">{BASE_HP + STAT_BASE * 10}</span></div>
            <div className="stat"><span className="k">MP</span><span className="v">{BASE_MP + STAT_BASE * 3}</span></div>
            <div className="stat"><span className="k">pATK</span><span className="v">{STAT_BASE * 2}</span></div>
            <div className="stat"><span className="k">mATK</span><span className="v">{STAT_BASE * 2}</span></div>
            <div className="stat"><span className="k">pDEF</span><span className="v">{Math.floor(STAT_BASE * 0.5)}</span></div>
            <div className="stat"><span className="k">สกิล</span><span className="v" style={{ fontSize: 12 }}>{selectedClass.skill.name}</span></div>
          </div>
          <div style={{ fontSize: 11, marginTop: 8, color: 'var(--muted)', lineHeight: 1.5 }}>
            ทุกตัวเริ่ม STR/INT/DEX/AGI/LUK/VIT = <b>{STAT_BASE}</b> เท่ากัน
            <br />Lv up = +5 points ให้กระจายเอง
          </div>
        </aside>

        {/* Class picker — Slice 25: show growth recommendation instead of legacy atk/def offsets */}
        <section className="picker-card" style={{ gridColumn: 'span 2' }}>
          <div className="picker-head">เลือกอาชีพ</div>
          <div className="picker-list">
            {CLASSES.map(c => (
              <div
                key={c.id}
                className={`pick-row ${classId === c.id ? 'selected' : ''}`}
                onClick={() => setClassId(c.id)}
              >
                <div className="emoji">{c.emoji}</div>
                <div className="info">
                  <div className="nm">{c.name}</div>
                  <div className="ds">{c.desc}</div>
                  <ClassGrowthHint growth={c.growth} skillName={c.skill.name} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {err && (
        <div className="text-sm" style={{ color: '#dc2626' }} role="alert">{err}</div>
      )}

      <div className="create-footer">
        <label>ชื่อ</label>
        <input
          className="name"
          placeholder="พิมพ์ชื่อตัวละคร (ไม่เกิน 12 ตัว)"
          maxLength={12}
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={busy}
        />
        <button
          className="btn btn-secondary"
          onClick={() => setScreen(characters.length > 0 ? 'character-select' : 'title')}
          disabled={busy}
        >
          ← กลับ
        </button>
        <button className="btn btn-primary" onClick={confirm} disabled={busy}>
          {busy ? 'กำลังสร้าง…' : 'ยืนยัน เริ่มผจญภัย'} <span className="arrow">→</span>
        </button>
      </div>
    </div>
  )
}

/** Slice 25 hint: list which stats this class's growth weights prefer.
 *  Purely advisory — does NOT auto-allocate. Helps newcomers know what to
 *  pump when they get their first level-up points. */
const STAT_LABEL: Record<PrimaryStat, string> = {
  str: 'STR', int: 'INT', dex: 'DEX', agi: 'AGI', luk: 'LUK', vit: 'VIT',
}
const STATS_ORDER: PrimaryStat[] = ['str', 'int', 'dex', 'agi', 'luk', 'vit']
function ClassGrowthHint({
  growth, skillName,
}: { growth: StatModifier; skillName: string }) {
  // Sort by weight desc so the biggest recommendations show first.
  const rec = STATS_ORDER
    .map((k) => [k, growth[k] ?? 0] as const)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
  return (
    <div style={{ fontSize: 10, color: 'var(--muted-2)', marginTop: 2 }}>
      สกิล: <b>{skillName}</b>
      {rec.length > 0 && (
        <> · แนะนำเทใส่: {rec.map(([k, v]) => `${STAT_LABEL[k]}×${v}`).join(' / ')}</>
      )}
    </div>
  )
}
