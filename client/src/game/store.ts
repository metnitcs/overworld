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
  Race,
  CharClass,
} from '@asura/shared'
import {
  deriveStats, applyExp, scaleEnemy, rollLoot, rollSpawns,
  rollEncounter,
  findPath, type PathStep,
  TRANSCEND_LV, CLASS_CHANGE_LV, expForLv,
} from '@asura/shared'
import { api, ApiError, type SaveBody } from '../api/client'

/** Server-supplied Content bundle (ADR 0002). */
interface ContentBundle {
  items: Record<string, ItemDef>
  monsters: Record<string, MonsterDef>
  maps: Record<string, MapInfo>
  recipes: Recipe[]
  /** Slice 28: races + classes moved to DB (admin-editable). */
  races: Race[]
  classes: CharClass[]
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
/** Slice 38: `updatedAt` is the server's optimistic-concurrency token —
 *  echoed back in the next PUT as `expectedUpdatedAt`. */
export type CharacterRow = GameState & { id: string; updatedAt: string }

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
  /** Slice 26: Lv 5 class-change quest resolution. */
  classChange: (classId: string) => Promise<void>
  /** Slice 32: re-fetch the active character from server (admin edits +
   *  cross-tab sync). Replaces local `game` with fresh server state. */
  reloadActiveCharacter: () => Promise<void>
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
  // Slice 41: shop + healer intents
  buyFromShop: (npcId: string, itemKey: string, displayName: string) => Promise<void>
  healFull: (npcId: string) => Promise<void>
  // Craft / enhance / class change
  craft: (resultKey: string) => boolean
  enhance: (key: string, slot: '_w' | '_a') => Promise<void>
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
  classChanged: false,
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
 *  immutable on the server, leaving the mutable slice.
 *  Slice 38: also attaches `expectedUpdatedAt` from `lastSyncAt` so the
 *  server can reject stale writes that would clobber concurrent admin/
 *  other-tab inventory edits. */
function toSaveBody(g: GameState, expectedUpdatedAt?: string | null): SaveBody {
  // Use a destructure to discard identity fields cleanly.
  const { name: _n, raceId: _r, classId: _c, ...rest } = g
  void _n; void _r; void _c
  if (expectedUpdatedAt) return { ...rest, expectedUpdatedAt }
  return rest
}

// ─── Slice 38: optimistic-concurrency token tracking ──────────────────────
// `lastSyncAt` is the `updatedAt` string we last received from the server
// for the active character. Every successful GET/POST/PUT character call
// refreshes it. The autosave/explicit-save paths read it and stuff it into
// PUT bodies as `expectedUpdatedAt`. A 409 reply means another writer
// (admin GM-add, second tab) bumped the row between our read and write —
// we refetch, merge inventory/equip/plus/gold/identity from server, keep
// our pos/hp/mp/exp/stats, and retry once.
let lastSyncAt: string | null = null
let lastSyncForCharId: string | null = null
function rememberSync(charId: string, updatedAt: string): void {
  lastSyncForCharId = charId
  lastSyncAt = updatedAt
}
function syncTokenFor(charId: string): string | null {
  return lastSyncForCharId === charId ? lastSyncAt : null
}
function forgetSync(): void {
  lastSyncAt = null
  lastSyncForCharId = null
}

/** Smart merge for 409 (stale) replies. Keeps client's transient gameplay
 *  state (position, lv/exp/hp/mp, primary stats) but adopts the server's
 *  inventory/equip/plus/gold + identity — i.e. anything an admin or
 *  another tab would have written. Slice 45 will strip the adopted fields
 *  from PUT entirely, making this merge moot for those fields. */
function mergeAfterStale(client: GameState, server: GameState): GameState {
  return {
    ...client,
    inventory: { ...server.inventory },
    equipWeapon: server.equipWeapon,
    equipArmor: server.equipArmor,
    plus: { ...server.plus },
    gold: server.gold,
    name: server.name,
    raceId: server.raceId,
    classId: server.classId,
    transcended: server.transcended,
    classChanged: server.classChanged,
  }
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
            races: r.races,
            classes: r.classes,
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
        const { id: _, updatedAt, ...gameState } = found
        void _
        // Slice 38: prime the optimistic-concurrency token for this char.
        rememberSync(id, updatedAt)
        set({
          activeCharacterId: id,
          game: deriveStats(gameState, { items: get().content?.items }),
          monsters: spawnForMap(mapInfo, gameState.px, gameState.py),
          chat: [],
          screen: 'game',
        })
        get().log(`เลือก ${gameState.name} แล้ว — เริ่มที่ ${mapInfo.name}`, 'system')

        // Slice 29: if the loaded character is ALREADY past a quest
        // threshold without having picked, fire the modal right away.
        // (The level-up trigger in gainExp only fires on the threshold
        // edge; pre-existing chars need a load-time check too.)
        setTimeout(() => {
          const g = get().game
          if (g.lv >= TRANSCEND_LV && !g.transcended) {
            get().log('⏸ พบเควสค้าง: เลือกเผ่าก่อน EXP ถึงจะขึ้นต่อ', 'bad')
            set({ modal: 'race-change' })
          } else if (g.lv >= CLASS_CHANGE_LV && g.transcended && !g.classChanged) {
            get().log('⏸ พบเควสค้าง: เลือกอาชีพก่อน EXP ถึงจะขึ้นต่อ', 'bad')
            set({ modal: 'class-choice' })
          }
        }, 200)
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
        const { id: _, updatedAt, ...gameState } = r.character
        void _
        rememberSync(id, updatedAt)
        // Recompute derived stats with the new race.
        set({ game: deriveStats(gameState, { items: get().content?.items }) })
        await get().listCharacters()   // refresh roster cache
        get().log(`✨ เปลี่ยนเผ่าเป็น ${raceId}!`, 'good')
      },

      reloadActiveCharacter: async () => {
        const token = get().token
        const id = get().activeCharacterId
        if (!token || !id) return
        const r = await api.getCharacterById(token, id)
        const { id: _, updatedAt, ...gameState } = r.character
        void _
        rememberSync(id, updatedAt)
        // Recompute derived stats (in case formulas changed in shared
        // logic since the save).
        set({ game: deriveStats(gameState, { items: get().content?.items }) })
        // Refresh roster cache so character-select reflects latest too.
        await get().listCharacters()
      },

      classChange: async (classId) => {
        const token = get().token
        const id = get().activeCharacterId
        if (!token || !id) throw new Error('no active character')
        const r = await api.changeCharacterClass(token, id, classId)
        const { id: _, updatedAt, ...gameState } = r.character
        void _
        rememberSync(id, updatedAt)
        // No stat shift on class change — just rederive in case the new
        // skill's mp cost matters for derived display.
        set({ game: deriveStats(gameState, { items: get().content?.items }) })
        await get().listCharacters()
        const cls = get().content?.classes.find((c) => c.id === classId)
        get().log(`🎯 เปลี่ยนคลาสเป็น ${cls?.name ?? classId}!`, 'good')
      },

      newCharacter: async (name, classId) => {
        const token = get().token
        if (!token) throw new Error('not authenticated')
        // Slice 17: server fixes raceId to STARTER_RACE regardless of payload.
        const r = await api.createCharacter(token, { name, classId })
        const g = r.character
        const mapInfo = requireMap(get().content, g.map)
        const { id, updatedAt, ...gameState } = g
        rememberSync(id, updatedAt)
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
        const r = await putWithStaleRetry(token, id, get().game)
        if (r.ok) {
          if (r.gameAfter !== get().game) {
            set({ game: r.gameAfter })
            lastSavedSnapshot = snapshotOf(r.gameAfter)
          }
          get().log('💾 บันทึกเกมสำเร็จ', 'good')
        } else {
          const err = r.err
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

      recalc: () => set({ game: deriveStats(get().game, { items: get().content?.items }) }),

      gainExp: (amt) => {
        const cur = get().game

        // Slice 29: EXP is HARD-CAPPED at the quest threshold until the
        // player resolves the quest. Hitting Lv 10 with !transcended (or
        // Lv 120 with !classChanged) freezes you at threshold-1 exp until
        // you pick — the modal is forced open.
        const racePending  = cur.lv >= TRANSCEND_LV   && !cur.transcended
        const classPending = cur.lv >= CLASS_CHANGE_LV && cur.transcended && !cur.classChanged

        if (racePending || classPending) {
          // Cap exp just below next level so player CAN'T tick over to Lv+1.
          const cap = expForLv(cur.lv) - 1
          const newExp = Math.min(cur.exp + amt, cap)
          if (newExp !== cur.exp) {
            set({ game: { ...cur, exp: newExp } })
          }
          // NOTE: don't pop the modal here — gainExp fires during
          // endBattle when screen='battle', so the modal would mount
          // over the battle UI. Modal-pop is handled centrally by
          // checkPendingQuest() in returnToMap / selectCharacter so
          // it always shows when the player is back on the game screen.
          const msg = racePending
            ? '⏸ ต้องเลือกเผ่าก่อน EXP ถึงจะขึ้นต่อ'
            : '⏸ ต้องเลือกอาชีพก่อน EXP ถึงจะขึ้นต่อ'
          get().log(msg, 'bad')
          return
        }

        // Normal path — gain exp + level up.
        const { lv, exp, levelsGained } = applyExp(cur.lv, cur.exp, amt)
        let g = { ...cur, lv, exp }
        if (levelsGained > 0) {
          for (let i = 1; i <= levelsGained; i++) {
            get().log(`🎉 เลเวลอัพ! ตอนนี้ Lv ${cur.lv + i}`, 'good')
          }
          g = deriveStats(g, { items: get().content?.items })
          g.hp = g.maxHp
          g.mp = g.maxMp
        }
        set({ game: g })

        // Slice 17 / 27: Lv 10 race-change quest fires when the player
        // crosses the threshold for the first time. (Subsequent kills
        // are caught by the racePending guard above.)
        if (
          cur.lv < TRANSCEND_LV &&
          g.lv >= TRANSCEND_LV &&
          !g.transcended &&
          get().modal === 'none' &&
          get().screen === 'game'
        ) {
          get().log(`✨ ได้เวลาเลือกเผ่าแล้ว! มนุษย์ / มาร / เทพ`, 'good')
          set({ modal: 'race-change' })
        }
        // Slice 26 / 27: Lv 120 class-change quest — endgame tier-3 choice.
        else if (
          cur.lv < CLASS_CHANGE_LV &&
          g.lv >= CLASS_CHANGE_LV &&
          g.transcended &&
          !g.classChanged &&
          get().modal === 'none' &&
          get().screen === 'game'
        ) {
          get().log(`🎯 ได้เวลาเลือกอาชีพสุดท้ายแล้ว!`, 'good')
          set({ modal: 'class-choice' })
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
            // Slice 29: re-pop pending quest modal on flee too.
            const gs = get().game
            if (gs.lv >= TRANSCEND_LV && !gs.transcended && get().modal === 'none') {
              set({ modal: 'race-change' })
            } else if (gs.lv >= CLASS_CHANGE_LV && gs.transcended && !gs.classChanged && get().modal === 'none') {
              set({ modal: 'class-choice' })
            }
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
        // Slice 29: re-check pending quest after returning from battle.
        // If EXP got capped mid-fight (lv ≥ threshold + flag false),
        // the modal must pop now that we're back on the game screen.
        const g = get().game
        if (g.lv >= TRANSCEND_LV && !g.transcended && get().modal === 'none') {
          set({ modal: 'race-change' })
        } else if (g.lv >= CLASS_CHANGE_LV && g.transcended && !g.classChanged && get().modal === 'none') {
          set({ modal: 'class-choice' })
        }
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
      // Slice 36: equip/unequip return to the classic Thai-web-MMO model
      // — the item STAYS in the inventory; the slot just points to it.
      //   - "เห็นของในกระเป๋าตลอดเวลา" feels familiar to anyone who played
      //     Demon Online / Yulgang / etc.
      //   - Equipping requires inv[key] ≥ 1 (you own it).
      //   - Unequipping never removes from inv.
      //   - Safety net: if the slot was admin-assigned without an inv
      //     row, unequip auto-adds 1 so the item isn't lost. Keeps the
      //     Slice 33 data-loss fix in place without breaking the
      //     player-side mental model.
      // Slice 39: equip/unequip now call dedicated intent endpoints —
      // server validates inventory + flips the pointer + returns the
      // freshly-derived character. No more local mutation + autosave race.
      equip: (key) => {
        const token = get().token
        const id = get().activeCharacterId
        const it = get().content?.items[key]
        if (!token || !id || !it) return
        if (it.type !== 'weapon' && it.type !== 'armor') return
        if ((get().game.inventory[key] || 0) < 1) {
          get().log(`ไม่มี ${it.name} ในกระเป๋า`, 'bad')
          return
        }
        void (async () => {
          setSaveStatus('saving')
          try {
            const r = await api.equipCharacter(token, id, key)
            const { id: _, updatedAt, ...gameState } = r.character
            void _
            rememberSync(id, updatedAt)
            const next = deriveStats(gameState, { items: get().content?.items })
            useGame.setState({ game: next })
            lastSavedSnapshot = snapshotOf(next)
            setSaveStatus('saved')
            get().log(`สวม ${it.name}`, 'good')
          } catch (err) {
            setSaveStatus('error')
            const msg = err instanceof ApiError && err.body && typeof err.body === 'object' && 'error' in err.body
              ? String((err.body as { error: string }).error) : String(err)
            get().log(`สวมไม่ได้: ${msg}`, 'bad')
          }
        })()
      },
      unequip: (key) => {
        const token = get().token
        const id = get().activeCharacterId
        if (!token || !id) return
        const game = get().game
        const slot: 'weapon' | 'armor' | null =
          game.equipWeapon === key ? 'weapon' :
          game.equipArmor === key ? 'armor' : null
        if (!slot) return
        const itName = get().content?.items[key]?.name ?? key
        void (async () => {
          setSaveStatus('saving')
          try {
            const r = await api.unequipCharacter(token, id, slot)
            const { id: _, updatedAt, ...gameState } = r.character
            void _
            rememberSync(id, updatedAt)
            const next = deriveStats(gameState, { items: get().content?.items })
            useGame.setState({ game: next })
            lastSavedSnapshot = snapshotOf(next)
            setSaveStatus('saved')
            get().log(`ถอด ${itName}`, 'system')
          } catch (err) {
            setSaveStatus('error')
            const msg = err instanceof ApiError && err.body && typeof err.body === 'object' && 'error' in err.body
              ? String((err.body as { error: string }).error) : String(err)
            get().log(`ถอดไม่ได้: ${msg}`, 'bad')
          }
        })()
      },
      // Slice 40: consume now flows through the server. Heal clamp +
      // inventory decrement are atomic + cheat-proof.
      useConsume: (key) => {
        const token = get().token
        const id = get().activeCharacterId
        const it = get().content?.items[key]
        if (!token || !id || !it || it.type !== 'consume') return
        if ((get().game.inventory[key] || 0) < 1) return
        void (async () => {
          setSaveStatus('saving')
          try {
            const r = await api.consumeItem(token, id, key)
            const { id: _, updatedAt, ...gameState } = r.character
            void _
            rememberSync(id, updatedAt)
            const next = deriveStats(gameState, { items: get().content?.items })
            useGame.setState({ game: next })
            lastSavedSnapshot = snapshotOf(next)
            setSaveStatus('saved')
            get().log(`ใช้ ${it.name}`, 'good')
          } catch (err) {
            setSaveStatus('error')
            const msg = err instanceof ApiError && err.body && typeof err.body === 'object' && 'error' in err.body
              ? String((err.body as { error: string }).error) : String(err)
            get().log(`ใช้ไม่ได้: ${msg}`, 'bad')
          }
        })()
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

      // Slice 41: shop buy + healer service via server intents.
      buyFromShop: async (npcId, itemKey, displayName) => {
        const token = get().token
        const id = get().activeCharacterId
        if (!token || !id) return
        setSaveStatus('saving')
        try {
          const r = await api.buyFromShop(token, id, npcId, itemKey, 1)
          const { id: _, updatedAt, ...gameState } = r.character
          void _
          rememberSync(id, updatedAt)
          const next = deriveStats(gameState, { items: get().content?.items })
          useGame.setState({ game: next })
          lastSavedSnapshot = snapshotOf(next)
          setSaveStatus('saved')
          get().log(`ซื้อ ${displayName}`, 'good')
        } catch (err) {
          setSaveStatus('error')
          const msg = err instanceof ApiError && err.body && typeof err.body === 'object' && 'error' in err.body
            ? String((err.body as { error: string }).error) : String(err)
          get().log(`ซื้อไม่ได้: ${msg}`, 'bad')
        }
      },
      healFull: async (npcId) => {
        const token = get().token
        const id = get().activeCharacterId
        if (!token || !id) return
        setSaveStatus('saving')
        try {
          const r = await api.healFull(token, id, npcId)
          const { id: _, updatedAt, ...gameState } = r.character
          void _
          rememberSync(id, updatedAt)
          const next = deriveStats(gameState, { items: get().content?.items })
          useGame.setState({ game: next })
          lastSavedSnapshot = snapshotOf(next)
          setSaveStatus('saved')
          get().log('💊 ฟื้นฟูเต็มหลอด!', 'good')
        } catch (err) {
          setSaveStatus('error')
          const msg = err instanceof ApiError && err.body && typeof err.body === 'object' && 'error' in err.body
            ? String((err.body as { error: string }).error) : String(err)
          get().log(`รักษาไม่ได้: ${msg}`, 'bad')
        }
      },

      // Slice 42: craft flows through server intent — atomic spend+gain
      // protects against half-craft on a race + cheaper-recipe spoof.
      craft: (resultKey) => {
        const token = get().token
        const id = get().activeCharacterId
        const content = get().content
        if (!token || !id || !content) return false
        const rec = content.recipes.find(r => r.result === resultKey)
        if (!rec) return false
        const itemName = content.items[resultKey]?.name ?? resultKey
        void (async () => {
          setSaveStatus('saving')
          try {
            const r = await api.craftRecipe(token, id, resultKey)
            const { id: _, updatedAt, ...gameState } = r.character
            void _
            rememberSync(id, updatedAt)
            const next = deriveStats(gameState, { items: get().content?.items })
            useGame.setState({ game: next })
            lastSavedSnapshot = snapshotOf(next)
            setSaveStatus('saved')
            get().log(`⚒ คราฟ ${itemName} สำเร็จ!`, 'good')
          } catch (err) {
            setSaveStatus('error')
            const msg = err instanceof ApiError && err.body && typeof err.body === 'object' && 'error' in err.body
              ? String((err.body as { error: string }).error) : String(err)
            get().log(`คราฟไม่ได้: ${msg}`, 'bad')
          }
        })()
        return true
      },

      // Slice 43: enhance now resolves on the server (RNG, atomic stone
      // spend + plus update). Outcome surfaces via chat log.
      enhance: async (key, slot) => {
        const token = get().token
        const id = get().activeCharacterId
        if (!token || !id) return
        const name = get().content?.items[key]?.name ?? key
        setSaveStatus('saving')
        try {
          const r = await api.enhanceItem(token, id, key, slot)
          const { id: _, updatedAt, ...gameState } = r.character
          void _
          rememberSync(id, updatedAt)
          const next = deriveStats(gameState, { items: get().content?.items })
          useGame.setState({ game: next })
          lastSavedSnapshot = snapshotOf(next)
          setSaveStatus('saved')
          if (r.outcome === 'ok') {
            get().log(`✨ ตีบวก ${name} สำเร็จ! → +${r.newPlus}`, 'good')
          } else {
            get().log(`💥 ตีบวกล้มเหลว! → +${r.newPlus}`, 'bad')
          }
        } catch (err) {
          setSaveStatus('error')
          if (err instanceof ApiError && err.body && typeof err.body === 'object'
              && 'error' in err.body && (err.body as { error: string }).error === 'no-stone') {
            get().log('💠 หินตีบวกไม่พอ', 'bad')
          } else {
            const msg = err instanceof Error ? err.message : String(err)
            get().log(`ตีบวกไม่ได้: ${msg}`, 'bad')
          }
        }
      },

      changeClass: (classId, cost) => {
        if (!get().spendGold(cost)) return false
        const g = { ...get().game, classId }
        set({ game: deriveStats(g, { items: get().content?.items }) })
        const newCls = get().content?.classes.find(c => c.id === classId)
        get().log(`🔄 เปลี่ยนอาชีพเป็น ${newCls?.name ?? classId}`, 'good')
        return true
      },

      allocateStat: async (stat, amount) => {
        const token = get().token
        const id = get().activeCharacterId
        if (!token || !id) throw new Error('no active character')
        const r = await api.allocateStat(token, id, stat, amount)
        const { id: _, updatedAt, ...gameState } = r.character
        void _
        rememberSync(id, updatedAt)
        set({ game: deriveStats(gameState, { items: get().content?.items }) })
      },

      resetStats: async () => {
        const token = get().token
        const id = get().activeCharacterId
        if (!token || !id) throw new Error('no active character')
        const r = await api.resetCharacterStats(token, id)
        const { id: _, updatedAt, ...gameState } = r.character
        void _
        rememberSync(id, updatedAt)
        set({ game: deriveStats(gameState, { items: get().content?.items }) })
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
      // Persist the auth token + last-active character + last-visited
      // screen so a refresh lands where the user was.
      //   Slice 5/16 originals: token, username
      //   Slice 32: activeCharacterId (auto-resume the game)
      //   Slice 34: screen — picks from {admin, game, character-select}
      //             only (battle / create / title / auth are excluded so
      //             reload doesn't drop into transient flows).
      partialize: (s) => ({
        token: s.token,
        username: s.username,
        activeCharacterId: s.activeCharacterId,
        screen: (['admin', 'game', 'character-select'] as Screen[]).includes(s.screen) ? s.screen : undefined,
      }),
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

/** Slice 38: PUT once with the current sync token. On 409 (stale), adopt
 *  server's inventory/equip/plus/gold (the admin-owned slice), keep client's
 *  pos/hp/exp/stats, refresh sync token, and retry once. Returns true on
 *  success. The caller wires status reporting & snapshot bookkeeping. */
async function putWithStaleRetry(
  token: string, charId: string, game: GameState,
): Promise<{ ok: true; gameAfter: GameState } | { ok: false; err: unknown }> {
  try {
    const r = await api.saveCharacterById(token, charId, toSaveBody(game, syncTokenFor(charId)))
    rememberSync(charId, r.character.updatedAt)
    return { ok: true, gameAfter: game }
  } catch (err) {
    if (err instanceof ApiError && err.status === 409 && err.body
        && typeof err.body === 'object' && 'character' in err.body) {
      const server = (err.body as { character: GameState & { id: string; updatedAt: string } }).character
      const { id: _sid, updatedAt: srvAt, ...srvGame } = server
      void _sid
      const merged = mergeAfterStale(game, srvGame)
      rememberSync(charId, srvAt)
      console.debug('[autosave] 409 stale — merged + retry', { charId })
      try {
        const r2 = await api.saveCharacterById(token, charId, toSaveBody(merged, srvAt))
        rememberSync(charId, r2.character.updatedAt)
        return { ok: true, gameAfter: merged }
      } catch (retryErr) {
        return { ok: false, err: retryErr }
      }
    }
    return { ok: false, err }
  }
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
  const r = await putWithStaleRetry(cur.token, cur.activeCharacterId, cur.game)
  if (r.ok) {
    // If a 409-merge changed game, splice it into the store so the UI
    // reflects the freshly-adopted inventory/equip/plus/gold.
    if (r.gameAfter !== cur.game) {
      useGame.setState({ game: r.gameAfter })
      lastSavedSnapshot = snapshotOf(r.gameAfter)
      cur.log('🔄 sync ของในกระเป๋ากับ server แล้ว', 'system')
    } else {
      lastSavedSnapshot = snap
    }
    setSaveStatus('saved')
  } else {
    console.error('[autosave] save failed', r.err)
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
    forgetSync()
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
    body: JSON.stringify(toSaveBody(cur.game, syncTokenFor(cur.activeCharacterId))),
    keepalive: true,
  }).catch(() => { /* tab is unloading; nothing we can do */ })
}

// ─── Slice 28 selectors: race + class lookups from the live cache ───────
// Replace the old static imports of RACES/CLASSES/AVAILABLE_* with these
// hooks so admin edits show up immediately after `loadContent()`.
// Defined AFTER useGame so the const reference resolves at evaluation time.
export const useRaces = (): Race[] => useGame((s) => s.content?.races ?? [])
export const useClasses = (): CharClass[] => useGame((s) => s.content?.classes ?? [])
export const useAvailableRaces = (): Race[] =>
  useGame((s) => (s.content?.races ?? []).filter((r) => r.available))
export const useAvailableClasses = (): CharClass[] =>
  useGame((s) => (s.content?.classes ?? []).filter((c) => !c.starter && c.available))
/** Slice 27: classes available to a player with the given race at Lv 120. */
export const useClassesForRace = (raceId: string): CharClass[] =>
  useGame((s) => (s.content?.classes ?? [])
    .filter((c) => !c.starter && c.available && c.requiredRaceId === raceId),
  )
