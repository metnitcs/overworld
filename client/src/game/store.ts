import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  GameState,
  Screen,
  ModalType,
  BattleEnemy,
  ChatMessage,
  ChatKind,
  ItemDef,
  MonsterDef,
  TileDef,
  WarpDef,
  NpcKind,
  ShopEntry,
  Recipe,
} from '@asura/shared'
import {
  CLASSES,
  deriveStats, applyExp, scaleEnemy, rollLoot, resolveEnhance, rollSpawns,
  rollEncounter,
  findPath, type PathStep,
  TRANSCEND_LV,
} from '@asura/shared'
import { api, ApiError, type SaveBody } from '../api/client'

/** Server-supplied Content bundle (ADR 0002). */
interface ContentBundle {
  items: Record<string, ItemDef>
  monsters: Record<string, MonsterDef>
  maps: Record<string, MapInfo>
  recipes: Recipe[]
}

interface SpawnedMonster {
  /** Stable per-spawn id (e.g. 'sp-7'). Lets the renderer keep sprite refs
   *  across position updates so wander tweens don't get recreated every move. */
  id: string
  x: number
  y: number
  /** Monster id — looked up in the Content cache (`content.monsters[id]`). */
  monsterId: string
}

/** NPC info as the client sees it after the boot fetch. */
export interface NpcInfo {
  id: string
  name: string
  emoji: string | null
  x: number
  y: number
  kind: NpcKind
  shop: ShopEntry[]
}

/** Map info needed at runtime, mirrored from the server Content bundle. */
export interface MapInfo {
  id: string
  name: string
  minLv: number
  maxLv: number
  w: number
  h: number
  bg: string
  /** Slice 21: optional bg image path. Drawn by MapScene when present. */
  bgImage: string | null
  pathColor: string | null
  monsterCount: number
  layout: TileDef[][]
  /** Monster ids that may spawn on this Map. */
  monsters: string[]
  /** Outgoing Warps from this Map. */
  warps: WarpDef[]
  /** NPCs placed on this Map. */
  npcs: NpcInfo[]
}

/** A character row as stored in the client cache (mirror of server response). */
export type CharacterRow = GameState & { id: string }

interface Store {
  // Persistent game data — mirrors the currently active character
  game: GameState
  // Volatile UI state
  screen: Screen
  modal: ModalType
  /** Slice 19: a battle is now an *encounter* of 1–5 enemies fought in
   *  sequence. The visible fields (`enemy`, `turn`, `finished`) describe
   *  the current single fight; `queue`/`defeatedCount`/`rewards`/`phase`
   *  drive the wrapper UI. */
  battle: {
    enemy: BattleEnemy
    turn: 'player' | 'enemy'
    finished: boolean
    /** Remaining enemies INCLUDING the current one as queue[0]. */
    queue: BattleEnemy[]
    /** How many enemies the Player has defeated so far in this encounter. */
    defeatedCount: number
    /** Original total at encounter start — for "n/N" display. */
    totalCount: number
    /** Accumulated rewards across this encounter (each fight adds in). */
    rewards: { exp: number; gold: number; items: string[] }
    /** Wrapper-state machine. UI swaps action bar by phase. */
    phase: 'fighting' | 'between' | 'finished-win' | 'finished-loss'
  } | null
  /** monsters currently on the active map */
  monsters: SpawnedMonster[]
  chat: ChatMessage[]
  battleLog: string[]
  /** True when the user has at least one character on the server. Derived
   *  from `characters.length > 0` — kept for ergonomic call-sites. */
  hasSave: boolean
  /** Slice 16: cached list of every character on this account. */
  characters: CharacterRow[]
  /** Slice 16: server-supplied per-account character slot limit (currently 3). */
  slotLimit: number
  /** Slice 16: id of the character currently being played (autosave key). */
  activeCharacterId: string | null
  /** Bearer JWT after login/register. Persisted across reloads. */
  token: string | null
  /** Authenticated username (for display in top bar / logout). */
  username: string | null
  /** Slice 20: role from /api/me — gates the admin screen. */
  role: 'USER' | 'ADMIN' | null
  /** Server-loaded Content cache (ADR 0002). null until loadContent resolves. */
  content: ContentBundle | null
  // Setters
  setScreen: (s: Screen) => void
  setModal: (m: ModalType) => void
  // Content lifecycle
  loadContent: () => Promise<void>
  // Auth lifecycle
  register: (username: string, password: string) => Promise<void>
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  // Character management (Slice 16)
  /** Fetch the full character list + slot limit; updates cache only. */
  listCharacters: () => Promise<void>
  /** Make a character the active one — loads its state into `game` + screen='game'. */
  selectCharacter: (id: string) => Promise<void>
  /** Remove a character; if it was active, clears `activeCharacterId`. */
  removeCharacter: (id: string) => Promise<void>
  /** Slice 17: Lv 10 race-change quest resolution. */
  transcend: (raceId: string) => Promise<void>
  // Game lifecycle (server-backed; names preserved so existing UI keeps compiling)
  /** Create a new character at the starter race (Slice 17). After creation,
   *  the character is auto-selected and the screen jumps to 'game'. */
  newCharacter: (name: string, classId: string) => Promise<void>
  loadFromStorage: () => Promise<void>
  saveToStorage: () => Promise<void>
  // Movement
  tryMove: (dx: number, dy: number) => void
  warpTo: (mapId: string, x: number, y: number) => void
  spawnMonsters: () => void
  /** Click-to-Walk (CONTEXT.md: "Click-to-Walk"). Computes A* path to the
   *  clicked tile and walks it step-by-step. Any new walkTo or keyboard
   *  step replaces the path. */
  walkTo: (x: number, y: number) => void
  /** Cancel any in-flight Click-to-Walk path. Called by keyboard input,
   *  battle/warp/modal triggers, and screen changes. */
  cancelPath: () => void
  /** Update one spawned monster's tile coordinate. Used by MapScene's wander
   *  AI; no-op if the spawn id has been removed (defeated mid-tick). */
  moveMonster: (spawnId: string, x: number, y: number) => void
  // Stats
  recalc: () => void
  gainExp: (amt: number) => void
  // Battle / Encounter (Slice 19)
  /** Walk-into-monster trigger. Spawns an encounter queue of 1–5 enemies. */
  startBattle: (monsterId: string, mapMonIdx: number) => void
  /** Called when the current single fight ends. Accumulates rewards and
   *  transitions to 'between' (more enemies) or 'finished-win' (last). */
  endBattle: (victory: boolean) => void
  /** Phase 'between' → 'fighting' with the next queue enemy. */
  nextEnemy: () => void
  /** Attempt to flee the encounter mid-fight or in 'between' phase. */
  fleeEncounter: () => void
  /** Phase 'finished-win' → exit to game map; rewards already credited. */
  returnToMap: () => void
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
  // Slice 23: primary-stat allocation
  allocateStat: (stat: 'str' | 'int' | 'dex' | 'agi' | 'luk' | 'vit', amount: number) => Promise<void>
  resetStats: () => Promise<void>
  // Chat / log
  pushChat: (msg: Omit<ChatMessage, 'id'>) => void
  pushBattleLog: (msg: string) => void
  log: (text: string, kind?: ChatKind) => void
  // Reset (death)
  defeatReset: () => void
}

const initialGame: GameState = {
  name: 'นักผจญภัย',
  raceId: 'human',
  classId: 'berserk',
  lv: 1, exp: 0,
  hp: 100, maxHp: 100,
  mp: 50, maxMp: 50,
  atk: 11, def: 9, spd: 10,
  // Slice 23: primary stats default to 10 (STAT_BASE).
  str: 10, int: 10, dex: 10, agi: 10, luk: 10, vit: 10,
  unspentPoints: 0,
  gold: 100,
  inventory: { 'potion-s': 3 },
  equipWeapon: null,
  equipArmor: null,
  plus: {},
  map: 'village',
  px: 5, py: 5,
  steps: 0,
  transcended: false,
}

let chatIdSeq = 1
/** Index of the monster on the current map that we're currently battling.
 *  Stored outside Zustand state so it survives intermediate set() calls. */
let pendingMapMonIdx: number = -1
const now = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Monotonically increasing seq for SpawnedMonster.id. Survives map changes
 *  so two monsters spawned in different sessions can't share an id mid-render. */
let spawnIdSeq = 1

// ─── Click-to-Walk state (Slice 18) ─────────────────────────────────────
// Held module-local instead of inside Zustand because:
//   - the timer handle isn't serialisable (would break persist middleware)
//   - the path is transient and shouldn't trigger render subscribers
// Cancellation paths feed through `cancelPath()` exported via the store.
let walkQueue: PathStep[] = []
let walkTimer: ReturnType<typeof setTimeout> | null = null
/** Stagger between steps. Matches the 220ms movePlayerTo tween + tiny buffer
 *  so each tween completes before the next step queues. Slice 24: bumped
 *  160→240 to feel less twitchy. */
const WALK_STEP_DELAY_MS = 240

/** Worker that consumes the walkQueue one step per tick. Cancels itself if
 *  the player is no longer in a state to walk (battle screen, open modal,
 *  map change, or the next step isn't adjacent to current pos). */
function walkStep(): void {
  walkTimer = null
  if (walkQueue.length === 0) return

  const st = useGame.getState()
  if (st.screen !== 'game' || st.modal !== 'none') {
    walkQueue = []
    return
  }

  const next = walkQueue[0]
  const dx = next.x - st.game.px
  const dy = next.y - st.game.py
  // Path desync — most often because a warp ran and the Character is now
  // on a different map, or tryMove blocked the previous step (wall).
  if (Math.abs(dx) + Math.abs(dy) !== 1) {
    walkQueue = []
    return
  }
  walkQueue.shift()
  st.tryMove(dx, dy)

  // tryMove may have started a battle / warp / modal — those run on
  // setTimeout(150ms) so the state transition happens before our next tick.
  // Schedule the next step; the head of walkStep() will cancel if needed.
  if (walkQueue.length > 0) {
    walkTimer = setTimeout(walkStep, WALK_STEP_DELAY_MS)
  }
}

function spawnForMap(mapInfo: MapInfo, playerX: number, playerY: number): SpawnedMonster[] {
  // Warps & NPCs occupy their tiles — monsters never spawn on top of either.
  const placements = rollSpawns({
    layout: mapInfo.layout,
    monsterCount: mapInfo.monsterCount,
    monsters: mapInfo.monsters,
    occupied: [
      { x: playerX, y: playerY },
      ...mapInfo.warps.map((w) => ({ x: w.x, y: w.y })),
      ...mapInfo.npcs.map((n) => ({ x: n.x, y: n.y })),
    ],
    rng: Math.random,
  })
  return placements.map((p) => ({
    id: `sp-${spawnIdSeq++}`,
    x: p.x,
    y: p.y,
    monsterId: p.monsterId,
  }))
}

/** Resolve the MapInfo for the current game's map from the content cache.
 *  Asserts cache is loaded — the App.tsx gate guarantees this before any
 *  game-screen action can fire. */
function requireMap(content: ContentBundle | null, mapId: string): MapInfo {
  if (!content) throw new Error('content cache not loaded')
  const m = content.maps[mapId]
  if (!m) throw new Error(`unknown map id: ${mapId}`)
  return m
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
      characters: [],
      slotLimit: 3,
      activeCharacterId: null,
      token: null,
      username: null,
      role: null,
      content: null,

      setScreen: (s) => set({ screen: s }),
      setModal: (m) => set({ modal: m }),

      loadContent: async () => {
        const r = await api.getContent()
        set({
          content: {
            items: r.items,
            monsters: r.monsters,
            maps: r.maps,
            recipes: r.recipes,
          },
        })
      },

      register: async (username, password) => {
        const r = await api.register(username, password)
        // Fresh account → no characters. Skip listCharacters, go straight to create.
        set({
          token: r.token,
          username: r.user.username,
          role: r.user.role ?? 'USER',
          characters: [],
          activeCharacterId: null,
          hasSave: false,
          screen: 'create',
        })
      },

      login: async (username, password) => {
        const r = await api.login(username, password)
        set({ token: r.token, username: r.user.username, role: r.user.role ?? 'USER' })
        // Multi-char (Slice 16) routing:
        //   0 characters → create flow
        //   1+ characters → character-select screen
        // We never auto-select on login — even single-char players see the
        // select screen once per session so the slot grid is discoverable.
        try {
          await get().listCharacters()
          const cs = get().characters
          if (cs.length === 0) {
            set({ screen: 'create', hasSave: false })
          } else {
            set({ screen: 'character-select', hasSave: true })
          }
        } catch (err) {
          // Network or auth failure — surface to AuthScreen.
          throw err
        }
      },

      logout: () => {
        set({
          token: null,
          username: null,
          role: null,
          hasSave: false,
          characters: [],
          activeCharacterId: null,
          game: initialGame,
          monsters: [],
          chat: [],
          battleLog: [],
          battle: null,
          screen: 'auth',
        })
      },

      // ─── Slice 16: character roster management ──────────────────────────
      listCharacters: async () => {
        const token = get().token
        if (!token) throw new Error('not authenticated')
        const r = await api.listCharacters(token)
        set({
          characters: r.characters,
          slotLimit: r.slotLimit,
          hasSave: r.characters.length > 0,
        })
      },

      selectCharacter: async (id) => {
        const found = get().characters.find((c) => c.id === id)
        if (!found) throw new Error(`character not in cache: ${id}`)
        const content = get().content
        if (!content) throw new Error('content cache not loaded')
        const mapInfo = content.maps[found.map]
        if (!mapInfo) throw new Error(`unknown map id: ${found.map}`)
        // Strip the id when copying into `game` (GameState shape excludes id).
        const { id: _, ...gameState } = found
        void _
        set({
          activeCharacterId: id,
          game: deriveStats(gameState),
          monsters: spawnForMap(mapInfo, gameState.px, gameState.py),
          chat: [],
          screen: 'game',
        })
        get().log(`เลือก ${gameState.name} แล้ว — เริ่มที่ ${mapInfo.name}`, 'system')
      },

      removeCharacter: async (id) => {
        const token = get().token
        if (!token) throw new Error('not authenticated')
        await api.deleteCharacter(token, id)
        await get().listCharacters()
        if (get().activeCharacterId === id) {
          set({ activeCharacterId: null })
        }
      },

      // ─── Slice 17: Lv 10 race-change quest ──────────────────────────────
      transcend: async (raceId) => {
        const token = get().token
        const id = get().activeCharacterId
        if (!token || !id) throw new Error('no active character')
        const r = await api.transcendCharacter(token, id, raceId)
        const { id: _, ...gameState } = r.character
        void _
        // Recompute derived stats with the new race.
        set({ game: deriveStats(gameState) })
        await get().listCharacters()   // refresh roster cache
        get().log(`✨ เปลี่ยนเผ่าเป็น ${raceId}!`, 'good')
      },

      newCharacter: async (name, classId) => {
        const token = get().token
        if (!token) throw new Error('not authenticated')
        // Slice 17: server fixes raceId to STARTER_RACE regardless of payload.
        const r = await api.createCharacter(token, { name, classId })
        const g = r.character
        const mapInfo = requireMap(get().content, g.map)
        const { id, ...gameState } = g
        set({
          game: gameState,
          activeCharacterId: id,
          monsters: spawnForMap(mapInfo, gameState.px, gameState.py),
          chat: [],
          screen: 'game',
          hasSave: true,
        })
        // Refresh roster cache so the new character shows up on next select.
        await get().listCharacters()
        get().log(`ยินดีต้อนรับ ${name}! เริ่มต้นที่ ${mapInfo.name}`, 'system')
        get().log('ใช้ลูกศรหรือ WASD เพื่อเดิน · เดินชนมอนเพื่อต่อสู้', 'system')
      },

      /** Legacy alias. Multi-char (Slice 16) routes through listCharacters →
       *  character-select screen. Direct boot/refresh recovery still hits
       *  this for old code paths; we forward to listCharacters and pick a
       *  reasonable screen. Kept named loadFromStorage so existing UI callers
       *  continue to compile. */
      loadFromStorage: async () => {
        const token = get().token
        if (!token) throw new Error('not authenticated')
        await get().listCharacters()
        const cs = get().characters
        if (cs.length === 0) {
          set({ screen: 'create', hasSave: false })
          throw new ApiError(404, { error: 'no character for this user' })
        }
        set({ screen: 'character-select', hasSave: true })
      },

      /** Manual save kept for legacy menu code (the in-game button was
       *  removed Slice 17). Forwards to the active-character PUT. */
      saveToStorage: async () => {
        const token = get().token
        const id = get().activeCharacterId
        if (!token || !id) {
          alert('ยังไม่ได้ login หรือยังไม่ได้เลือกตัวละคร')
          return
        }
        try {
          await api.saveCharacterById(token, id, toSaveBody(get().game))
          get().log('💾 บันทึกเกมสำเร็จ', 'good')
        } catch (err) {
          const msg = err instanceof ApiError ? `(${err.status})` : ''
          alert(`บันทึกไม่ได้ ${msg}`)
        }
      },

      tryMove: (dx, dy) => {
        const { game, monsters, screen, modal, content } = get()
        if (screen !== 'game' || modal !== 'none') return
        const mapInfo = requireMap(content, game.map)
        const nx = game.px + dx
        const ny = game.py + dy
        if (nx < 0 || nx >= mapInfo.w || ny < 0 || ny >= mapInfo.h) return
        // Slice 11: respect Tile walkability. Bumping into a wall consumes
        // the keypress but doesn't move the player.
        if (!mapInfo.layout[ny]?.[nx]?.walkable) return
        // Check monster collision
        const monIdx = monsters.findIndex(m => m.x === nx && m.y === ny)
        // Check warp (now sourced from the Content cache, not MAPS).
        const warp = mapInfo.warps.find(w => w.x === nx && w.y === ny)
        // Tile kind for NPC interactions — slice 13 wires shop & healer.
        const tileKind = mapInfo.layout[ny]?.[nx]?.kind
        set({
          game: { ...game, px: nx, py: ny, steps: game.steps + 1 },
        })
        if (monIdx >= 0) {
          setTimeout(() => get().startBattle(monsters[monIdx].monsterId, monIdx), 150)
        } else if (warp) {
          setTimeout(() => get().warpTo(warp.to, warp.tx, warp.ty), 150)
        } else if (tileKind === 'shop' || tileKind === 'healer') {
          // Shop modal renders both kinds — it picks the right NPC list from cache.
          setTimeout(() => get().setModal('shop'), 150)
        }
      },

      warpTo: (mapId, x, y) => {
        const mapInfo = requireMap(get().content, mapId)
        const g = { ...get().game, map: mapId, px: x, py: y }
        set({
          game: g,
          monsters: spawnForMap(mapInfo, x, y),
        })
        get().log(`🌀 มาถึง ${mapInfo.name}`, 'system')
      },

      spawnMonsters: () => {
        const { game, content } = get()
        const mapInfo = requireMap(content, game.map)
        set({ monsters: spawnForMap(mapInfo, game.px, game.py) })
      },

      walkTo: (x, y) => {
        const { game, content, screen, modal } = get()
        if (screen !== 'game' || modal !== 'none') return
        const mapInfo = requireMap(content, game.map)
        // Pathfinding obstacles = walls only (CONTEXT.md: "Path"). Monsters,
        // Warps and NPCs are walkable; tryMove fires their side-effects on
        // arrival which then cancels the rest of the path.
        const path = findPath({
          layout: mapInfo.layout,
          from: { x: game.px, y: game.py },
          to:   { x, y },
        })
        if (path.length === 0) return
        // Replace any in-flight path with this one.
        if (walkTimer) clearTimeout(walkTimer)
        walkQueue = path
        // Fire the first step immediately for snappy feedback; subsequent
        // steps trail by WALK_STEP_DELAY_MS.
        walkStep()
      },

      cancelPath: () => {
        if (walkTimer) { clearTimeout(walkTimer); walkTimer = null }
        walkQueue = []
      },

      moveMonster: (spawnId, x, y) => {
        const monsters = get().monsters
        const idx = monsters.findIndex((m) => m.id === spawnId)
        if (idx < 0) return  // monster was defeated between schedule + fire
        const next = monsters.slice()
        next[idx] = { ...next[idx], x, y }
        set({ monsters: next })
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

        // Slice 17: Lv 10 race-change quest. Fires the modal exactly once,
        // when the player crosses the threshold for the first time.
        if (
          cur.lv < TRANSCEND_LV &&
          g.lv >= TRANSCEND_LV &&
          !g.transcended &&
          get().modal === 'none' &&
          get().screen === 'game'
        ) {
          get().log(`✨ เผ่าของคุณกำลังตื่นขึ้น! ทำเควสเปลี่ยนเผ่าได้แล้ว`, 'good')
          set({ modal: 'race-change' })
        }
      },

      startBattle: (monsterId, mapMonIdx) => {
        const { content, game } = get()
        if (!content) throw new Error('content cache not loaded')
        const def = content.monsters[monsterId]
        if (!def) throw new Error(`unknown monster id: ${monsterId}`)
        // Slice 19: pull the spawn pool of the current map and roll an
        // encounter of 1–5 enemies (primary + 0–4 random "friends").
        const mapInfo = content.maps[game.map]
        const pool = mapInfo
          ? mapInfo.monsters.map((id) => content.monsters[id]).filter(Boolean)
          : []
        const queue = rollEncounter({
          primary: def,
          monsterPool: pool.filter((m) => m.id !== def.id),
          rng: Math.random,
        })
        pendingMapMonIdx = mapMonIdx
        const log = [
          queue.length === 1
            ? `⚔ ${queue[0].name} (Lv ${queue[0].lv}) ปรากฏตัว!`
            : `⚔ พบมอนสเตอร์ ${queue.length} ตัว! เริ่มต่อสู้กับ ${queue[0].name}`,
        ]
        set({
          screen: 'battle',
          battle: {
            enemy: queue[0],
            queue,
            defeatedCount: 0,
            totalCount: queue.length,
            rewards: { exp: 0, gold: 0, items: [] },
            phase: 'fighting',
            turn: 'player',
            finished: false,
          },
          battleLog: log,
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

        if (!victory) {
          // Defeat ends the whole encounter immediately.
          get().pushBattleLog('💀 พ่ายแพ้!')
          get().log('💀 พ่ายแพ้... กลับสู่หมู่บ้าน', 'bad')
          set({ battle: { ...b, phase: 'finished-loss', finished: true } })
          setTimeout(() => get().defeatReset(), 1800)
          return
        }

        // Victory over the CURRENT enemy: accumulate rewards, then either
        // move to 'between' (more enemies) or 'finished-win' (last enemy).
        const expG = b.enemy.exp
        const goldG = b.enemy.gold + Math.floor(Math.random() * 5)
        const drops = rollLoot(b.enemy, Math.random)
        get().gainGold(goldG)
        for (const itemKey of drops) {
          get().addItem(itemKey)
          if (itemKey === 'plus-stone') {
            get().log(`💠 ได้ หินตีบวก!`, 'good')
          } else {
            const it = get().content?.items[itemKey]
            if (it) get().log(`🎁 ได้ ${it.emoji} ${it.name}!`, 'good')
          }
        }
        get().gainExp(expG)
        get().pushBattleLog(`🎉 ปราบ ${b.enemy.name} → EXP ${expG}, ทอง ${goldG}`)
        get().log(`ปราบ ${b.enemy.name} → EXP ${expG}, ทอง ${goldG}`, 'good')

        const rewards = {
          exp: b.rewards.exp + expG,
          gold: b.rewards.gold + goldG,
          items: [...b.rewards.items, ...drops],
        }
        const defeatedCount = b.defeatedCount + 1
        const remainingQueue = b.queue.slice(1)
        const isLast = remainingQueue.length === 0

        set({
          battle: {
            ...b,
            queue: remainingQueue,
            defeatedCount,
            rewards,
            phase: isLast ? 'finished-win' : 'between',
            finished: true,
          },
        })

        if (isLast) {
          // Spawn tile is consumed only when the WHOLE encounter ends.
          if (pendingMapMonIdx >= 0) {
            const monsters = [...get().monsters]
            monsters.splice(pendingMapMonIdx, 1)
            set({ monsters })
            pendingMapMonIdx = -1
            if (monsters.length < 3) {
              setTimeout(() => {
                if (get().screen === 'game') get().spawnMonsters()
              }, 4000)
            }
          }
        }
      },

      nextEnemy: () => {
        const b = get().battle
        if (!b || b.phase !== 'between') return
        const next = b.queue[0]
        if (!next) return
        set({
          battle: {
            ...b,
            enemy: next,
            phase: 'fighting',
            finished: false,
            turn: 'player',
          },
          battleLog: [
            ...get().battleLog,
            `⚔ ${next.name} (Lv ${next.lv}) ปรากฏตัวต่อ!`,
          ],
        })
      },

      fleeEncounter: () => {
        const b = get().battle
        if (!b) return
        // Speed-based escape, same formula as the legacy single-fight flee.
        const g = get().game
        const chance = 0.5 + (g.spd - b.enemy.spd) * 0.05
        if (Math.random() < chance) {
          get().pushBattleLog('🏃 หนีสำเร็จ!')
          // Rewards already accumulated stay credited (gold/exp/items were
          // granted at each endBattle call).
          if (pendingMapMonIdx >= 0) {
            const monsters = [...get().monsters]
            monsters.splice(pendingMapMonIdx, 1)
            set({ monsters })
            pendingMapMonIdx = -1
          }
          setTimeout(() => {
            set({ screen: 'game', battle: null, battleLog: [] })
          }, 800)
        } else {
          get().pushBattleLog('💨 หนีไม่ทัน!')
          // Fail → enemy gets a free swing only if we're mid-fight (in 'between'
          // we just stay there; player can try flee again or pick 'next').
          if (b.phase === 'fighting') {
            // Enemy attacks via a tiny direct path (mirrors BattleScreen.enemyTurn).
            setTimeout(() => {
              const cur = get().battle
              if (!cur || cur.phase !== 'fighting') return
              const dmg = Math.max(1, cur.enemy.atk - Math.floor(g.def / 2))
              get().battleDamage('player', dmg)
              get().pushBattleLog(`👹 ${cur.enemy.name} โจมตี → ${dmg}`)
              if (get().game.hp <= 0) {
                get().endBattle(false)
              } else {
                get().setBattleTurn('player')
              }
            }, 500)
          }
        }
      },

      returnToMap: () => {
        const b = get().battle
        if (!b) return
        set({ screen: 'game', battle: null, battleLog: [] })
      },

      defeatReset: () => {
        const g = { ...get().game }
        g.gold = Math.floor(g.gold / 2)
        g.hp = g.maxHp
        g.mp = g.maxMp
        g.map = 'village'
        g.px = 5; g.py = 5
        const mapInfo = requireMap(get().content, g.map)
        set({
          game: g,
          monsters: spawnForMap(mapInfo, g.px, g.py),
          battle: null,
          battleLog: [],
          screen: 'game',
        })
      },

      // Inventory
      equip: (key) => {
        const it = get().content?.items[key]
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
        const it = get().content?.items[key]
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
        const { game, content } = get()
        if (!content) return false
        const rec = content.recipes.find(r => r.result === resultKey)
        if (!rec) return false
        for (const k of Object.keys(rec.mats)) {
          if ((game.inventory[k] || 0) < rec.mats[k]) return false
        }
        if (game.gold < rec.gold) return false
        for (const k of Object.keys(rec.mats)) get().removeItem(k, rec.mats[k])
        get().spendGold(rec.gold)
        get().addItem(resultKey)
        const itemName = content.items[resultKey]?.name ?? resultKey
        get().log(`⚒ คราฟ ${itemName} สำเร็จ!`, 'good')
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
          const name = get().content?.items[key]?.name ?? key
          get().log(`✨ ตีบวก ${name} สำเร็จ! → +${r.newPlus}`, 'good')
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

      allocateStat: async (stat, amount) => {
        const token = get().token
        const id = get().activeCharacterId
        if (!token || !id) throw new Error('no active character')
        const r = await api.allocateStat(token, id, stat, amount)
        const { id: _, ...gameState } = r.character
        void _
        set({ game: deriveStats(gameState) })
      },

      resetStats: async () => {
        const token = get().token
        const id = get().activeCharacterId
        if (!token || !id) throw new Error('no active character')
        const r = await api.resetCharacterStats(token, id)
        const { id: _, ...gameState } = r.character
        void _
        set({ game: deriveStats(gameState) })
        get().log('✨ รีเซ็ตสเตตัสแล้ว — กระจาย point ใหม่ได้เลย', 'good')
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

// ─── Autosave ─────────────────────────────────────────────────────────────
// PUT /api/character whenever `state.game` changes, debounced to absorb
// rapid-fire updates (walking, battles). Snapshot string dedup prevents
// re-PUTing the server's own data right back to it after a load.
//
// Note on the subscribe shape: we deliberately do NOT rely on Zustand's
// `(state, prevState)` listener signature — across versions and middleware
// (persist, HMR re-eval) the prev arg has been observed missing in the wild.
// Instead we read fresh state from getState() and detect change via JSON
// snapshot diff. Slower per-call but bulletproof.

const AUTOSAVE_DEBOUNCE_MS = 800
let saveTimer: ReturnType<typeof setTimeout> | null = null
let lastSavedSnapshot: string | null = null
let lastSeenToken: string | null = null

/** Observable autosave state for UI indicators. */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
let saveStatus: SaveStatus = 'idle'
const statusListeners = new Set<(s: SaveStatus) => void>()
function setSaveStatus(s: SaveStatus): void {
  if (saveStatus === s) return
  saveStatus = s
  for (const fn of statusListeners) fn(s)
}
export function getSaveStatus(): SaveStatus { return saveStatus }
export function subscribeSaveStatus(fn: (s: SaveStatus) => void): () => void {
  statusListeners.add(fn)
  return () => statusListeners.delete(fn)
}

function snapshotOf(g: GameState): string {
  return JSON.stringify(toSaveBody(g))
}

async function doSave(): Promise<void> {
  const cur = useGame.getState()
  if (!cur.token || !cur.activeCharacterId) return
  const snap = snapshotOf(cur.game)
  if (snap === lastSavedSnapshot) return
  setSaveStatus('saving')
  console.debug('[autosave] PUT /api/character/:id', {
    id: cur.activeCharacterId, lv: cur.game.lv, map: cur.game.map, px: cur.game.px, py: cur.game.py,
  })
  try {
    await api.saveCharacterById(cur.token, cur.activeCharacterId, toSaveBody(cur.game))
    lastSavedSnapshot = snap
    setSaveStatus('saved')
  } catch (err) {
    console.error('[autosave] save failed', err)
    setSaveStatus('error')
  }
}

useGame.subscribe(() => {
  const cur = useGame.getState()

  // Token transition (login / logout) — reset bookkeeping. Falls through so
  // a single set({token, game, ...}) call still primes the snapshot.
  if (cur.token !== lastSeenToken) {
    lastSeenToken = cur.token
    lastSavedSnapshot = null
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
    setSaveStatus('idle')
  }

  // Only autosave when we have an authenticated user with an active
  // character. Roster screens (no active id) don't trigger saves.
  if (!cur.token || !cur.activeCharacterId) return

  const snap = snapshotOf(cur.game)

  // First fire after load / character create — prime the snapshot so we don't
  // immediately re-PUT what we just GET-ed.
  if (lastSavedSnapshot === null) {
    lastSavedSnapshot = snap
    return
  }

  // Snapshot diff: only schedule when something actually changed.
  if (snap === lastSavedSnapshot) return

  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void doSave()
  }, AUTOSAVE_DEBOUNCE_MS)
})

console.debug('[autosave] subscriber registered (debounce', AUTOSAVE_DEBOUNCE_MS, 'ms)')

/** Flush any pending autosave immediately. Used for tab-close + visibility
 *  transitions so the latest state survives. Uses fetch keepalive so the
 *  browser will deliver the request even after the page is unloaded. */
export function flushSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  const cur = useGame.getState()
  if (!cur.token || !cur.activeCharacterId) return
  const snap = snapshotOf(cur.game)
  if (snap === lastSavedSnapshot) return
  lastSavedSnapshot = snap
  // Inline fetch so we can pass `keepalive`. ApiError handling is best-effort
  // — there's no UI to surface a failure once the tab is gone.
  const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'
  console.debug('[autosave] flushSave keepalive PUT', {
    id: cur.activeCharacterId, lv: cur.game.lv, map: cur.game.map,
  })
  fetch(`${API_URL}/api/character/${cur.activeCharacterId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cur.token}`,
    },
    body: JSON.stringify(toSaveBody(cur.game)),
    keepalive: true,
  }).catch(() => { /* tab is unloading; nothing we can do */ })
}
