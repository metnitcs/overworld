import { useState } from 'react'
import { useGame } from '../game/store'
import { RACES, CLASSES } from '@asura/shared'

// Character Creation lives in the Mochi design system (pre-game surface)
// but unlike the Portal it stays inside the App shell's fixed 1280×860 frame
// because it's a focused single-step UI, not a scrolling page.
// See docs/adr/0001-dual-design-system-pre-game-vs-in-game.md.

export function CreateScreen() {
  const [raceId, setRaceId] = useState(RACES[0].id)
  const [classId, setClassId] = useState(CLASSES[0].id)
  const [name, setName] = useState('')
  const newCharacter = useGame(s => s.newCharacter)
  const setScreen = useGame(s => s.setScreen)

  const selectedRace = RACES.find(r => r.id === raceId)!
  const selectedClass = CLASSES.find(c => c.id === classId)!

  function confirm() {
    newCharacter(name.trim() || 'นักผจญภัย', raceId, classId)
  }

  return (
    <div className="mochi mochi-create-shell">
      <div className="create-head">
        <div>
          <h1>สร้างตัวละครใหม่</h1>
          <div className="sub" style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>
            เลือกเผ่าและอาชีพ แล้วตั้งชื่อตัวละครของคุณ · ขั้นตอน 1 จาก 1
          </div>
        </div>
        <div className="hero-eyebrow">เซิร์ฟเวอร์ ซากุระ</div>
      </div>

      <div className="create-body">
        {/* Preview */}
        <aside className="preview-card">
          <div className="preview-art">
            {selectedRace.emoji}
          </div>
          <div className="preview-name">{selectedRace.name}</div>
          <div className="preview-sub">{selectedClass.emoji} {selectedClass.name}</div>
          <div className="preview-stats">
            <div className="stat"><span className="k">HP</span><span className="v">{selectedRace.hp}</span></div>
            <div className="stat"><span className="k">MP</span><span className="v">{selectedRace.mp + selectedClass.mp}</span></div>
            <div className="stat"><span className="k">ATK</span><span className="v">{selectedRace.atk + selectedClass.atk}</span></div>
            <div className="stat"><span className="k">DEF</span><span className="v">{selectedRace.def + selectedClass.def}</span></div>
            <div className="stat"><span className="k">SPD</span><span className="v">{selectedRace.spd + selectedClass.spd}</span></div>
            <div className="stat"><span className="k">สกิล</span><span className="v" style={{ fontSize: 12 }}>{selectedClass.skill.name}</span></div>
          </div>
        </aside>

        {/* Race picker */}
        <section className="picker-card">
          <div className="picker-head">เลือกเผ่า</div>
          <div className="picker-list">
            {RACES.map(r => (
              <div
                key={r.id}
                className={`pick-row ${raceId === r.id ? 'selected' : ''}`}
                onClick={() => setRaceId(r.id)}
              >
                <div className="emoji">{r.emoji}</div>
                <div className="info">
                  <div className="nm">{r.name}</div>
                  <div className="ds">{r.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Class picker */}
        <section className="picker-card">
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
                  <div className="ds">สกิล: {c.skill.name} · ATK+{c.atk} DEF+{c.def}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="create-footer">
        <label>ชื่อ</label>
        <input
          className="name"
          placeholder="พิมพ์ชื่อตัวละคร (ไม่เกิน 12 ตัว)"
          maxLength={12}
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <button className="btn btn-secondary" onClick={() => setScreen('title')}>← กลับ</button>
        <button className="btn btn-primary" onClick={confirm}>
          ยืนยัน เริ่มผจญภัย <span className="arrow">→</span>
        </button>
      </div>
    </div>
  )
}
