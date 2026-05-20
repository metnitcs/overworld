import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  GameState,
  Screen,
  ModalType,
  BattleEnemy,
  ChatMessage,
  ChatKind,
} from '@asura/shared'
import {
  CLASSES, MAPS, ITEMS, RECIPES,
  deriveStats, applyExp, scaleEnemy, rollLoot, resolveEnhance,
} from '@asura/shared'
import { api, ApiError, type SaveBody } from '../api/client'

interface SpawnedMonster {
  x: number
  y: number
  monsterIdx: number
}

interface Store {
  // Persistent game data
  game: GameState
  // Volatile UI state
  screen: Screen
  modal: ModalType
  battle: {
    enemy: BattleEnemy
    turn: 'player' | 'enemy'
    finished: boolean
  } | null
  /** monsters currently on the active map */
  monsters: SpawnedMonster[]
  chat: ChatMessage[]
  battleLog: string[]
  /** Whether the authenticated user has a character on the server. */
  hasSave: boolean
  /** Bearer JWT after login/register. Persisted across reloads. */
  token: string | null
  /** Authenticated username (for display in top bar / logout). */
  username: string | null
  // Setters
  setScreen: (s: Screen) => void
  setModal: (m: ModalType) => void
  // Auth lifecycle
  register: (username: string, password: string) => Promise<void>
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  // Game lifecycle (server-backed; names preserved so existing UI keeps compiling)
  newCharacter: (name: string, raceId: string, classId: string) => Promise<void>
  loadFromStorage: () => Promise<void>
  saveToStorage: () => Promise<void>
  // Movement
  tryMove: (dx: number, dy: number) => void
  warpTo: (mapId: string, x: number, y: number) => void
  spawnMonsters: () => void
  // Stats
  recalc: () => void
  gainExp: (amt: number) => void
  // Battle
  startBattle: (monsterIdx: number, mapMonIdx: number) => void
  endBattle: (victory: boolean) => void
  setBattleTurn: (t: 'player' | 'enemy') => void
  battleDamage: (target: 'player' | 'enemy', amt: number) => void
  battleHeal: (target: 'player' | 'enemy', amt: number) => void
  spendMp: (amt: number) => void
  // Inventory / equip
  equip: (key: string) => void
  unequip: (key: string) => void
  useConsume: (key: string) => void
  addItem: (key: string, qty?: number) => void
  removeItem: (key: string, qty?: number) => void
  spendGold: (amt: number) => boolean
  gainGold: (amt: number) => void
  // Craft / enhance / class change
  craft: (resultKey: string) => boolean
  enhance: (key: string, slot: '_w' | '_a') => 'ok' | 'fail' | 'no-stone'
  changeClass: (classId: string, cost: number) => boolean
  // Chat / log
  pushChat: (msg: Omit<ChatMessage, 'id'>) => void
  pushBattleLog: (msg: string) => void
  log: (text: string, kind?: ChatKind) => void
  // Reset (death)
  defeatReset: () => void
}

const initialGame: GameState = {
  name: 'นักผจญภัย',
  raceId: 'mara',
  classId: 'berserk',
  lv: 1, exp: 0,
  hp: 100, maxHp: 100,
  mp: 50, maxMp: 50,
  atk: 12, def: 8, spd: 10,
  gold: 100,
  inventory: { 'potion-s': 3 },
  equipWeapon: null,
  equipArmor: null,
  plus: {},
  map: 'village',
  px: 5, py: 5,
  steps: 0,
}

let chatIdSeq = 1
/** Index of the monster on the current map that we're currently battling.
 *  Stored outside Zustand state so it survives intermediate set() calls. */
let pendingMapMonIdx: number = -1
const now = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function spawnForMap(mapId: string, playerX: number, playerY: number): SpawnedMonster[] {
  const map = MAPS[mapId]
  if (!map || !map.monsterCount) return []
  const out: SpawnedMonster[] = []
  const occupied = new Set<string>([`${playerX},${playerY}`])
  for (const w of map.warps) occupied.add(`${w.x},${w.y}`)
  let tries = 0
  while (out.length < map.monsterCount && tries < 200) {
    tries++
    const x = Math.floor(Math.random() * map.w)
    const y = Math.floor(Math.random() * map.h)
    const k = `${x},${y}`
    if (occupied.has(k)) continue
    occupied.add(k)
    out.push({ x, y, monsterIdx: Math.floor(Math.random() * map.monsters.length) })
  }
  return out
}

/** Persists only the auth token. Server is now the source of truth for game state. */
const AUTH_KEY = 'asura_online_auth_v1'

/** Build the persisted PUT body from the in-memory game state — drops the
 *  identity fields (name/raceId/classId) which are set at creation and
 *  immutable on the server, leaving the mutable slice. */
function toSaveBody(g: GameState): SaveBody {
  // Use a destructure to discard identity fields cleanly.
  const { name: _n, raceId: _r, classId: _c, ...rest } = g
  void _n; void _r; void _c
  return rest
}

export const useGame = create<Store>()(
  persist(
    (set, get) => ({
      game: initialGame,
      screen: 'auth',
      modal: 'none',
      battle: null,
      monsters: [],
      chat: [],
      battleLog: [],
      hasSave: false,
      token: null,
      username: null,

      setScreen: (s) => set({ screen: s }),
      setModal: (m) => set({ modal: m }),

      register: async (username, password) => {
        const r = await api.register(username, password)
        set({ token: r.token, username: r.user.username, screen: 'create' })
      },

      login: async (username, password) => {
        const r = await api.login(username, password)
        // Land on the Portal (Title); probe whether a character exists so the
        // Portal's "Continue / New" button can pick the right label.
        set({ token: r.token, username: r.user.username, screen: 'title' })
        try {
          await api.getCharacter(r.token)
          set({ hasSave: true })
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            set({ hasSave: false })
          } else {
            throw err
          }
        }
      },

      logout: () => {
        set({
          token: null,
          username: null,
          hasSave: false,
          game: initialGame,
          monsters: [],
          chat: [],
          battleLog: [],
          battle: null,
          screen: 'auth',
        })
      },

      newCharacter: async (name, raceId, classId) => {
        const token = get().token
        if (!token) throw new Error('not authenticated')
        const r = await api.createCharacter(token, { name, raceId, classId })
        const g = r.character
        set({
          game: g,
          monsters: spawnForMap(g.map, g.px, g.py),
          chat: [],
          screen: 'game',
          hasSave: true,
        })
        get().log(`ยินดีต้อนรับ ${name}! เริ่มต้นที่ ${MAPS[g.map].name}`, 'system')
        get().log('ใช้ลูกศรหรือ WASD เพื่อเดิน · เดินชนมอนเพื่อต่อสู้', 'system')
      },

      // Despite the legacy name, this now loads from the server. Kept named
      // `loadFromStorage` so existing UI callers continue to compile.
      loadFromStorage: async () => {
        const token = get().token
        if (!token) throw new Error('not authenticated')
        const r = await api.getCharacter(token)
        const g = r.character
        set({
          game: g,
          monsters: spawnForMap(g.map, g.px, g.py),
          chat: [],
          screen: 'game',
          hasSave: true,
        })
        get().log('โหลดเกมสำเร็จ', 'good')
      },

      // Likewise — now PUTs the persistent state to the server (the
      // localStorage save is gone; only the auth token is persisted).
      saveToStorage: async () => {
        const token = get().token
        if (!token) {
          alert('ยังไม่ได้ login')
          return
        }
        try {
          await api.saveCharacter(token, toSaveBody(get().game))
          set({ hasSave: true })
          get().log('💾 บันทึกเกมสำเร็จ', 'good')
        } catch (err) {
          const msg = err instanceof ApiError ? `(${err.status})` : ''
          alert(`บันทึกไม่ได้ ${msg}`)
        }
      },

      tryMove: (dx, dy) => {
        const { game, monsters, screen, modal } = get()
        if (screen !== 'game' || modal !== 'none') return
        const map = MAPS[game.map]
        const nx = game.px + dx
        const ny = game.py + dy
        if (nx < 0 || nx >= map.w || ny < 0 || ny >= map.h) return
        // Check monster collision
        const monIdx = monsters.findIndex(m => m.x === nx && m.y === ny)
        // Check warp
        const warp = map.warps.find(w => w.x === nx && w.y === ny)
        set({
          game: { ...game, px: nx, py: ny, steps: game.steps + 1 },
        })
        if (monIdx >= 0) {
          setTimeout(() => get().startBattle(monsters[monIdx].monsterIdx, monIdx), 150)
        } else if (warp) {
          setTimeout(() => get().warpTo(warp.to, warp.tx, warp.ty), 150)
        }
      },

      warpTo: (mapId, x, y) => {
        const g = { ...get().game, map: mapId, px: x, py: y }
        set({
          game: g,
          monsters: spawnForMap(mapId, x, y),
        })
        get().log(`🌀 มาถึง ${MAPS[mapId].name}`, 'system')
      },

      spawnMonsters: () => {
        const { game } = get()
        set({ monsters: spawnForMap(game.map, game.px, game.py) })
      },

      recalc: () => set({ game: deriveStats(get().game) }),

      gainExp: (amt) => {
        const cur = get().game
        const { lv, exp, levelsGained } = applyExp(cur.lv, cur.exp, amt)
        let g = { ...cur, lv, exp }
        if (levelsGained > 0) {
          for (let i = 1; i <= levelsGained; i++) {
            get().log(`🎉 เลเวลอัพ! ตอนนี้ Lv ${cur.lv + i}`, 'good')
          }
          g = deriveStats(g)
          g.hp = g.maxHp
          g.mp = g.maxMp
        }
        set({ game: g })
      },

      startBattle: (monIdx, mapMonIdx) => {
        const { game } = get()
        const def = MAPS[game.map].monsters[monIdx]
        const enemy: BattleEnemy = scaleEnemy(def, Math.random)
        pendingMapMonIdx = mapMonIdx
        set({
          screen: 'battle',
          battle: { enemy, turn: 'player', finished: false },
          battleLog: [`⚔ ${enemy.name} (Lv ${enemy.lv}) ปรากฏตัว!`],
        })
      },

      setBattleTurn: (t) => {
        const b = get().battle
        if (!b) return
        set({ battle: { ...b, turn: t } })
      },

      battleDamage: (target, amt) => {
        const b = get().battle
        if (!b) return
        if (target === 'enemy') {
          const enemy = { ...b.enemy, hp: Math.max(0, b.enemy.hp - amt) }
          set({ battle: { ...b, enemy } })
        } else {
          const g = { ...get().game, hp: Math.max(0, get().game.hp - amt) }
          set({ game: g })
        }
      },

      battleHeal: (target, amt) => {
        if (target === 'player') {
          const g = { ...get().game }
          g.hp = Math.min(g.maxHp, g.hp + amt)
          set({ game: g })
        }
      },

      spendMp: (amt) => {
        const g = { ...get().game, mp: Math.max(0, get().game.mp - amt) }
        set({ game: g })
      },

      endBattle: (victory) => {
        const b = get().battle
        if (!b) return
        if (victory) {
          const expG = b.enemy.exp
          const goldG = b.enemy.gold + Math.floor(Math.random() * 5)
          get().gainGold(goldG)
          get().pushBattleLog(`🎉 ชนะ! ได้ EXP ${expG}, ทอง ${goldG}`)
          get().log(`ปราบ ${b.enemy.name} → EXP ${expG}, ทอง ${goldG}`, 'good')
          for (const itemKey of rollLoot(b.enemy, Math.random)) {
            get().addItem(itemKey)
            if (itemKey === 'plus-stone') {
              get().log(`💠 ได้ หินตีบวก!`, 'good')
            } else {
              const it = ITEMS[itemKey]
              get().log(`🎁 ได้ ${it.emoji} ${it.name}!`, 'good')
            }
          }
          get().gainExp(expG)
          // Remove monster from map
          if (pendingMapMonIdx >= 0) {
            const monsters = [...get().monsters]
            monsters.splice(pendingMapMonIdx, 1)
            set({ monsters })
            pendingMapMonIdx = -1
            // Respawn shortly if low
            if (monsters.length < 3) {
              setTimeout(() => {
                if (get().screen === 'game') get().spawnMonsters()
              }, 4000)
            }
          }
          setTimeout(() => {
            set({ screen: 'game', battle: null, battleLog: [] })
          }, 1200)
        } else {
          get().pushBattleLog('💀 พ่ายแพ้!')
          get().log('💀 พ่ายแพ้... กลับสู่หมู่บ้าน', 'bad')
          setTimeout(() => get().defeatReset(), 1500)
        }
      },

      defeatReset: () => {
        const g = { ...get().game }
        g.gold = Math.floor(g.gold / 2)
        g.hp = g.maxHp
        g.mp = g.maxMp
        g.map = 'village'
        g.px = 5; g.py = 5
        set({
          game: g,
          monsters: spawnForMap(g.map, g.px, g.py),
          battle: null,
          battleLog: [],
          screen: 'game',
        })
      },

      // Inventory
      equip: (key) => {
        const it = ITEMS[key]
        if (!it) return
        const g = { ...get().game }
        if (it.type === 'weapon') g.equipWeapon = key
        else if (it.type === 'armor') g.equipArmor = key
        set({ game: deriveStats(g) })
        get().log(`สวม ${it.name}`, 'good')
      },
      unequip: (key) => {
        const g = { ...get().game }
        if (g.equipWeapon === key) g.equipWeapon = null
        if (g.equipArmor === key) g.equipArmor = null
        set({ game: deriveStats(g) })
      },
      useConsume: (key) => {
        const it = ITEMS[key]
        if (!it || it.type !== 'consume') return
        const g = { ...get().game }
        if (it.heal) g.hp = Math.min(g.maxHp, g.hp + it.heal)
        if (it.healMp) g.mp = Math.min(g.maxMp, g.mp + it.healMp)
        g.inventory = { ...g.inventory }
        g.inventory[key] = (g.inventory[key] || 0) - 1
        if (g.inventory[key] <= 0) delete g.inventory[key]
        set({ game: g })
        get().log(`ใช้ ${it.name}`, 'good')
      },
      addItem: (key, qty = 1) => {
        const g = { ...get().game }
        g.inventory = { ...g.inventory }
        g.inventory[key] = (g.inventory[key] || 0) + qty
        set({ game: g })
      },
      removeItem: (key, qty = 1) => {
        const g = { ...get().game }
        g.inventory = { ...g.inventory }
        g.inventory[key] = (g.inventory[key] || 0) - qty
        if (g.inventory[key] <= 0) delete g.inventory[key]
        set({ game: g })
      },
      spendGold: (amt) => {
        if (get().game.gold < amt) return false
        set({ game: { ...get().game, gold: get().game.gold - amt } })
        return true
      },
      gainGold: (amt) => {
        set({ game: { ...get().game, gold: get().game.gold + amt } })
      },

      craft: (resultKey) => {
        const rec = RECIPES.find(r => r.result === resultKey)
        if (!rec) return false
        const { game } = get()
        for (const k of Object.keys(rec.mats)) {
          if ((game.inventory[k] || 0) < rec.mats[k]) return false
        }
        if (game.gold < rec.gold) return false
        for (const k of Object.keys(rec.mats)) get().removeItem(k, rec.mats[k])
        get().spendGold(rec.gold)
        get().addItem(resultKey)
        get().log(`⚒ คราฟ ${ITEMS[resultKey].name} สำเร็จ!`, 'good')
        return true
      },

      enhance: (key, slot) => {
        const { game } = get()
        const cur = game.plus[key + slot] || 0
        const stones = game.inventory['plus-stone'] || 0
        const r = resolveEnhance(cur, stones, Math.random)
        if (r.outcome === 'no-stone') return 'no-stone'
        get().removeItem('plus-stone', r.cost)
        const g = { ...get().game, plus: { ...get().game.plus } }
        g.plus[key + slot] = r.newPlus
        if (r.outcome === 'ok') {
          set({ game: deriveStats(g) })
          get().log(`✨ ตีบวก ${ITEMS[key].name} สำเร็จ! → +${r.newPlus}`, 'good')
          return 'ok'
        } else {
          if (r.newPlus !== cur) {
            set({ game: deriveStats(g) })
            get().log(`💥 ตีบวกล้มเหลว! ลดเหลือ +${r.newPlus}`, 'bad')
          } else {
            set({ game: g })
            get().log(`💥 ตีบวกล้มเหลว!`, 'bad')
          }
          return 'fail'
        }
      },

      changeClass: (classId, cost) => {
        if (!get().spendGold(cost)) return false
        const g = { ...get().game, classId }
        set({ game: deriveStats(g) })
        get().log(`🔄 เปลี่ยนอาชีพเป็น ${CLASSES.find(c => c.id === classId)!.name}`, 'good')
        return true
      },

      pushChat: (msg) => {
        const m: ChatMessage = { ...msg, id: chatIdSeq++ }
        const chat = [...get().chat, m].slice(-50)
        set({ chat })
      },
      pushBattleLog: (msg) => {
        const log = [...get().battleLog, msg].slice(-10)
        set({ battleLog: log })
      },
      log: (text, kind = 'normal') => {
        get().pushChat({
          avatar: kind === 'good' ? '✨' : kind === 'bad' ? '⚠️' : '📢',
          speaker: 'ระบบ',
          text,
          time: now(),
          kind: kind === 'normal' ? 'system' : kind,
        })
      },
    }),
    {
      name: AUTH_KEY,
      // Only the auth token + username are persisted client-side; the game
      // state lives on the server now (slice 5 endpoints).
      partialize: (s) => ({ token: s.token, username: s.username }),
    },
  ),
)

// Some prefab NPC chat to liven things up (shown only on first game enter)
export function seedChat() {
  const s = useGame.getState()
  const sample: Omit<ChatMessage, 'id'>[] = [
    { avatar: '🧙', speaker: 'พ่อมดผมขาว Lv 99', text: 'ทักทายผู้เล่นใหม่ทุกคน~ มีอะไรสอบถามได้นะ', time: now() },
    { avatar: '🐰', speaker: 'น้องกระต่าย',      text: 'มาลุยทุ่งซากุระกันไหมเอ่ย', time: now() },
    { avatar: '🦊', speaker: 'จิ้งจอกเงา',       text: 'ขอเข้าปาร์ตี้ล่ามังกรน้อยหน่อย!', time: now() },
  ]
  for (const m of sample) s.pushChat(m)
}
