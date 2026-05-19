import { useEffect, useRef, useState } from 'react'
import { useGame } from '../game/store'
import { CLASSES, RACES, ITEMS } from '../game/data'
import { resolveAttack } from '../game/logic/combat'

interface FloatNum {
  id: number
  target: 'player' | 'enemy'
  text: string
  color: string
}

let floatSeq = 1

export function BattleScreen() {
  const game = useGame(s => s.game)
  const battle = useGame(s => s.battle)
  const battleLog = useGame(s => s.battleLog)
  const setBattleTurn = useGame(s => s.setBattleTurn)
  const battleDamage = useGame(s => s.battleDamage)
  const battleHeal = useGame(s => s.battleHeal)
  const spendMp = useGame(s => s.spendMp)
  const endBattle = useGame(s => s.endBattle)
  const useConsume = useGame(s => s.useConsume)
  const pushBattleLog = useGame(s => s.pushBattleLog)
  const setScreen = useGame(s => s.setScreen)
  const [floats, setFloats] = useState<FloatNum[]>([])
  const playerRef = useRef<HTMLDivElement>(null)
  const enemyRef = useRef<HTMLDivElement>(null)
  const [shakePlayer, setShakePlayer] = useState(false)
  const [shakeEnemy, setShakeEnemy] = useState(false)

  const race = RACES.find(r => r.id === game.raceId)!
  const cls = CLASSES.find(c => c.id === game.classId)!

  if (!battle) {
    return <div className="w-full h-full flex items-center justify-center">กำลังโหลด...</div>
  }
  const { enemy, turn, finished } = battle
  const canControl = turn === 'player' && !finished

  function addFloat(target: 'player' | 'enemy', text: string, color: string) {
    const id = floatSeq++
    setFloats(prev => [...prev, { id, target, text, color }])
    setTimeout(() => setFloats(prev => prev.filter(f => f.id !== id)), 1000)
  }

  // Damage resolution lives in the pure, tested logic module (server-authoritative
  // candidate per PLAN.md). This is a thin delegation preserving the call sites.
  function damageCalc(att: number, def: number, mult = 1) {
    return resolveAttack(att, def, { mult, rng: Math.random })
  }

  function attack() {
    if (!canControl) return
    const { dmg, crit } = damageCalc(game.atk, enemy.def)
    battleDamage('enemy', dmg)
    setShakeEnemy(true); setTimeout(() => setShakeEnemy(false), 400)
    addFloat('enemy', crit ? `💥 ${dmg}` : String(dmg), crit ? '#ff3333' : '#ffffff')
    pushBattleLog(`⚔ ${game.name} โจมตี → ${dmg}${crit ? ' (คริ!)' : ''}`)
    if (enemy.hp - dmg <= 0) {
      endBattle(true)
      return
    }
    enemyTurn()
  }

  function skill() {
    if (!canControl) return
    if (game.mp < cls.skill.mp) {
      pushBattleLog(`MP ไม่พอ (ต้อง ${cls.skill.mp})`)
      return
    }
    spendMp(cls.skill.mp)
    if (cls.skill.type === 'heal') {
      const heal = Math.floor(game.maxHp * 0.4 + game.atk * 1.5)
      battleHeal('player', heal)
      addFloat('player', `+${heal}`, '#2dc653')
      pushBattleLog(`✨ ${cls.skill.name}! ฟื้น HP ${heal}`)
    } else {
      const { dmg, crit } = damageCalc(game.atk, enemy.def, cls.skill.mult)
      battleDamage('enemy', dmg)
      setShakeEnemy(true); setTimeout(() => setShakeEnemy(false), 400)
      const color = cls.skill.type === 'magic' ? '#9b5bd6' : cls.skill.type === 'holy' ? '#ffd23f' : '#ff5555'
      addFloat('enemy', `✨ ${dmg}`, color)
      pushBattleLog(`✨ ${cls.skill.name} → ${dmg}${crit ? ' (คริ!)' : ''}`)
      if (enemy.hp - dmg <= 0) {
        endBattle(true)
        return
      }
    }
    enemyTurn()
  }

  function useItem() {
    if (!canControl) return
    const keys = Object.keys(game.inventory).filter(k => ITEMS[k]?.type === 'consume' && game.inventory[k] > 0)
    if (keys.length === 0) {
      pushBattleLog('ไม่มีไอเทมใช้ได้!')
      return
    }
    const key = keys[0]
    const it = ITEMS[key]
    useConsume(key)
    if (it.heal) addFloat('player', `+${it.heal}`, '#2dc653')
    if (it.healMp) addFloat('player', `+${it.healMp} MP`, '#4f8ed6')
    pushBattleLog(`🧪 ใช้ ${it.name}`)
    enemyTurn()
  }

  function run() {
    if (finished) return
    const chance = 0.5 + (game.spd - enemy.spd) * 0.05
    if (Math.random() < chance) {
      pushBattleLog('🏃 หนีสำเร็จ!')
      useGame.setState({ battle: { enemy, turn, finished: true } })
      setTimeout(() => {
        useGame.setState({ battle: null, battleLog: [], screen: 'game' })
      }, 800)
    } else {
      pushBattleLog('💨 หนีไม่ทัน!')
      enemyTurn()
    }
  }

  function enemyTurn() {
    setBattleTurn('enemy')
    setTimeout(() => {
      const { dmg, crit } = damageCalc(enemy.atk, game.def)
      battleDamage('player', dmg)
      setShakePlayer(true); setTimeout(() => setShakePlayer(false), 400)
      addFloat('player', crit ? `💥 ${dmg}` : String(dmg), crit ? '#ff3333' : '#ffffff')
      pushBattleLog(`👹 ${enemy.name} โจมตี → ${dmg}${crit ? ' (คริ!)' : ''}`)
      if (game.hp - dmg <= 0) {
        endBattle(false)
        return
      }
      setBattleTurn('player')
    }, 700)
  }

  return (
    <div className="w-full h-full battle-bg flex flex-col p-3">
      {/* Top bar like DMO */}
      <div className="top-bar rounded-xl">
        <span className="flex items-center gap-2">
          ⚔️ ลานประลองกับมอนสเตอร์
        </span>
        <div className="flex items-center gap-1">
          <span className="icon-btn !w-7 !h-7 text-base">⚔️</span>
          <span className="icon-btn blue !w-7 !h-7 text-base">🧪</span>
          <span className="icon-btn green !w-7 !h-7 text-base">A</span>
        </div>
        <span>Lv {enemy.lv} {enemy.emoji}</span>
      </div>

      {/* Arena */}
      <div className="flex-1 relative flex items-center justify-around panel mt-2 p-4 overflow-hidden">
        {/* Player side */}
        <div
          ref={playerRef}
          className={`flex flex-col items-center bg-gradient-to-b from-white to-kw-panel-in border-2 border-kw-border rounded-xl p-3 min-w-[170px] relative ${shakePlayer ? 'animate-hitshake' : ''}`}
        >
          <div className="text-7xl mb-1">{race.emoji}</div>
          <div className="text-3xl absolute right-3 top-3">{cls.emoji}</div>
          <div className="font-bold text-kw-blue-deep text-sm">{game.name}</div>
          <div className="text-[10px] text-kw-text-dim mb-1">Lv {game.lv} · {cls.name}</div>
          <div className="w-full">
            <div className="bar"><div className="bar-fill bg-gradient-to-b from-red-300 to-kw-hp" style={{ width: `${(game.hp / game.maxHp) * 100}%` }} /><div className="bar-label">HP {game.hp}/{game.maxHp}</div></div>
            <div className="bar"><div className="bar-fill bg-gradient-to-b from-blue-300 to-kw-mp" style={{ width: `${(game.mp / game.maxMp) * 100}%` }} /><div className="bar-label">MP {game.mp}/{game.maxMp}</div></div>
          </div>
          {floats.filter(f => f.target === 'player').map(f => (
            <div key={f.id} className="float-num" style={{ color: f.color, left: '50%', top: '30%', transform: 'translateX(-50%)', fontSize: 28 }}>
              {f.text}
            </div>
          ))}
        </div>

        {/* VS */}
        <div className="text-6xl text-kw-orange font-bold drop-shadow-lg animate-pulse opacity-90 pointer-events-none">
          VS
        </div>

        {/* Enemy */}
        <div
          ref={enemyRef}
          className={`flex flex-col items-center bg-gradient-to-b from-white to-kw-panel-in border-2 border-kw-border rounded-xl p-3 min-w-[170px] relative ${shakeEnemy ? 'animate-hitshake' : ''}`}
        >
          <div className="text-7xl mb-1">{enemy.emoji}</div>
          <div className="font-bold text-kw-blue-deep text-sm">{enemy.name}</div>
          <div className="text-[10px] text-kw-text-dim mb-1">Lv {enemy.lv}</div>
          <div className="w-full">
            <div className="bar"><div className="bar-fill bg-gradient-to-b from-red-300 to-kw-hp" style={{ width: `${(enemy.hp / enemy.maxHp) * 100}%` }} /><div className="bar-label">HP {enemy.hp}/{enemy.maxHp}</div></div>
          </div>
          {floats.filter(f => f.target === 'enemy').map(f => (
            <div key={f.id} className="float-num" style={{ color: f.color, left: '50%', top: '30%', transform: 'translateX(-50%)', fontSize: 28 }}>
              {f.text}
            </div>
          ))}
        </div>
      </div>

      {/* Battle log */}
      <div className="mt-2 panel p-2 h-20 overflow-y-auto text-xs text-kw-text">
        {battleLog.map((m, i) => <div key={i}>{m}</div>)}
      </div>

      {/* Action buttons */}
      <div className="mt-2 grid grid-cols-4 gap-2">
        <button className="btn" disabled={!canControl} onClick={attack}>⚔ โจมตี</button>
        <button className="btn btn-blue" disabled={!canControl} onClick={skill}>✨ {cls.skill.name}</button>
        <button className="btn btn-green" disabled={!canControl} onClick={useItem}>🧪 ไอเทม</button>
        <button className="btn btn-pink" disabled={!canControl} onClick={run}>🏃 หนี</button>
      </div>
    </div>
  )
}
