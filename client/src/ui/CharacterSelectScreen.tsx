import { useState } from 'react'
import { useGame } from '../game/store'
import { useRaces, useClasses } from '../game/store'

/** Slice 16: character roster grid. Lands here after login when the player
 *  owns 1+ characters. Empty slots create new chars; filled slots can be
 *  played or deleted. The 3-slot cap mirrors `CHARACTER_SLOT_LIMIT`. */
export function CharacterSelectScreen() {
  const characters = useGame((s) => s.characters)
  const slotLimit = useGame((s) => s.slotLimit)
  const selectCharacter = useGame((s) => s.selectCharacter)
  const removeCharacter = useGame((s) => s.removeCharacter)
  const setScreen = useGame((s) => s.setScreen)
  const logout = useGame((s) => s.logout)
  const username = useGame((s) => s.username)
  const role = useGame((s) => s.role)
  const races = useRaces()
  const classes = useClasses()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const slots = Array.from({ length: slotLimit }, (_, i) => characters[i] ?? null)

  async function play(id: string) {
    setBusy(true)
    try {
      await selectCharacter(id)
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete(id: string) {
    setBusy(true)
    try {
      await removeCharacter(id)
    } finally {
      setBusy(false)
      setDeletingId(null)
    }
  }

  return (
    <div className="mochi mochi-create-shell" style={{ overflow: 'auto' }}>
      <div className="create-head">
        <div>
          <h1>เลือกตัวละคร</h1>
          <div className="sub" style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>
            สวัสดี <b>{username ?? 'ผู้กล้า'}</b> — มี {characters.length}/{slotLimit} ตัว
            (เพิ่มช่องสร้างได้ผ่าน "ไอเทมขยายช่อง" ในอนาคต)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {role === 'ADMIN' && (
            <button
              className="btn"
              style={{ background: '#7c3aed', color: '#fff' }}
              onClick={() => setScreen('admin')}
            >
              🛠 Admin Panel
            </button>
          )}
          <button className="btn btn-secondary" onClick={logout}>ออกจากระบบ</button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
          marginTop: 16,
        }}
      >
        {slots.map((char, i) => {
          if (!char) {
            return (
              <div
                key={`empty-${i}`}
                className="panel"
                style={{
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 240,
                  borderStyle: 'dashed',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.6 : 1,
                }}
                onClick={() => !busy && setScreen('create')}
              >
                <div style={{ fontSize: 48, opacity: 0.4 }}>＋</div>
                <div style={{ marginTop: 8, fontWeight: 600, color: 'var(--muted)' }}>
                  สร้างตัวละครใหม่
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 4 }}>
                  ช่องที่ {i + 1}
                </div>
              </div>
            )
          }

          const race = races.find((r) => r.id === char.raceId)
          const cls = classes.find((c) => c.id === char.classId)
          const isDeleting = deletingId === char.id

          return (
            <div
              key={char.id}
              className="panel"
              style={{ padding: 16, minHeight: 240, display: 'flex', flexDirection: 'column' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, var(--accent-soft, #fde7f3), #ede9fe)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 40,
                    flexShrink: 0,
                  }}
                >
                  {race?.emoji ?? '🧑'}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {char.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {race?.name ?? char.raceId} · {cls?.name ?? char.classId}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    <span style={{ fontWeight: 700, color: 'var(--accent, #db2777)' }}>Lv {char.lv}</span>
                    {char.transcended && (
                      <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--good, #10b981)' }}>
                        ✨ เปลี่ยนเผ่าแล้ว
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, lineHeight: 1.6 }}>
                💰 {char.gold.toLocaleString()} พีซ · 🗺 {char.map} ({char.px}, {char.py})
                <br />
                ⚔ ATK {char.atk} · 🛡 DEF {char.def} · ⚡ SPD {char.spd}
              </div>

              <div style={{ flex: 1 }} />

              {!isDeleting ? (
                <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={() => play(char.id)}
                    disabled={busy}
                  >
                    เล่นต่อ →
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setDeletingId(char.id)}
                    disabled={busy}
                    aria-label="ลบตัวละคร"
                  >
                    🗑
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--accent-2, #be185d)', marginBottom: 6 }}>
                    ลบ <b>{char.name}</b> ถาวร? ไม่สามารถกู้คืนได้
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn"
                      style={{ background: '#dc2626', color: '#fff', flex: 1 }}
                      onClick={() => confirmDelete(char.id)}
                      disabled={busy}
                    >
                      {busy ? 'กำลังลบ…' : 'ใช่, ลบเลย'}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setDeletingId(null)}
                      disabled={busy}
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
