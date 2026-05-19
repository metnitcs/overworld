import { useGame } from '../game/store'

export function TitleScreen() {
  const setScreen = useGame(s => s.setScreen)
  const loadFromStorage = useGame(s => s.loadFromStorage)
  const hasSave = useGame(s => s.hasSave)
  const setModal = useGame(s => s.setModal)

  return (
    <div className="w-full h-full bg-gradient-to-b from-kw-cream to-kw-cream-2 flex flex-col items-center justify-center relative overflow-hidden">
      {/* Decorative clouds */}
      <div className="absolute inset-0 pointer-events-none opacity-80">
        <div className="absolute top-10 left-10 text-5xl">☁️</div>
        <div className="absolute top-32 right-16 text-4xl">☁️</div>
        <div className="absolute bottom-10 left-20 text-3xl">🌸</div>
        <div className="absolute bottom-20 right-32 text-3xl">🌿</div>
        <div className="absolute top-20 right-1/3 text-2xl">⭐</div>
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <div className="text-7xl font-bold title-logo tracking-wider drop-shadow-lg">
          อสูรเว็บ
        </div>
        <div className="text-2xl text-kw-blue-deep font-semibold tracking-[0.4em] mt-2">
          O N L I N E
        </div>
        <div className="text-sm text-kw-text-dim mt-2 italic">
          เกม MMORPG เล่นบนเว็บ — Beta 0.2 (React + Phaser)
        </div>

        <div className="mt-12 flex flex-col gap-3 w-64">
          <button
            className="btn text-lg py-3"
            onClick={() => setScreen('create')}
          >
            ▶ เริ่มเกมใหม่
          </button>
          <button
            className="btn btn-blue text-lg py-3"
            onClick={loadFromStorage}
            disabled={!hasSave}
          >
            📂 โหลดเซฟ
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => setModal('help')}
          >
            ❓ วิธีเล่น
          </button>
        </div>

        <div className="absolute bottom-[-100px] text-xs text-kw-text-dim text-center w-full">
          ได้แรงบันดาลใจจากเกมเว็บไทยสไตล์ดั้งเดิม · กราฟิกและโค้ดสร้างใหม่หมด
        </div>
      </div>
    </div>
  )
}
