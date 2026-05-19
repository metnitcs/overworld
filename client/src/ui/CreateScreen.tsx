import { useState } from 'react'
import { useGame } from '../game/store'
import { RACES, CLASSES } from '../game/data'

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
    <div className="w-full h-full bg-gradient-to-b from-kw-cream to-kw-cream-2 p-4 flex flex-col">
      {/* Top header */}
      <div className="top-bar rounded-t-xl">
        <span>สร้างตัวละครใหม่</span>
        <span className="opacity-80">[ ตัวอย่างเซิร์ฟ Asura x 1 ]</span>
        <span>ขั้นตอน: 1/2</span>
      </div>

      <div className="flex-1 panel rounded-t-none p-4 flex gap-4 overflow-hidden">
        {/* Preview */}
        <div className="w-64 panel panel-pad bg-gradient-to-b from-white to-kw-panel-in flex flex-col items-center justify-center">
          <div className="text-7xl mb-3 animate-bounce2">
            {selectedRace.emoji}
          </div>
          <div className="text-2xl">{selectedClass.emoji}</div>
          <div className="text-kw-blue-deep font-bold mt-3">{selectedRace.name}</div>
          <div className="text-kw-text-dim text-sm">{selectedClass.name}</div>
          <div className="mt-4 w-full text-xs space-y-0.5">
            <div className="stat-row"><span className="label">HP</span><span className="val">{selectedRace.hp}</span></div>
            <div className="stat-row"><span className="label">MP</span><span className="val">{selectedRace.mp + selectedClass.mp}</span></div>
            <div className="stat-row"><span className="label">ATK</span><span className="val">{selectedRace.atk + selectedClass.atk}</span></div>
            <div className="stat-row"><span className="label">DEF</span><span className="val">{selectedRace.def + selectedClass.def}</span></div>
            <div className="stat-row"><span className="label">SPD</span><span className="val">{selectedRace.spd + selectedClass.spd}</span></div>
            <div className="stat-row"><span className="label">สกิล</span><span className="val text-[10px]">{selectedClass.skill.name}</span></div>
          </div>
        </div>

        {/* Race + Class lists */}
        <div className="flex-1 grid grid-cols-2 gap-3 overflow-hidden">
          <div className="panel panel-pad overflow-y-auto">
            <div className="panel-title">เลือกเผ่า</div>
            <div className="grid grid-cols-1 gap-1.5">
              {RACES.map(r => (
                <div
                  key={r.id}
                  className={`option-card ${raceId === r.id ? 'selected' : ''}`}
                  onClick={() => setRaceId(r.id)}
                >
                  <div className="text-3xl">{r.emoji}</div>
                  <div className="flex-1">
                    <div className="font-bold text-kw-blue-deep text-sm">{r.name}</div>
                    <div className="text-[10px] text-kw-text-dim">{r.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel panel-pad overflow-y-auto">
            <div className="panel-title">เลือกอาชีพ</div>
            <div className="grid grid-cols-1 gap-1.5">
              {CLASSES.map(c => (
                <div
                  key={c.id}
                  className={`option-card ${classId === c.id ? 'selected' : ''}`}
                  onClick={() => setClassId(c.id)}
                >
                  <div className="text-3xl">{c.emoji}</div>
                  <div className="flex-1">
                    <div className="font-bold text-kw-blue-deep text-sm">{c.name}</div>
                    <div className="text-[10px] text-kw-text-dim">
                      สกิล: {c.skill.name} · ATK+{c.atk} DEF+{c.def}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="panel mt-3 p-3 flex gap-3 items-center">
        <label className="text-sm font-semibold text-kw-blue-deep">ชื่อ:</label>
        <input
          className="name-input flex-1"
          placeholder="พิมพ์ชื่อตัวละคร (ไม่เกิน 12 ตัว)"
          maxLength={12}
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <button className="btn-ghost btn btn-sm" onClick={() => setScreen('title')}>← กลับ</button>
        <button className="btn" onClick={confirm}>ยืนยัน เริ่มผจญภัย!</button>
      </div>
    </div>
  )
}
