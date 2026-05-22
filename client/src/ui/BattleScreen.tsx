import { useRef, useState } from 'react'
import { useGame } from '../game/store'
import { CLASSES, RACES, resolveAttack, deriveCombatStats } from '@asura/shared'
import type { Combatant } from '@asura/shared'

interface FloatNum {
  id: number
  target: 'player' | 'enemy'
  text: string
  color: string
}

let floatSeq = 1

export function BattleScreen() {
  const game = useGame((s) => s.game)
  const battle = useGame((s) => s.battle)
  const battleLog = useGame((s) => s.battleLog)
  const setBattleTurn = useGame((s) => s.setBattleTurn)
  const battleDamage = useGame((s) => s.battleDamage)
  const battleHeal = useGame((s) => s.battleHeal)
  const spendMp = useGame((s) => s.spendMp)
  const endBattle = useGame((s) => s.endBattle)
  const nextEnemy = useGame((s) => s.nextEnemy)
  const fleeEncounter = useGame((s) => s.fleeEncounter)
  const returnToMap = useGame((s) => s.returnToMap)
  const useConsume = useGame((s) => s.useConsume)
  const pushBattleLog = useGame((s) => s.pushBattleLog)
  const items = useGame((s) => s.content!.items)
  const [floats, setFloats] = useState<FloatNum[]>([])
  const playerRef = useRef<HTMLDivElement>(null)
  const enemyRef = useRef<HTMLDivElement>(null)
  const [shakePlayer, setShakePlayer] = useState(false)
  const [shakeEnemy, setShakeEnemy] = useState(false)

  const race = RACES.find((r) => r.id === game.raceId)!
  const cls = CLASSES.find((c) => c.id === game.classId)!

  if (!battle) {
    return <div className="w-full h-full flex items-center justify-center">กำลังโหลด...</div>
  }
  const { enemy, turn, finished, queue, defeatedCount, totalCount, rewards, phase } = battle
  const canControl = turn === 'player' && !finished && phase === 'fighting'

  function addFloat(target: 'player' | 'enemy', text: string, color: string) {
    const id = floatSeq++
    setFloats((prev) => [...prev, { id, target, text, color }])
    setTimeout(() => setFloats((prev) => prev.filter((f) => f.id !== id)), 1000)
  }

  // Build derived combatants for the new resolveAttack(): players use the
  // full primary-stat formulas, monsters use the seeded acc/dodge/crit from
  // scaleEnemy().
  const playerCombat = deriveCombatStats(game)
  const playerCombatant: Combatant = {
    atk: playerCombat.pAtk, def: playerCombat.pDef,
    acc: playerCombat.acc, dodge: playerCombat.dodge, crit: playerCombat.crit,
  }
  const enemyCombatant: Combatant = {
    atk: enemy.atk, def: enemy.def,
    acc: enemy.acc ?? 90, dodge: enemy.dodge ?? 5, crit: enemy.crit ?? 5,
  }

  function damageCalc(attacker: Combatant, defender: Combatant, mult = 1) {
    return resolveAttack(attacker, defender, { mult, rng: Math.random })
  }

  function attack() {
    if (!canControl) return
    const { dmg, hit, crit } = damageCalc(playerCombatant, enemyCombatant)
    if (!hit) {
      addFloat('enemy', 'MISS', '#9ca3af')
      pushBattleLog(`⚔ ${game.name} โจมตี → พลาด!`)
      enemyTurn()
      return
    }
    battleDamage('enemy', dmg)
    setShakeEnemy(true); setTimeout(() => setShakeEnemy(false), 400)
    addFloat('enemy', crit ? `💥 ${dmg}` : String(dmg), crit ? '#ff3333' : '#ffffff')
    pushBattleLog(`⚔ ${game.name} โจมตี → ${dmg}${crit ? ' (คริ!)' : ''}`)
    if (enemy.hp - dmg <= 0) { endBattle(true); return }
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
      // Magic skills use mAtk vs mDef and don't roll miss.
      const useMagic = cls.skill.type === 'magic' || cls.skill.type === 'holy'
      const atkSrc = useMagic ? playerCombat.mAtk : playerCombat.pAtk
      const defSrc = useMagic ? (enemy.mDef ?? Math.floor(enemy.def * 0.5)) : enemy.def
      const skillCombatant: Combatant = {
        ...playerCombatant,
        atk: atkSrc,
        // Magic skills always hit — give them a very high acc.
        acc: useMagic ? 999 : playerCombatant.acc,
      }
      const skillTarget: Combatant = { ...enemyCombatant, def: defSrc }
      const { dmg, hit, crit } = damageCalc(skillCombatant, skillTarget, cls.skill.mult)
      if (!hit) {
        addFloat('enemy', 'MISS', '#9ca3af')
        pushBattleLog(`✨ ${cls.skill.name} → พลาด!`)
        enemyTurn()
        return
      }
      battleDamage('enemy', dmg)
      setShakeEnemy(true); setTimeout(() => setShakeEnemy(false), 400)
      const color = cls.skill.type === 'magic' ? '#9b5bd6' : cls.skill.type === 'holy' ? '#ffd23f' : '#ff5555'
      addFloat('enemy', `✨ ${dmg}`, color)
      pushBattleLog(`✨ ${cls.skill.name} → ${dmg}${crit ? ' (คริ!)' : ''}`)
      if (enemy.hp - dmg <= 0) { endBattle(true); return }
    }
    enemyTurn()
  }

  function useItem() {
    if (!canControl) return
    const keys = Object.keys(game.inventory).filter((k) => items[k]?.type === 'consume' && game.inventory[k] > 0)
    if (keys.length === 0) {
      pushBattleLog('ไม่มีไอเทมใช้ได้!')
      return
    }
    const key = keys[0]
    const it = items[key]
    if (!it) return
    useConsume(key)
    if (it.heal) addFloat('player', `+${it.heal}`, '#2dc653')
    if (it.healMp) addFloat('player', `+${it.healMp} MP`, '#4f8ed6')
    pushBattleLog(`🧪 ใช้ ${it.name}`)
    enemyTurn()
  }

  function enemyTurn() {
    setBattleTurn('enemy')
    setTimeout(() => {
      const cur = useGame.getState().battle
      if (!cur || cur.phase !== 'fighting') return
      const e = cur.enemy
      const eCombatant: Combatant = {
        atk: e.atk, def: e.def,
        acc: e.acc ?? 90, dodge: e.dodge ?? 5, crit: e.crit ?? 5,
      }
      const { dmg, hit, crit } = damageCalc(eCombatant, playerCombatant)
      if (!hit) {
        addFloat('player', 'MISS', '#9ca3af')
        pushBattleLog(`👹 ${e.name} โจมตี → พลาด!`)
        setBattleTurn('player')
        return
      }
      battleDamage('player', dmg)
      setShakePlayer(true); setTimeout(() => setShakePlayer(false), 400)
      addFloat('player', crit ? `💥 ${dmg}` : String(dmg), crit ? '#ff3333' : '#ffffff')
      pushBattleLog(`👹 ${e.name} โจมตี → ${dmg}${crit ? ' (คริ!)' : ''}`)
      if (useGame.getState().game.hp <= 0) { endBattle(false); return }
      setBattleTurn('player')
    }, 700)
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  const isBetween = phase === 'between'
  const isFinishedWin = phase === 'finished-win'
  const isFinishedLoss = phase === 'finished-loss'

  return (
    <div className="w-full h-full battle-bg flex flex-col p-4 gap-3">
      {/* Top bar */}
      <div className="top-bar rounded-xl text-sm py-2">
        <span className="flex items-center gap-2 font-bold">
          ⚔️ ลานประลองกับมอนสเตอร์
        </span>
        <div className="flex items-center gap-2">
          {/* Encounter progress dots */}
          {Array.from({ length: totalCount }).map((_, i) => (
            <span
              key={i}
              className={`inline-block w-3 h-3 rounded-full border-2 border-white ${
                i < defeatedCount ? 'bg-kw-red'
                  : i === defeatedCount ? 'bg-kw-yellow animate-pulse'
                  : 'bg-white/30'
              }`}
              title={i < defeatedCount ? 'ปราบแล้ว' : i === defeatedCount ? 'กำลังสู้' : 'รอ'}
            />
          ))}
          <span className="text-xs">
            {Math.min(defeatedCount + (phase === 'fighting' ? 1 : 0), totalCount)} / {totalCount}
          </span>
        </div>
        <span className="text-xs">
          Lv {enemy.lv} {enemy.emoji}
        </span>
      </div>

      {/* Main: Arena (2/3) + Summary panel (1/3) */}
      <div className="flex-1 flex gap-3 overflow-hidden">
        {/* Arena */}
        <div className="flex-1 relative flex items-center justify-around panel p-6 overflow-hidden">
          {/* Player */}
          <div
            ref={playerRef}
            className={`flex flex-col items-center bg-gradient-to-b from-white to-kw-panel-in border-2 border-kw-border rounded-xl p-4 min-w-[240px] relative ${shakePlayer ? 'animate-hitshake' : ''}`}
          >
            <div className="text-[110px] leading-none mb-2">{race.emoji}</div>
            <div className="text-4xl absolute right-4 top-4">{cls.emoji}</div>
            <div className="font-bold text-kw-blue-deep text-lg">{game.name}</div>
            <div className="text-xs text-kw-text-dim mb-2">Lv {game.lv} · {cls.name}</div>
            <div className="w-full space-y-1">
              <div className="bar h-5">
                <div className="bar-fill bg-gradient-to-b from-red-300 to-kw-hp" style={{ width: `${(game.hp / game.maxHp) * 100}%` }} />
                <div className="bar-label text-xs">HP {game.hp}/{game.maxHp}</div>
              </div>
              <div className="bar h-5">
                <div className="bar-fill bg-gradient-to-b from-blue-300 to-kw-mp" style={{ width: `${(game.mp / game.maxMp) * 100}%` }} />
                <div className="bar-label text-xs">MP {game.mp}/{game.maxMp}</div>
              </div>
            </div>
            {floats.filter((f) => f.target === 'player').map((f) => (
              <div key={f.id} className="float-num" style={{ color: f.color, left: '50%', top: '30%', transform: 'translateX(-50%)', fontSize: 36 }}>
                {f.text}
              </div>
            ))}
          </div>

          {/* VS */}
          <div className="flex flex-col items-center pointer-events-none">
            <div className="text-7xl text-kw-orange font-bold drop-shadow-lg animate-pulse opacity-90">VS</div>
            {totalCount > 1 && (
              <div className="text-xs text-kw-text-dim mt-1 panel px-2 py-0.5">
                ตัวที่ {defeatedCount + (phase === 'fighting' ? 1 : 0)}/{totalCount}
              </div>
            )}
          </div>

          {/* Enemy */}
          <div
            ref={enemyRef}
            className={`flex flex-col items-center bg-gradient-to-b from-white to-kw-panel-in border-2 border-kw-border rounded-xl p-4 min-w-[240px] relative ${shakeEnemy ? 'animate-hitshake' : ''}`}
          >
            <div className="text-[110px] leading-none mb-2">{enemy.emoji}</div>
            <div className="font-bold text-kw-blue-deep text-lg">{enemy.name}</div>
            <div className="text-xs text-kw-text-dim mb-2">Lv {enemy.lv}</div>
            <div className="w-full">
              <div className="bar h-5">
                <div className="bar-fill bg-gradient-to-b from-red-300 to-kw-hp" style={{ width: `${(enemy.hp / enemy.maxHp) * 100}%` }} />
                <div className="bar-label text-xs">HP {enemy.hp}/{enemy.maxHp}</div>
              </div>
            </div>
            {/* Mini-thumbs of upcoming enemies in the queue */}
            {queue.length > 1 && phase === 'fighting' && (
              <div className="flex gap-1 mt-3 opacity-60">
                <span className="text-[10px] text-kw-text-dim mr-1">ถัดไป:</span>
                {queue.slice(1).map((e, i) => (
                  <span key={i} className="text-xl" title={`${e.name} Lv ${e.lv}`}>{e.emoji}</span>
                ))}
              </div>
            )}
            {floats.filter((f) => f.target === 'enemy').map((f) => (
              <div key={f.id} className="float-num" style={{ color: f.color, left: '50%', top: '30%', transform: 'translateX(-50%)', fontSize: 36 }}>
                {f.text}
              </div>
            ))}
          </div>
        </div>

        {/* Summary side-panel — always-on, shows running rewards */}
        <div className="w-[260px] panel p-3 flex flex-col gap-2 text-xs">
          <div className="panel-title flex items-center justify-between">
            <span>📜 สรุปผลที่ได้</span>
            {(isFinishedWin || isFinishedLoss) && (
              <span className={`text-[10px] font-bold ${isFinishedWin ? 'text-green-600' : 'text-kw-red'}`}>
                {isFinishedWin ? 'ชัยชนะ!' : 'พ่ายแพ้'}
              </span>
            )}
          </div>
          <div className="bg-white/60 rounded p-2 space-y-1">
            <div className="flex justify-between">
              <span className="text-kw-text-dim">ปราบ</span>
              <span className="font-bold">{defeatedCount} / {totalCount} ตัว</span>
            </div>
            <div className="flex justify-between">
              <span className="text-kw-text-dim">⭐ EXP</span>
              <span className="font-bold text-kw-orange">+{rewards.exp}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-kw-text-dim">💰 ทอง</span>
              <span className="font-bold text-kw-orange">+{rewards.gold}</span>
            </div>
          </div>
          <div className="panel-title text-[10px] mt-1">ไอเทมที่ได้ ({rewards.items.length})</div>
          <div className="flex-1 bg-white/60 rounded p-2 overflow-y-auto">
            {rewards.items.length === 0 ? (
              <div className="text-center text-kw-text-dim text-[11px] py-2">ยังไม่มีไอเทม</div>
            ) : (
              countItems(rewards.items).map(([key, n]) => {
                const it = items[key]
                return (
                  <div key={key} className="flex items-center gap-2 py-0.5">
                    <span className="text-base">{it?.emoji ?? '📦'}</span>
                    <span className="flex-1 truncate">{it?.name ?? key}</span>
                    <span className="text-kw-orange font-bold">×{n}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Battle log */}
      <div className="panel p-2 h-24 overflow-y-auto text-xs text-kw-text">
        {battleLog.map((m, i) => <div key={i}>{m}</div>)}
      </div>

      {/* Action bar — dynamic by phase */}
      {phase === 'fighting' && (
        <div className="grid grid-cols-4 gap-2">
          <button className="btn py-3 text-base" disabled={!canControl} onClick={attack}>⚔ โจมตี</button>
          <button className="btn btn-blue py-3 text-base" disabled={!canControl} onClick={skill}>✨ {cls.skill.name}</button>
          <button className="btn btn-green py-3 text-base" disabled={!canControl} onClick={useItem}>🧪 ไอเทม</button>
          <button className="btn btn-pink py-3 text-base" disabled={!canControl} onClick={fleeEncounter}>🏃 หนี</button>
        </div>
      )}
      {isBetween && (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-pink py-3 text-base" onClick={fleeEncounter}>🏃 หนี (เก็บของไว้)</button>
          <button className="btn btn-green py-3 text-base" onClick={nextEnemy}>
            ➡ ถัดไป ({queue.length} ตัวที่เหลือ)
          </button>
        </div>
      )}
      {isFinishedWin && (
        <div className="grid grid-cols-1 gap-2">
          <button className="btn py-3 text-base" onClick={returnToMap}>🏠 กลับแมพ</button>
        </div>
      )}
      {isFinishedLoss && (
        <div className="text-center text-kw-text-dim text-xs py-3">
          กำลังพากลับหมู่บ้าน…
        </div>
      )}
    </div>
  )
}

/** Tally a flat list of item keys into [key, count] pairs for display. */
function countItems(keys: string[]): Array<[string, number]> {
  const m = new Map<string, number>()
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1)
  return [...m.entries()]
}
