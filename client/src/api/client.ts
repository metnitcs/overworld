import type {
  GameState, ItemDef, MonsterDef, TileDef, WarpDef, NpcKind, ShopEntry, Recipe,
  Race, CharClass,
} from '@asura/shared'

// Vite exposes VITE_* env vars at build time (see client/.env.example).
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

/** Public API origin — used to absolute-resolve admin-uploaded paths like
 *  `/uploads/maps/foo.png` so they load from the server, not the Vite dev
 *  server. Static `/assets/...` paths (committed to client/public) are NOT
 *  prefixed — they're served by Vite itself. */
export function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/uploads/')) return `${API_URL}${url}`
  return url
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API ${status}`)
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  token?: string | null
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  // Only set Content-Type when we have a body — Fastify rejects requests that
  // declare JSON content-type with an empty body (FST_ERR_CTP_EMPTY_JSON_BODY).
  // This matters for POST/DELETE calls with no payload (admin cache reload,
  // delete endpoints).
  const headers: Record<string, string> = {}
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, json)
  return json as T
}

export interface AuthResponse {
  token: string
  user: { id: string; username: string; role?: 'USER' | 'ADMIN' }
}

export interface MeResponse {
  user: { id: string; username: string; role: 'USER' | 'ADMIN' }
}

// ─── Admin-facing wire shapes ───────────────────────────────────────────────

export type AdminItemType = 'mat' | 'consume' | 'weapon' | 'armor'
export type AdminRarity = 'common' | 'rare' | 'epic' | 'legendary'
export type AdminMonsterRank = 'normal' | 'elite' | 'boss'

export interface AdminItemRow {
  id: string
  name: string
  emoji: string
  type: AdminItemType
  rarity: AdminRarity
  atk: number | null
  def: number | null
  matk: number | null
  heal: number | null
  healMp: number | null
  // Slice 51: per-item primary stat bonuses (flat, not Plus-scaled).
  bonusStr: number | null
  bonusInt: number | null
  bonusDex: number | null
  bonusAgi: number | null
  bonusLuk: number | null
  bonusVit: number | null
  desc: string
}

export interface AdminItemBody {
  name: string
  emoji: string
  type: AdminItemType
  rarity?: AdminRarity
  atk?: number | null
  def?: number | null
  matk?: number | null
  heal?: number | null
  healMp?: number | null
  bonusStr?: number | null
  bonusInt?: number | null
  bonusDex?: number | null
  bonusAgi?: number | null
  bonusLuk?: number | null
  bonusVit?: number | null
  desc: string
}

export interface AdminDropEntry {
  item: string
  chance: number
  minQty: number
  maxQty: number
}

export interface AdminMonsterRow {
  id: string
  name: string
  emoji: string
  rank: AdminMonsterRank
  lv: number
  hp: number
  atk: number
  def: number
  spd: number
  exp: number
  gold: number
  drops: Array<{
    itemId: string
    chance: number
    minQty: number
    maxQty: number
  }>
}

export interface AdminMonsterBody {
  name: string
  emoji: string
  rank?: AdminMonsterRank
  lv: number
  hp: number
  atk: number
  def: number
  spd: number
  exp: number
  gold: number
  drops: AdminDropEntry[]
}

export interface AdminTile {
  glyph?: string
  walkable: boolean
  kind?: 'shop' | 'healer' | 'quest' | 'warp'
}

export interface AdminMapMonsterEntry {
  monsterId: string
  spawnWeight: number
}

export interface AdminWarpEntry {
  x: number
  y: number
  toMapId: string
  tx: number
  ty: number
  label?: string | null
}

export interface AdminMapRow {
  id: string
  name: string
  minLv: number
  maxLv: number
  w: number
  h: number
  bg: string
  bgImage: string | null
  pathColor: string | null
  monsterCount: number
  layout: AdminTile[][]
  monsters: AdminMapMonsterEntry[]
  warps: AdminWarpEntry[]
}

export interface AdminMapBody {
  name: string
  minLv: number
  maxLv: number
  w: number
  h: number
  bg: string
  bgImage?: string | null
  pathColor?: string | null
  monsterCount: number
  layout: AdminTile[][]
  monsters: AdminMapMonsterEntry[]
  warps: AdminWarpEntry[]
}

export interface AdminCharacterRow {
  id: string
  username: string
  name: string
  raceId: string
  classId: string
  lv: number
  exp: number
  gold: number
  mapId: string
  transcended: boolean
  classChanged: boolean
  str: number
  int: number
  dex: number
  agi: number
  luk: number
  vit: number
  unspentPoints: number
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  atk: number
  def: number
  spd: number
  /** Slice 47: FK to the equipped InventoryItem.id (was an itemKey string). */
  equipWeapon: string | null
  equipArmor: string | null
  /** Slice 47: per-instance rows. weapon/armor: 1 row per physical item with
   *  its own `plus`; mat/consume: 1 row per (charId, itemKey) with qty. */
  inventory: Array<{ id: string; itemKey: string; qty: number; plus: number }>
}

export interface AdminCharacterPatch {
  lv?: number
  exp?: number
  gold?: number
  hp?: number
  maxHp?: number
  mp?: number
  maxMp?: number
  atk?: number
  def?: number
  spd?: number
  mapId?: string
  str?: number
  int?: number
  dex?: number
  agi?: number
  luk?: number
  vit?: number
  unspentPoints?: number
  raceId?: string
  classId?: string
  transcended?: boolean
  classChanged?: boolean
  // Slice 47: equip + Plus + inventory mutations moved to per-row admin
  // intent endpoints (Slice 49). Keeping them out of the patch surface
  // means the type can't accidentally request a clobbering write.
}

// ─── Slice 30: User management + Audit log ─────────────────────────────

export type AdminUserStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED'

export interface AdminUserRow {
  id: string
  username: string
  email: string | null
  role: 'USER' | 'ADMIN'
  status: AdminUserStatus
  createdAt: string
  characterCount: number
}

export interface AdminLogRow {
  id: string
  actorUserId: string | null
  action: string
  targetType: string
  targetId: string | null
  payload: unknown
  createdAt: string
}

/** Slice 38: server now decorates every character payload with
 *  `updatedAt` (ISO). The store mirrors it into `lastSyncAt[characterId]`
 *  so the next PUT can include `expectedUpdatedAt` for optimistic concurrency. */
export type CharacterPayload = GameState & { id: string; updatedAt: string }

export interface CharacterResponse {
  character: CharacterPayload
}

export interface CharactersListResponse {
  characters: CharacterPayload[]
  slotLimit: number
}

/** Slice 38: 409 body returned when the client's PUT carried a stale
 *  expectedUpdatedAt. `character` is the fresh row. */
export interface StaleCharacterError {
  error: 'stale'
  character: CharacterPayload
}

/** NPC entry on the wire, with shop stock inlined when applicable. */
export interface NpcResponse {
  id: string
  name: string
  emoji: string | null
  x: number
  y: number
  kind: NpcKind
  shop: ShopEntry[]
}

/** Map entry on the wire — embeds the spawn-monster id list, outgoing Warps,
 *  and NPCs inline so the client only round-trips once per session. */
export interface MapResponse {
  id: string
  name: string
  minLv: number
  maxLv: number
  w: number
  h: number
  bg: string
  /** Slice 21: optional background image path. */
  bgImage: string | null
  pathColor: string | null
  monsterCount: number
  layout: TileDef[][]
  monsters: string[]
  warps: WarpDef[]
  npcs: NpcResponse[]
}

/** Shape of GET /api/content — the Zustand content cache mirrors this 1:1. */
export interface ContentResponse {
  items: Record<string, ItemDef>
  monsters: Record<string, MonsterDef>
  maps: Record<string, MapResponse>
  recipes: Recipe[]
  /** Slice 28: races + classes moved to DB. Client UI reads from here
   *  instead of importing the static RACES/CLASSES from @asura/shared. */
  races: Race[]
  classes: CharClass[]
}

/** Fields persisted via PUT.
 *  Slice 38: `expectedUpdatedAt` is the optimistic-concurrency token. The
 *  store passes the value from `lastSyncAt[characterId]` (received in the
 *  most recent GET/PUT response). Server rejects with 409 on mismatch.
 *  Slice 45: gold / inventory / equipWeapon / equipArmor / plus removed —
 *  those mutations now flow exclusively through intent endpoints
 *  (equip, unequip, consume, shop/buy, heal-full, craft, enhance,
 *  battle/resolve). Identity fields name/raceId/classId remain immutable
 *  outside of POST /character (creation) and POST /transcend +
 *  POST /change-class. */
export type SaveBody = Omit<
  GameState,
  'name' | 'raceId' | 'classId' | 'gold' | 'inventory' | 'equipWeapon' | 'equipArmor'
> & {
  expectedUpdatedAt?: string
}

export const api = {
  register: (username: string, password: string) =>
    request<AuthResponse>('/api/auth/register', { method: 'POST', body: { username, password } }),

  login: (username: string, password: string) =>
    request<AuthResponse>('/api/auth/login', { method: 'POST', body: { username, password } }),

  // ─── Multi-character (Slice 16) ───
  listCharacters: (token: string) =>
    request<CharactersListResponse>('/api/characters', { token }),

  getCharacterById: (token: string, id: string) =>
    request<CharacterResponse>(`/api/character/${id}`, { token }),

  saveCharacterById: (token: string, id: string, body: SaveBody) =>
    request<CharacterResponse>(`/api/character/${id}`, { method: 'PUT', token, body }),

  deleteCharacter: (token: string, id: string) =>
    request<{ ok: true }>(`/api/character/${id}`, { method: 'DELETE', token }),

  /** Slice 17 race change at Lv 10. Server validates lv + AVAILABLE_RACES. */
  transcendCharacter: (token: string, id: string, raceId: string) =>
    request<CharacterResponse>(`/api/character/${id}/transcend`, {
      method: 'POST', token, body: { raceId },
    }),

  /** Slice 26 class change at Lv 5. Server validates lv + AVAILABLE_CLASSES. */
  changeCharacterClass: (token: string, id: string, classId: string) =>
    request<CharacterResponse>(`/api/character/${id}/change-class`, {
      method: 'POST', token, body: { classId },
    }),

  /** Slice 23 — spend stat points on one primary stat. */
  allocateStat: (token: string, id: string, stat: string, amount: number) =>
    request<CharacterResponse>(`/api/character/${id}/allocate`, {
      method: 'POST', token, body: { stat, amount },
    }),

  /** Slice 23 — reset all primary stats back to 10, refund every spent point. */
  resetCharacterStats: (token: string, id: string) =>
    request<CharacterResponse>(`/api/character/${id}/reset-stats`, {
      method: 'POST', token,
    }),

  /** Slice 47 — equip a specific InventoryItem row by id. Server validates
   *  ownership + ItemType, derives the slot, points the matching FK at the
   *  row, returns the freshly-derived character. The row stays in the bag
   *  list; the UI filters out rows whose id matches an equip FK. */
  equipCharacter: (token: string, id: string, inventoryItemId: string) =>
    request<CharacterResponse>(`/api/character/${id}/equip`, {
      method: 'POST', token, body: { inventoryItemId },
    }),

  /** Slice 47 — clear the named equip slot. Just sets the FK to null; the
   *  InventoryItem row is untouched (Plus preserved across re-equip). */
  unequipCharacter: (token: string, id: string, slot: 'weapon' | 'armor') =>
    request<CharacterResponse>(`/api/character/${id}/unequip`, {
      method: 'POST', token, body: { slot },
    }),

  /** Slice 40 — consume an item. Server applies the clamped heal/healMp
   *  + decrements inventory atomically. */
  consumeItem: (token: string, id: string, itemKey: string) =>
    request<CharacterResponse>(`/api/character/${id}/consume`, {
      method: 'POST', token, body: { itemKey },
    }),

  /** Slice 41 — buy from a shop NPC. Server validates the NPC is on the
   *  player's current map + sells the requested item, deducts gold,
   *  increments inventory atomically. */
  buyFromShop: (token: string, id: string, npcId: string, itemKey: string, qty = 1) =>
    request<CharacterResponse>(`/api/character/${id}/shop/buy`, {
      method: 'POST', token, body: { npcId, itemKey, qty },
    }),

  /** Slice 41 — heal-full from a healer NPC. Deducts HEAL_FULL_COST + sets
   *  hp/mp to max. NPC must be on the player's current map. */
  healFull: (token: string, id: string, npcId: string) =>
    request<CharacterResponse>(`/api/character/${id}/heal-full`, {
      method: 'POST', token, body: { npcId },
    }),

  /** Slice 42 — craft a recipe. Server validates classReq + mats + gold
   *  against DB recipe and runs the spend+gain in a single transaction. */
  craftRecipe: (token: string, id: string, recipeId: string) =>
    request<CharacterResponse>(`/api/character/${id}/craft`, {
      method: 'POST', token, body: { recipeId },
    }),

  /** Slice 48 — enhance gated by Blacksmith NPC. Server validates the NPC
   *  kind + same-map adjacency, rejects equipped items, and charges
   *  plus-stones + a gold fee (enhanceGoldCost). Response includes the
   *  resolved outcome + the freshly-derived character. */
  enhanceItem: (token: string, id: string, npcId: string, inventoryItemId: string) =>
    request<CharacterResponse & {
      outcome: 'ok' | 'fail'
      cost: number
      goldCost: number
      stonesConsumed: number
      goldConsumed: number
      newPlus: number
    }>(`/api/character/${id}/enhance`, {
      method: 'POST', token, body: { npcId, inventoryItemId },
    }),

  /** Slice 44 — credit reward for a defeated monster. Server rolls exp,
   *  gold, and drops from the DB monster def + writes to inventory atomically. */
  resolveBattle: (token: string, id: string, monsterId: string) =>
    request<CharacterResponse & {
      rewards: { exp: number; gold: number; items: string[]; levelsGained: number }
    }>(`/api/character/${id}/battle/resolve`, {
      method: 'POST', token, body: { monsterId },
    }),

  // ─── Legacy first-char endpoints (kept until full removal) ───
  getCharacter: (token: string) =>
    request<CharacterResponse>('/api/character', { token }),

  /** raceId is ignored server-side now (starter race always assigned).
   *  Kept in the type for backward compat with any caller that still passes it. */
  createCharacter: (token: string, body: { name: string; classId: string; raceId?: string }) =>
    request<CharacterResponse>('/api/character', { method: 'POST', token, body }),

  saveCharacter: (token: string, body: SaveBody) =>
    request<CharacterResponse>('/api/character', { method: 'PUT', token, body }),

  getContent: () => request<ContentResponse>('/api/content'),

  // ─── Slice 20: identity + admin panel ───
  me: (token: string) => request<MeResponse>('/api/me', { token }),

  adminListItems: (token: string) =>
    request<{ items: AdminItemRow[] }>('/api/admin/items', { token }),
  adminCreateItem: (token: string, body: AdminItemBody & { id: string }) =>
    request<{ item: AdminItemRow }>('/api/admin/items', { method: 'POST', token, body }),
  adminUpdateItem: (token: string, id: string, body: AdminItemBody) =>
    request<{ item: AdminItemRow }>(`/api/admin/items/${id}`, { method: 'PUT', token, body }),
  adminDeleteItem: (token: string, id: string) =>
    request<{ ok: true }>(`/api/admin/items/${id}`, { method: 'DELETE', token }),

  adminListMaps: (token: string) =>
    request<{ maps: AdminMapRow[] }>('/api/admin/maps', { token }),
  adminCreateMap: (token: string, body: AdminMapBody & { id: string }) =>
    request<{ map: AdminMapRow }>('/api/admin/maps', { method: 'POST', token, body }),
  adminUpdateMap: (token: string, id: string, body: AdminMapBody) =>
    request<{ map: AdminMapRow }>(`/api/admin/maps/${id}`, { method: 'PUT', token, body }),
  adminDeleteMap: (token: string, id: string) =>
    request<{ ok: true }>(`/api/admin/maps/${id}`, { method: 'DELETE', token }),

  adminListMonsters: (token: string) =>
    request<{ monsters: AdminMonsterRow[] }>('/api/admin/monsters', { token }),
  adminCreateMonster: (token: string, body: AdminMonsterBody & { id: string }) =>
    request<{ monster: AdminMonsterRow }>('/api/admin/monsters', { method: 'POST', token, body }),
  adminUpdateMonster: (token: string, id: string, body: AdminMonsterBody) =>
    request<{ monster: AdminMonsterRow }>(`/api/admin/monsters/${id}`, { method: 'PUT', token, body }),
  adminDeleteMonster: (token: string, id: string) =>
    request<{ ok: true }>(`/api/admin/monsters/${id}`, { method: 'DELETE', token }),

  adminListCharacters: (token: string) =>
    request<{ characters: AdminCharacterRow[] }>('/api/admin/characters', { token }),
  adminPatchCharacter: (token: string, id: string, body: AdminCharacterPatch) =>
    request<{ character: AdminCharacterRow }>(`/api/admin/characters/${id}`, { method: 'PUT', token, body }),
  adminDeleteCharacter: (token: string, id: string) =>
    request<{ ok: true }>(`/api/admin/characters/${id}`, { method: 'DELETE', token }),

  /** Slice 49 — per-row admin Set Plus. Updates the InventoryItem's `plus`
   *  and re-derives the owner's cached atk/def/spd so the player sees the
   *  change immediately. Audited as `inventory.set-plus`. */
  adminSetItemPlus: (token: string, inventoryItemId: string, plus: number) =>
    request<{ inventoryItem: { id: string; itemKey: string; qty: number; plus: number } }>(
      `/api/admin/inventory/${inventoryItemId}/set-plus`,
      { method: 'POST', token, body: { plus } },
    ),

  /** Slice 50 — admin Add Item. Stackable types (mat/consume) increment
   *  qty on the existing row; weapon/armor INSERT one fresh row per unit
   *  with the optional initial Plus. Returns the freshly-listed inventory
   *  so the form can render the result without a separate GET. Audited as
   *  `inventory.add`. */
  adminAddItem: (
    token: string,
    body: { characterId: string; itemKey: string; qty: number; plus?: number },
  ) =>
    request<{ inventory: Array<{ id: string; itemKey: string; qty: number; plus: number }> }>(
      '/api/admin/inventory',
      { method: 'POST', token, body },
    ),

  /** Slice 50 — admin Delete Item. Deletes one InventoryItem row. If the
   *  row was equipped, the schema's ON DELETE SET NULL clears the FK and
   *  the server re-derives the owner's cached atk/def afterward. Audited
   *  as `inventory.delete`. */
  adminDeleteInventoryItem: (token: string, inventoryItemId: string) =>
    request<{ ok: true }>(`/api/admin/inventory/${inventoryItemId}`, { method: 'DELETE', token }),

  // Slice 30 — Users + Audit logs
  adminListUsers: (token: string) =>
    request<{ users: AdminUserRow[] }>('/api/admin/users', { token }),
  adminSetUserStatus: (token: string, id: string, status: AdminUserStatus) =>
    request<{ user: { id: string; status: AdminUserStatus } }>(
      `/api/admin/users/${id}/status`,
      { method: 'PATCH', token, body: { status } },
    ),
  adminDeleteUser: (token: string, id: string) =>
    request<{ ok: true }>(`/api/admin/users/${id}`, { method: 'DELETE', token }),
  adminListLogs: (token: string, opts: { action?: string; targetType?: string; actorUserId?: string; limit?: number } = {}) => {
    const params = new URLSearchParams()
    if (opts.action) params.set('action', opts.action)
    if (opts.targetType) params.set('targetType', opts.targetType)
    if (opts.actorUserId) params.set('actorUserId', opts.actorUserId)
    if (opts.limit) params.set('limit', String(opts.limit))
    const qs = params.toString()
    return request<{ logs: AdminLogRow[] }>(`/api/admin/logs${qs ? `?${qs}` : ''}`, { token })
  },

  adminReloadCache: (token: string) =>
    request<{ ok: true }>('/api/admin/cache/reload', { method: 'POST', token }),

  // ─── Slice 28: race + class admin CRUD ──────────────────────────────
  adminListRaces: (token: string) =>
    request<{ races: Race[] }>('/api/admin/races', { token }),
  adminCreateRace: (token: string, body: Race) =>
    request<{ race: Race }>('/api/admin/races', { method: 'POST', token, body }),
  adminUpdateRace: (token: string, id: string, body: Omit<Race, 'id'>) =>
    request<{ race: Race }>(`/api/admin/races/${id}`, { method: 'PUT', token, body }),
  adminDeleteRace: (token: string, id: string) =>
    request<{ ok: true }>(`/api/admin/races/${id}`, { method: 'DELETE', token }),

  adminListClasses: (token: string) =>
    request<{ classes: CharClass[] }>('/api/admin/classes', { token }),
  adminCreateClass: (token: string, body: CharClass) =>
    request<{ class: CharClass }>('/api/admin/classes', { method: 'POST', token, body }),
  adminUpdateClass: (token: string, id: string, body: Omit<CharClass, 'id'>) =>
    request<{ class: CharClass }>(`/api/admin/classes/${id}`, { method: 'PUT', token, body }),
  adminDeleteClass: (token: string, id: string) =>
    request<{ ok: true }>(`/api/admin/classes/${id}`, { method: 'DELETE', token }),

  /** Slice 21: file upload. Multipart POST. Returns the public `/uploads/...`
   *  path which the caller stores in Map.bgImage (or future Item/Monster art). */
  adminUpload: async (token: string, file: File): Promise<{ url: string }> => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${API_URL}/api/admin/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    })
    const json: unknown = await res.json().catch(() => null)
    if (!res.ok) throw new ApiError(res.status, json)
    return json as { url: string }
  },
}
