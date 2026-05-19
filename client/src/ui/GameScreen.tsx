import { useEffect } from 'react'
import { useGame, seedChat } from '../game/store'
import { MAPS, RACES, CLASSES, expForLv } from '../game/data'
import { PhaserGame } from '../game/PhaserGame'
import { ChatPanel } from './ChatPanel'

export function GameScreen() {
  const game = useGame(s => s.game)
  const setModal = useGame(s => s.setModal)
  const setScreen = useGame(s => s.setScreen)
  const saveToStorage = useGame(s => s.saveToStorage)
  const chat = useGame(s => s.chat)
  const map = MAPS[game.map]
  const race = RACES.find(r => r.id === game.raceId)!
  const cls = CLASSES.find(c => c.id === game.classId)!
  const expNeed = expForLv(game.lv)

  useEffect(() => {
    if (chat.length === 0) seedChat()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-b from-kw-cream to-kw-cream-2">
      {/* TOP BAR */}
      <div className="top-bar">
        <span className="font-bold">{map.name}</span>
        <span className="text-kw-yellow">[ Asura Server x 1 ]</span>
        <span>Map ({game.px}, {game.py})</span>
      </div>

      {/* Main area: map on left, chat on right */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map (Phaser) */}
        <div className="flex-1 relative bg-black/5 border-r-2 border-kw-border-2 overflow-hidden">
          <PhaserGame className="w-full h-full" />
          <div className="absolute top-2 left-2 panel px-2 py-1 text-[11px] text-kw-blue-deep font-semibold">
            ⬆⬇⬅➡ / WASD · ชนมอน = ต่อสู้ · 🌀 = วาปแมพ
          </div>
        </div>

        {/* Right side panel */}
        <div className="w-72 flex flex-col gap-2 p-2 bg-gradient-to-b from-kw-panel to-kw-panel-2 border-l-2 border-kw-border-2 overflow-hidden">
          {/* Character card */}
          <div className="panel panel-pad">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-10 h-10 rounded-full bg-white border-2 border-kw-border flex items-center justify-center text-2xl shrink-0">
                {race.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-kw-blue-deep font-bold text-sm truncate">
                  {game.name} 👑 <span className="text-kw-orange">Lv {game.lv}</span>
                </div>
                <div className="text-[10px] text-kw-text-dim">{race.name} · {cls.name}</div>
              </div>
            </div>
            <div className="relative">
              <div className="bar"><div className="bar-fill bg-gradient-to-b from-red-300 to-kw-hp" style={{ width: `${(game.hp / game.maxHp) * 100}%` }} /><div className="bar-label">HP {game.hp}/{game.maxHp}</div></div>
              <div className="bar"><div className="bar-fill bg-gradient-to-b from-blue-300 to-kw-mp" style={{ width: `${(game.mp / game.maxMp) * 100}%` }} /><div className="bar-label">MP {game.mp}/{game.maxMp}</div></div>
              <div className="bar"><div className="bar-fill bg-gradient-to-b from-yellow-200 to-kw-exp" style={{ width: `${(game.exp / expNeed) * 100}%` }} /><div className="bar-label">EXP {game.exp}/{expNeed}</div></div>
            </div>
          </div>

          {/* Stats + gold */}
          <div className="panel panel-pad">
            <div className="grid grid-cols-2 gap-x-2 text-xs">
              <div className="stat-row"><span className="label">⚔ ATK</span><span className="val">{game.atk}</span></div>
              <div className="stat-row"><span className="label">🛡 DEF</span><span className="val">{game.def}</span></div>
              <div className="stat-row"><span className="label">⚡ SPD</span><span className="val">{game.spd}</span></div>
              <div className="stat-row"><span className="label">💰</span><span className="val">{game.gold.toLocaleString()} พีซ</span></div>
            </div>
          </div>

          {/* Action button grid (round icons like DMO) */}
          <div className="panel panel-pad">
            <div className="panel-title">เมนู</div>
            <div className="grid grid-cols-4 gap-2 justify-items-center">
              <ActionBtn icon="🎒" label="กระเป๋า" color=""        onClick={() => setModal('inventory')} />
              <ActionBtn icon="⚒"  label="คราฟ"   color="blue"    onClick={() => setModal('craft')} />
              <ActionBtn icon="✨" label="ตีบวก" color="pink"    onClick={() => setModal('enhance')} />
              <ActionBtn icon="🔄" label="เปลี่ยนอาชีพ" color="green" onClick={() => setModal('class-change')} />
              <ActionBtn icon="💊" label="ร้านค้า" color="purple"  onClick={() => setModal('shop')} />
              <ActionBtn icon="❓" label="วิธีเล่น" color=""       onClick={() => setModal('help')} />
              <ActionBtn icon="💾" label="บันทึก"  color="blue"   onClick={saveToStorage} />
              <ActionBtn icon="🚪" label="ออก"     color="pink"   onClick={() => setScreen('title')} />
            </div>
          </div>

          {/* Chat */}
          <div className="panel flex-1 flex flex-col overflow-hidden">
            <div className="px-2 pt-1.5 panel-title flex items-center gap-2">
              💬 แชท
              <span className="text-[9px] text-kw-text-dim font-normal">(ตัวอย่าง)</span>
            </div>
            <ChatPanel />
          </div>
        </div>
      </div>
    </div>
  )
}

function ActionBtn(props: {
  icon: string
  label: string
  color: '' | 'blue' | 'pink' | 'green' | 'purple'
  onClick: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button className={`icon-btn ${props.color}`} onClick={props.onClick}>
        {props.icon}
      </button>
      <span className="text-[9px] text-kw-text-dim font-semibold">{props.label}</span>
    </div>
  )
}
