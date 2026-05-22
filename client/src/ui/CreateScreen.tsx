import { useState } from 'react'
import { useGame, useRaces, useClasses } from '../game/store'
import {
  TRANSCEND_LV, CLASS_CHANGE_LV,
  STAT_BASE, BASE_HP, BASE_MP,
} from '@asura/shared'

// Slice 17: race is auto-set to starterRace at creation.
// Slice 26: class ALSO auto-set to starterClass ('Adventurer'). The Lv 5
// class-change quest is where the player picks the advanced class; the
// Lv 10 race-change quest is where they pick the advanced race. Create
// flow now only asks for a NAME.

export function CreateScreen() {
  const [name, setName] = useState('')
  const newCharacter = useGame(s => s.newCharacter)
  const setScreen = useGame(s => s.setScreen)
  const characters = useGame(s => s.characters)
  const races = useRaces()
  const classes = useClasses()
  const starterRace = races.find((r) => r.starter)
  const starterClass = classes.find((c) => c.starter)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (!starterRace || !starterClass) {
    return <div className="mochi mochi-create-shell">รอโหลด content…</div>
  }

  async function confirm() {
    setBusy(true)
    setErr(null)
    try {
      // classId arg is ignored server-side now (Slice 26); pass starterClass
      // for clarity. Server forces starterRace + starterClass anyway.
      await newCharacter(name.trim() || 'นักผจญภัย', starterClass?.id ?? 'adventurer')
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
            ทุกตัวเริ่มต้นเป็น <b>{starterRace.name}</b> {starterRace.emoji} +
            อาชีพ <b>{starterClass.name}</b> {starterClass.emoji}
            <br />
            <span style={{ fontSize: 11 }}>
              • Lv {TRANSCEND_LV} → เลือกเผ่า (มนุษย์ / มาร / เทพ)
              <br />
              • Lv {CLASS_CHANGE_LV} → เลือกอาชีพสุดท้าย (2 ตัวเลือกตามเผ่า)
            </span>
          </div>
        </div>
        <div className="hero-eyebrow">เซิร์ฟเวอร์ ซากุระ</div>
      </div>

      <div className="create-body">
        {/* Preview */}
        <aside className="preview-card">
          <div className="preview-art">
            {starterRace.emoji}
          </div>
          <div className="preview-name">{starterRace.name}</div>
          <div className="preview-sub">{starterClass.emoji} {starterClass.name}</div>
          {/* All starter chars share the same Lv1 numbers (race modifiers={} + STAT_BASE) */}
          <div className="preview-stats">
            <div className="stat"><span className="k">HP</span><span className="v">{BASE_HP + STAT_BASE * 10}</span></div>
            <div className="stat"><span className="k">MP</span><span className="v">{BASE_MP + STAT_BASE * 3}</span></div>
            <div className="stat"><span className="k">pATK</span><span className="v">{STAT_BASE * 2}</span></div>
            <div className="stat"><span className="k">mATK</span><span className="v">{STAT_BASE * 2}</span></div>
            <div className="stat"><span className="k">pDEF</span><span className="v">{Math.floor(STAT_BASE * 0.5)}</span></div>
            <div className="stat"><span className="k">สกิล</span><span className="v" style={{ fontSize: 12 }}>{starterClass.skill.name}</span></div>
          </div>
          <div style={{ fontSize: 11, marginTop: 8, color: 'var(--muted)', lineHeight: 1.5 }}>
            ทุก stat เริ่ม <b>{STAT_BASE}</b> เท่ากัน
            <br />Lv up = +5 points ให้กระจายเอง
          </div>
        </aside>

        {/* No class picker anymore — class is auto + changes via Lv5 quest */}
        <section className="picker-card" style={{ gridColumn: 'span 2' }}>
          <div className="picker-head">📜 บทเริ่มต้น</div>
          <div style={{ padding: 12, fontSize: 13, lineHeight: 1.7, color: 'var(--muted)' }}>
            ทุกการผจญภัยเริ่มจากศูนย์ คุณคือ <b>{starterClass.name}</b> {starterClass.emoji}
            สมาชิกใหม่ของหมู่บ้าน — ไม่มีพรสวรรค์พิเศษ ไม่มีตำแหน่งสำคัญ
            เพียงสกิลพื้นฐาน <b>{starterClass.skill.name}</b> และความตั้งใจที่จะเติบโต
            <br /><br />
            ออกล่ามอนสเตอร์ในแมพข้างหมู่บ้านเก็บ EXP — ถึง Lv {TRANSCEND_LV}
            จะได้เลือกเผ่า (มนุษย์ / มาร / เทพ) แล้วโตต่อจนถึง Lv {CLASS_CHANGE_LV}
            เลือกอาชีพสุดท้าย (สายละ 2 อาชีพ) ทุกการตัดสินใจติดตัวคุณตลอด
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
