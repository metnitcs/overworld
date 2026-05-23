import { useEffect, useMemo, useState } from 'react'
import { useGame } from '../game/store'
import {
  api, ApiError, resolveAssetUrl,
  type AdminItemRow, type AdminItemBody, type AdminItemType, type AdminRarity,
  type AdminMonsterRow, type AdminMonsterBody, type AdminMonsterRank, type AdminDropEntry,
  type AdminCharacterRow, type AdminCharacterPatch,
  type AdminMapRow, type AdminMapBody, type AdminTile, type AdminMapMonsterEntry,
  type AdminWarpEntry,
  type AdminUserRow, type AdminUserStatus, type AdminLogRow,
} from '../api/client'
import type { Race, CharClass, StatModifier, Skill, SkillType, PrimaryStat } from '@asura/shared'

/** Slice 20 + 22 — in-game L3 admin dashboard. Gated by role === 'ADMIN'.
 *  All visual styling is namespaced under `.admin-shell` in index.css so it
 *  doesn't fight with the kawaii pre-game palette. */
type Tab = 'items' | 'monsters' | 'maps' | 'races' | 'classes' | 'characters' | 'users' | 'logs' | 'cache'

interface CountState {
  items?: number
  monsters?: number
  maps?: number
  races?: number
  classes?: number
  characters?: number
  users?: number
}

export function AdminScreen() {
  const role = useGame((s) => s.role)
  const username = useGame((s) => s.username)
  const setScreen = useGame((s) => s.setScreen)
  const loadContent = useGame((s) => s.loadContent)
  const reloadActiveCharacter = useGame((s) => s.reloadActiveCharacter)

  // Slice 46: when leaving admin, refresh the Content cache + the active
  // character so any item/map/character edit the admin just made shows
  // up immediately in the game UI — without forcing a browser refresh
  // or waiting for the autosave's 409 round-trip to merge it in.
  async function backToGame() {
    try {
      await Promise.all([loadContent(), reloadActiveCharacter()])
    } catch (e) {
      console.error('[admin] back-to-game refresh failed', e)
    }
    setScreen('character-select')
  }
  // Slice 34: remember the last-visited admin tab across refreshes so a
  // reload doesn't always drop the user back on Items. localStorage is
  // enough — the tab is purely UI state, not server-relevant.
  const [tab, setTabRaw] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'items'
    const stored = window.localStorage.getItem('asura_admin_tab') as Tab | null
    const valid: Tab[] = ['items', 'monsters', 'maps', 'races', 'classes', 'characters', 'users', 'logs', 'cache']
    return stored && valid.includes(stored) ? stored : 'items'
  })
  const setTab = (t: Tab) => {
    setTabRaw(t)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('asura_admin_tab', t)
    }
  }
  const [counts, setCounts] = useState<CountState>({})

  if (role !== 'ADMIN') {
    return (
      <div className="admin-shell">
        <div className="admin-topbar">
          <h1>🛠 Admin Panel</h1>
          <button className="btn-ghost-light" onClick={() => setScreen('character-select')}>
            ← กลับ
          </button>
        </div>
        <div className="admin-content">
          <div className="admin-empty">
            <div className="icon">🚫</div>
            <div className="title">403 — ต้องเป็น admin</div>
            <div className="desc">บัญชีนี้ไม่ได้อยู่ใน ADMIN_USERS</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-shell">
      <div className="admin-topbar">
        <div>
          <h1>🛠 Admin Panel</h1>
          <div className="admin-subtitle">
            แก้ไข Content แบบ live · ทุก mutation invalidate cache อัตโนมัติ
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="admin-user-chip">
            <span>👤 {username ?? 'unknown'}</span>
            <span className="role-pill">ADMIN</span>
          </span>
          <button className="btn-ghost-light" onClick={() => void backToGame()}>
            ← กลับเกม
          </button>
        </div>
      </div>

      <div className="admin-body">
        <Sidebar tab={tab} setTab={setTab} counts={counts} />
        <div className="admin-content">
          {tab === 'items' && <ItemsTab onCount={(n) => setCounts((c) => ({ ...c, items: n }))} />}
          {tab === 'monsters' && <MonstersTab onCount={(n) => setCounts((c) => ({ ...c, monsters: n }))} />}
          {tab === 'maps' && <MapsTab onCount={(n) => setCounts((c) => ({ ...c, maps: n }))} />}
          {tab === 'races' && <RacesTab onCount={(n) => setCounts((c) => ({ ...c, races: n }))} />}
          {tab === 'classes' && <ClassesTab onCount={(n) => setCounts((c) => ({ ...c, classes: n }))} />}
          {tab === 'characters' && <CharactersTab onCount={(n) => setCounts((c) => ({ ...c, characters: n }))} />}
          {tab === 'users' && <UsersTab onCount={(n) => setCounts((c) => ({ ...c, users: n }))} />}
          {tab === 'logs' && <LogsTab />}
          {tab === 'cache' && <CacheTab />}
        </div>
      </div>
    </div>
  )
}

function Sidebar({ tab, setTab, counts }: {
  tab: Tab
  setTab: (t: Tab) => void
  counts: CountState
}) {
  const items: Array<{ id: Tab; label: string; icon: string; count?: number }> = [
    { id: 'items',      label: 'ไอเทม',          icon: '🎒', count: counts.items },
    { id: 'monsters',   label: 'มอนสเตอร์',       icon: '👹', count: counts.monsters },
    { id: 'maps',       label: 'แผนที่',          icon: '🗺',  count: counts.maps },
    { id: 'races',      label: 'เผ่า',            icon: '🧬', count: counts.races },
    { id: 'classes',    label: 'อาชีพ',           icon: '⚔️', count: counts.classes },
    { id: 'characters', label: 'ตัวละครผู้เล่น',  icon: '🧝', count: counts.characters },
    { id: 'users',      label: 'บัญชีผู้ใช้',     icon: '👤', count: counts.users },
    { id: 'logs',       label: 'Audit Logs',     icon: '📜' },
    { id: 'cache',      label: 'แคช / รีโหลด',    icon: '♻️' },
  ]
  return (
    <div className="admin-sidebar">
      <div className="sidebar-label">Content</div>
      {items.slice(0, 6).map((it) => (
        <button
          key={it.id}
          className={`admin-nav-item${tab === it.id ? ' active' : ''}`}
          onClick={() => setTab(it.id)}
        >
          <span className="nav-icon">{it.icon}</span>
          <span>{it.label}</span>
          {typeof it.count === 'number' && <span className="nav-count">{it.count}</span>}
        </button>
      ))}
      <div className="sidebar-label" style={{ marginTop: 12 }}>System</div>
      {items.slice(6).map((it) => (
        <button
          key={it.id}
          className={`admin-nav-item${tab === it.id ? ' active' : ''}`}
          onClick={() => setTab(it.id)}
        >
          <span className="nav-icon">{it.icon}</span>
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  )
}

// ─── shared bits ──────────────────────────────────────────────────────────

function useToken(): string {
  const t = useGame((s) => s.token)
  if (!t) throw new Error('admin panel mounted without a token')
  return t
}

function Toast({ msg, kind }: { msg: string; kind: 'ok' | 'err' }) {
  return <div className={`admin-toast ${kind}`}>{kind === 'ok' ? '✓' : '⚠'} {msg}</div>
}

function PageHead({ title, desc, right }: { title: string; desc?: string; right?: React.ReactNode }) {
  return (
    <div className="admin-page-head">
      <div>
        <h2>{title}</h2>
        {desc && <div className="page-desc">{desc}</div>}
      </div>
      {right}
    </div>
  )
}

function SearchBar({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string
}) {
  return (
    <div className="admin-search">
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

function Empty({ icon, title, desc }: { icon: string; title: string; desc?: string }) {
  return (
    <div className="admin-empty">
      <div className="icon">{icon}</div>
      <div className="title">{title}</div>
      {desc && <div className="desc">{desc}</div>}
    </div>
  )
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="field">
      <div>{label}</div>
      {children}
    </label>
  )
}

const RARITY_PILL: Record<AdminRarity, string> = {
  common: 'pill-gray', rare: 'pill-blue', epic: 'pill-purple', legendary: 'pill-yellow',
}
const RANK_PILL: Record<AdminMonsterRank, string> = {
  normal: 'pill-gray', elite: 'pill-blue', boss: 'pill-red',
}

// ─── Items tab ─────────────────────────────────────────────────────────────

const ITEM_TYPES: AdminItemType[] = ['mat', 'consume', 'weapon', 'armor']
const RARITIES: AdminRarity[] = ['common', 'rare', 'epic', 'legendary']
const ITEM_TYPE_META: Array<{ id: AdminItemType; label: string; icon: string }> = [
  { id: 'mat',     label: 'วัตถุดิบ',  icon: '🧵' },
  { id: 'consume', label: 'ใช้แล้วหมด', icon: '🧪' },
  { id: 'weapon',  label: 'อาวุธ',     icon: '⚔️' },
  { id: 'armor',   label: 'เกราะ',     icon: '🛡' },
]

function ItemsTab({ onCount }: { onCount: (n: number) => void }) {
  const token = useToken()
  const [items, setItems] = useState<AdminItemRow[] | null>(null)
  const [editing, setEditing] = useState<AdminItemRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState<AdminItemType | 'all'>('all')
  const [rarityFilter, setRarityFilter] = useState<AdminRarity | 'all'>('all')

  async function load() {
    const r = await api.adminListItems(token)
    setItems(r.items)
    onCount(r.items.length)
  }
  useEffect(() => { void load() }, [])

  /** Per-type / per-rarity counts for filter chips. Computed from the full
   *  item list so the badge always reflects the total, not the filtered view. */
  const typeCounts = useMemo(() => {
    const counts: Record<AdminItemType, number> = { mat: 0, consume: 0, weapon: 0, armor: 0 }
    if (!items) return counts
    for (const i of items) counts[i.type]++
    return counts
  }, [items])

  const filtered = useMemo(() => {
    if (!items) return null
    const needle = q.trim().toLowerCase()
    return items.filter((i) => {
      if (typeFilter !== 'all' && i.type !== typeFilter) return false
      if (rarityFilter !== 'all' && i.rarity !== rarityFilter) return false
      if (needle && !i.id.toLowerCase().includes(needle) &&
          !i.name.toLowerCase().includes(needle)) return false
      return true
    })
  }, [items, q, typeFilter, rarityFilter])

  async function save(body: AdminItemBody, id: string) {
    setErr(null); setOk(null)
    try {
      await api.adminUpdateItem(token, id, body)
      setOk(`บันทึก ${id} แล้ว`); setEditing(null); await load()
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status}: ${JSON.stringify(e.body)}` : String(e))
    }
  }
  async function create(body: AdminItemBody & { id: string }) {
    setErr(null); setOk(null)
    try {
      await api.adminCreateItem(token, body)
      setOk(`สร้าง ${body.id} แล้ว`); setCreating(false); await load()
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status}: ${JSON.stringify(e.body)}` : String(e))
    }
  }
  async function remove(id: string) {
    if (!confirm(`ลบ item ${id}?`)) return
    setErr(null); setOk(null)
    try {
      await api.adminDeleteItem(token, id); setOk(`ลบ ${id} แล้ว`); await load()
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status}: ${JSON.stringify(e.body)}` : String(e))
    }
  }

  if (!items) return <div className="admin-loading">กำลังโหลด…</div>

  return (
    <div>
      <PageHead title="ไอเทม" desc={`${items.length} รายการในระบบ — แก้ stat / สร้าง / ลบ ได้แบบ live`} />
      {ok && <Toast msg={ok} kind="ok" />}
      {err && <Toast msg={err} kind="err" />}

      <div className="admin-toolbar">
        <SearchBar value={q} onChange={setQ} placeholder="ค้นหาด้วย id หรือ name…" />
        <button className="btn-a btn-a-primary" onClick={() => setCreating(true)}>+ สร้างใหม่</button>
      </div>

      <div className="filter-strip">
        <span className="filter-label">ประเภท:</span>
        <button type="button"
          className={`filter-chip${typeFilter === 'all' ? ' active' : ''}`}
          onClick={() => setTypeFilter('all')}>
          ทั้งหมด <span className="chip-count">{items.length}</span>
        </button>
        {ITEM_TYPE_META.map((t) => (
          <button key={t.id} type="button"
            className={`filter-chip${typeFilter === t.id ? ' active' : ''}`}
            onClick={() => setTypeFilter(t.id)}>
            {t.icon} {t.label} <span className="chip-count">{typeCounts[t.id]}</span>
          </button>
        ))}
      </div>

      <div className="filter-strip">
        <span className="filter-label">Rarity:</span>
        <button type="button"
          className={`filter-chip${rarityFilter === 'all' ? ' active' : ''}`}
          onClick={() => setRarityFilter('all')}>
          ทั้งหมด
        </button>
        {RARITIES.map((r) => (
          <button key={r} type="button"
            className={`filter-chip${rarityFilter === r ? ' active' : ''}`}
            onClick={() => setRarityFilter(r)}>
            {r}
          </button>
        ))}
      </div>

      {creating && (
        <ItemForm
          mode="create" initial={null}
          onCancel={() => setCreating(false)}
          onSubmit={(b) => create(b as AdminItemBody & { id: string })}
        />
      )}
      {editing && (
        <ItemForm
          mode="edit" initial={editing}
          onCancel={() => setEditing(null)}
          onSubmit={(b) => save(b, editing.id)}
        />
      )}

      <div className="admin-card">
        {filtered!.length === 0 ? (
          <Empty icon="🔍" title="ไม่พบ item ที่ตรง" desc="ลองพิมพ์คำค้นอื่น" />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th><th>Name</th><th>Type</th><th>Rarity</th><th>Stats</th>
                <th style={{ width: 140 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered!.map((it) => (
                <tr key={it.id}>
                  <td><span className="id-mono">{it.id}</span></td>
                  <td>
                    <span style={{ fontSize: 16, marginRight: 6 }}>{it.emoji}</span>
                    {it.name}
                  </td>
                  <td><span className="pill pill-gray">{it.type}</span></td>
                  <td><span className={`pill ${RARITY_PILL[it.rarity]}`}>{it.rarity}</span></td>
                  <td style={{ fontSize: 13, color: '#6b7280' }}>
                    {[
                      it.atk != null && `ATK ${it.atk}`,
                      it.def != null && `DEF ${it.def}`,
                      it.matk != null && `MATK ${it.matk}`,
                      it.heal != null && `HEAL ${it.heal}`,
                      it.healMp != null && `MP ${it.healMp}`,
                    ].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="row-actions">
                    <button className="btn-a btn-a-small" onClick={() => setEditing(it)}>แก้</button>
                    <button className="btn-a btn-a-small btn-a-danger" onClick={() => remove(it.id)} style={{ marginLeft: 4 }}>ลบ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function ItemForm({ mode, initial, onSubmit, onCancel }: {
  mode: 'create' | 'edit'
  initial: AdminItemRow | null
  onSubmit: (body: AdminItemBody & { id?: string }) => void
  onCancel: () => void
}) {
  const [id, setId] = useState(initial?.id ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [emoji, setEmoji] = useState(initial?.emoji ?? '🎁')
  const [type, setType] = useState<AdminItemType>(initial?.type ?? 'mat')
  const [rarity, setRarity] = useState<AdminRarity>(initial?.rarity ?? 'common')
  const [atk, setAtk] = useState<string | number>(initial?.atk ?? '')
  const [def, setDef] = useState<string | number>(initial?.def ?? '')
  const [matk, setMatk] = useState<string | number>(initial?.matk ?? '')
  const [heal, setHeal] = useState<string | number>(initial?.heal ?? '')
  const [healMp, setHealMp] = useState<string | number>(initial?.healMp ?? '')
  const [desc, setDesc] = useState(initial?.desc ?? '')

  function num(v: string | number | null): number | null {
    if (v === '' || v === null) return null
    const n = Number(v); return Number.isFinite(n) ? n : null
  }
  function submit(e: React.FormEvent) {
    e.preventDefault()
    // Slice 46: only send stat fields that are valid for this item type
    // (see showStats below). Filters out stale values that linger in
    // form state when the admin changes type — e.g. flipping weapon →
    // armor leaves the old `atk` value sitting in state.
    const body: AdminItemBody & { id?: string } = {
      name, emoji, type, rarity,
      atk:    type === 'weapon'  ? num(atk)    : null,
      def:    type === 'armor'   ? num(def)    : null,
      matk:   type === 'weapon'  ? num(matk)   : null,
      heal:   type === 'consume' ? num(heal)   : null,
      healMp: type === 'consume' ? num(healMp) : null,
      desc,
    }
    if (mode === 'create') body.id = id.trim()
    onSubmit(body)
  }

  // Which stat fields make sense per item type — see CONTEXT.md "Item Stat".
  // Slice 46: tightened so the form only offers fields that deriveStats
  // actually reads for the matching equip slot. Weapons contribute atk /
  // matk; armors contribute def. Cross-stat values (atk on armor, def
  // on weapon) were silently ignored at runtime — confusing for admins.
  const showStats = {
    atk:    type === 'weapon',
    def:    type === 'armor',
    matk:   type === 'weapon',
    heal:   type === 'consume',
    healMp: type === 'consume',
  }

  return (
    <form onSubmit={submit} className="admin-form">
      <div className="admin-form-title">
        {mode === 'create' ? '✨ สร้าง Item ใหม่' : `✏️ แก้ Item: ${initial?.id}`}
      </div>

      {/* Type chips up top — most important choice for "what fields show below" */}
      <div className="filter-strip" style={{ marginBottom: 12 }}>
        <span className="filter-label">ประเภท:</span>
        {ITEM_TYPE_META.map((t) => (
          <button key={t.id} type="button"
            className={`filter-chip${type === t.id ? ' active' : ''}`}
            onClick={() => setType(t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="admin-form-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {mode === 'create' && (
          <Field label="ID (kebab-case)">
            <input value={id} onChange={(e) => setId(e.target.value)} required pattern="[a-z0-9-]+" />
          </Field>
        )}
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Emoji"><input value={emoji} onChange={(e) => setEmoji(e.target.value)} required /></Field>
        <Field label="Rarity">
          <select value={rarity} onChange={(e) => setRarity(e.target.value as AdminRarity)}>
            {RARITIES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        {showStats.atk    && <Field label="ATK"><input type="number" value={atk} onChange={(e) => setAtk(e.target.value)} /></Field>}
        {showStats.def    && <Field label="DEF"><input type="number" value={def} onChange={(e) => setDef(e.target.value)} /></Field>}
        {showStats.matk   && <Field label="MATK"><input type="number" value={matk} onChange={(e) => setMatk(e.target.value)} /></Field>}
        {showStats.heal   && <Field label="HEAL"><input type="number" value={heal} onChange={(e) => setHeal(e.target.value)} /></Field>}
        {showStats.healMp && <Field label="HEAL MP"><input type="number" value={healMp} onChange={(e) => setHealMp(e.target.value)} /></Field>}
      </div>
      <Field label="Description">
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} style={{ resize: 'vertical' }} />
      </Field>
      <div className="admin-form-foot">
        <button type="button" className="btn-a" onClick={onCancel}>ยกเลิก</button>
        <button type="submit" className="btn-a btn-a-primary">บันทึก</button>
      </div>
    </form>
  )
}

// ─── Monsters tab ──────────────────────────────────────────────────────────

const RANKS: AdminMonsterRank[] = ['normal', 'elite', 'boss']

function MonstersTab({ onCount }: { onCount: (n: number) => void }) {
  const token = useToken()
  const [monsters, setMonsters] = useState<AdminMonsterRow[] | null>(null)
  const [items, setItems] = useState<AdminItemRow[] | null>(null)
  const [editing, setEditing] = useState<AdminMonsterRow | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [rankFilter, setRankFilter] = useState<AdminMonsterRank | 'all'>('all')

  async function load() {
    const [m, i] = await Promise.all([
      api.adminListMonsters(token), api.adminListItems(token),
    ])
    setMonsters(m.monsters); setItems(i.items); onCount(m.monsters.length)
  }
  useEffect(() => { void load() }, [])

  const rankCounts = useMemo(() => {
    const c: Record<AdminMonsterRank, number> = { normal: 0, elite: 0, boss: 0 }
    if (!monsters) return c
    for (const m of monsters) c[m.rank]++
    return c
  }, [monsters])

  const filtered = useMemo(() => {
    if (!monsters) return null
    const needle = q.trim().toLowerCase()
    return monsters.filter((m) => {
      if (rankFilter !== 'all' && m.rank !== rankFilter) return false
      if (needle && !m.id.toLowerCase().includes(needle) &&
          !m.name.toLowerCase().includes(needle)) return false
      return true
    })
  }, [monsters, q, rankFilter])

  async function save(body: AdminMonsterBody, id: string) {
    setErr(null); setOk(null)
    try {
      await api.adminUpdateMonster(token, id, body)
      setOk(`บันทึก ${id} แล้ว`); setEditing(null); await load()
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status}: ${JSON.stringify(e.body)}` : String(e))
    }
  }

  if (!monsters || !items) return <div className="admin-loading">กำลังโหลด…</div>

  return (
    <div>
      <PageHead title="มอนสเตอร์" desc={`${monsters.length} ตัวในระบบ — แก้ stat / drops ได้`} />
      {ok && <Toast msg={ok} kind="ok" />}
      {err && <Toast msg={err} kind="err" />}
      <div className="admin-toolbar">
        <SearchBar value={q} onChange={setQ} placeholder="ค้นหามอนสเตอร์ด้วย id หรือ name…" />
      </div>

      <div className="filter-strip">
        <span className="filter-label">Rank:</span>
        <button type="button"
          className={`filter-chip${rankFilter === 'all' ? ' active' : ''}`}
          onClick={() => setRankFilter('all')}>
          ทั้งหมด <span className="chip-count">{monsters.length}</span>
        </button>
        {RANKS.map((r) => (
          <button key={r} type="button"
            className={`filter-chip${rankFilter === r ? ' active' : ''}`}
            onClick={() => setRankFilter(r)}>
            {r} <span className="chip-count">{rankCounts[r]}</span>
          </button>
        ))}
      </div>

      {editing && (
        <MonsterForm initial={editing} items={items}
          onCancel={() => setEditing(null)}
          onSubmit={(b) => save(b, editing.id)} />
      )}

      <div className="admin-card">
        {filtered!.length === 0 ? (
          <Empty icon="👻" title="ไม่พบมอนสเตอร์ที่ตรง" />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th><th>Name</th><th>Rank</th><th>Lv</th>
                <th>HP / ATK / DEF / SPD</th><th>EXP / Gold</th><th>Drops</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered!.map((m) => (
                <tr key={m.id}>
                  <td><span className="id-mono">{m.id}</span></td>
                  <td><span style={{ fontSize: 16, marginRight: 6 }}>{m.emoji}</span>{m.name}</td>
                  <td><span className={`pill ${RANK_PILL[m.rank]}`}>{m.rank}</span></td>
                  <td>{m.lv}</td>
                  <td style={{ fontSize: 13, color: '#6b7280' }}>{m.hp} / {m.atk} / {m.def} / {m.spd}</td>
                  <td style={{ fontSize: 13, color: '#6b7280' }}>{m.exp} / {m.gold}</td>
                  <td style={{ fontSize: 13, color: '#6b7280' }}>
                    {m.drops.length === 0 ? '—' :
                      m.drops.map((d) => `${d.itemId} ${Math.round(d.chance * 100)}%`).join(', ')}
                  </td>
                  <td className="row-actions">
                    <button className="btn-a btn-a-small" onClick={() => setEditing(m)}>แก้</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function MonsterForm({ initial, items, onSubmit, onCancel }: {
  initial: AdminMonsterRow; items: AdminItemRow[]
  onSubmit: (body: AdminMonsterBody) => void; onCancel: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [emoji, setEmoji] = useState(initial.emoji)
  const [rank, setRank] = useState<AdminMonsterRank>(initial.rank)
  const [lv, setLv] = useState(initial.lv)
  const [hp, setHp] = useState(initial.hp)
  const [atk, setAtk] = useState(initial.atk)
  const [def, setDef] = useState(initial.def)
  const [spd, setSpd] = useState(initial.spd)
  const [exp, setExp] = useState(initial.exp)
  const [gold, setGold] = useState(initial.gold)
  const [drops, setDrops] = useState<AdminDropEntry[]>(
    initial.drops.map((d) => ({
      item: d.itemId, chance: d.chance, minQty: d.minQty, maxQty: d.maxQty,
    })),
  )

  function addDrop() { setDrops((cur) => [...cur, { item: items[0]?.id ?? '', chance: 0.1, minQty: 1, maxQty: 1 }]) }
  function setDrop(i: number, patch: Partial<AdminDropEntry>) {
    setDrops((cur) => cur.map((d, idx) => (idx === i ? { ...d, ...patch } : d)))
  }
  function removeDrop(i: number) { setDrops((cur) => cur.filter((_, idx) => idx !== i)) }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      name, emoji, rank,
      lv: Number(lv), hp: Number(hp), atk: Number(atk), def: Number(def), spd: Number(spd),
      exp: Number(exp), gold: Number(gold), drops,
    })
  }

  return (
    <form onSubmit={submit} className="admin-form">
      <div className="admin-form-title">✏️ แก้ Monster: {initial.id}</div>
      <div className="admin-form-row" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Emoji"><input value={emoji} onChange={(e) => setEmoji(e.target.value)} /></Field>
        <Field label="Rank">
          <select value={rank} onChange={(e) => setRank(e.target.value as AdminMonsterRank)}>
            {RANKS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Lv"><input type="number" value={lv} onChange={(e) => setLv(Number(e.target.value))} /></Field>
        <Field label="HP"><input type="number" value={hp} onChange={(e) => setHp(Number(e.target.value))} /></Field>
        <Field label="ATK"><input type="number" value={atk} onChange={(e) => setAtk(Number(e.target.value))} /></Field>
        <Field label="DEF"><input type="number" value={def} onChange={(e) => setDef(Number(e.target.value))} /></Field>
        <Field label="SPD"><input type="number" value={spd} onChange={(e) => setSpd(Number(e.target.value))} /></Field>
        <Field label="EXP"><input type="number" value={exp} onChange={(e) => setExp(Number(e.target.value))} /></Field>
        <Field label="Gold"><input type="number" value={gold} onChange={(e) => setGold(Number(e.target.value))} /></Field>
      </div>

      <div style={{ marginTop: 16, fontWeight: 600, fontSize: 13, color: '#374151' }}>🎁 Drops</div>
      <div style={{ marginTop: 6 }}>
        {drops.length === 0 && (
          <div style={{ fontSize: 14, color: '#9ca3af', padding: '8px 0' }}>ยังไม่มี drop</div>
        )}
        {drops.map((d, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 40px',
            gap: 6, marginBottom: 4, alignItems: 'center',
          }}>
            <select value={d.item} onChange={(e) => setDrop(i, { item: e.target.value })}>
              {ITEM_TYPE_META.map((t) => {
                const ofType = items.filter((it) => it.type === t.id)
                if (ofType.length === 0) return null
                return (
                  <optgroup key={t.id} label={`${t.icon} ${t.label}`}>
                    {ofType.map((it) => (
                      <option key={it.id} value={it.id}>{it.emoji} {it.id} ({it.name})</option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
            <input type="number" step="0.01" min="0" max="1" value={d.chance}
                   onChange={(e) => setDrop(i, { chance: Number(e.target.value) })}
                   placeholder="chance 0-1" />
            <input type="number" min="1" value={d.minQty}
                   onChange={(e) => setDrop(i, { minQty: Number(e.target.value) })}
                   placeholder="min qty" />
            <input type="number" min="1" value={d.maxQty}
                   onChange={(e) => setDrop(i, { maxQty: Number(e.target.value) })}
                   placeholder="max qty" />
            <button type="button" className="btn-a btn-a-small btn-a-danger" onClick={() => removeDrop(i)}>−</button>
          </div>
        ))}
        <button type="button" className="btn-a btn-a-small" onClick={addDrop} style={{ marginTop: 6 }}>
          + เพิ่ม drop
        </button>
      </div>

      <div className="admin-form-foot">
        <button type="button" className="btn-a" onClick={onCancel}>ยกเลิก</button>
        <button type="submit" className="btn-a btn-a-primary">บันทึก</button>
      </div>
    </form>
  )
}

// ─── Maps tab ──────────────────────────────────────────────────────────────

const TILE_BRUSHES: Array<{
  label: string
  apply: (cur: AdminTile) => AdminTile
  swatch: string
}> = [
  { label: 'พื้น (เดินได้)', apply: () => ({ walkable: true }), swatch: '#dcfce7' },
  { label: 'กำแพง',          apply: () => ({ walkable: false, glyph: '🪨' }), swatch: '#1f2937' },
  { label: 'ต้นไม้',         apply: () => ({ walkable: false, glyph: '🌲' }), swatch: '#166534' },
  { label: 'หิน',            apply: () => ({ walkable: false, glyph: '🗻' }), swatch: '#6b7280' },
  { label: 'น้ำ',            apply: () => ({ walkable: false, glyph: '💧' }), swatch: '#3b82f6' },
  { label: 'ดอกไม้',         apply: () => ({ walkable: true,  glyph: '🌸' }), swatch: '#fbcfe8' },
  { label: 'ร้านค้า',        apply: () => ({ walkable: true, kind: 'shop',   glyph: '🏪' }), swatch: '#fde047' },
  { label: 'หมอ',            apply: () => ({ walkable: true, kind: 'healer', glyph: '⛩' }), swatch: '#fdba74' },
]

function MapsTab({ onCount }: { onCount: (n: number) => void }) {
  const token = useToken()
  const [maps, setMaps] = useState<AdminMapRow[] | null>(null)
  const [monstersAll, setMonstersAll] = useState<AdminMonsterRow[] | null>(null)
  const [editing, setEditing] = useState<AdminMapRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function load() {
    const [m, mon] = await Promise.all([
      api.adminListMaps(token), api.adminListMonsters(token),
    ])
    setMaps(m.maps); setMonstersAll(mon.monsters); onCount(m.maps.length)
  }
  useEffect(() => { void load() }, [])

  async function save(body: AdminMapBody, id: string) {
    setErr(null); setOk(null)
    try {
      await api.adminUpdateMap(token, id, body)
      setOk(`บันทึก ${id} แล้ว`); setEditing(null); await load()
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status}: ${JSON.stringify(e.body)}` : String(e))
    }
  }
  async function create(body: AdminMapBody & { id: string }) {
    setErr(null); setOk(null)
    try {
      await api.adminCreateMap(token, body)
      setOk(`สร้าง ${body.id} แล้ว`); setCreating(false); await load()
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status}: ${JSON.stringify(e.body)}` : String(e))
    }
  }
  async function remove(id: string) {
    if (!confirm(`ลบแมพ ${id}? Warps/Characters ที่อ้าง map นี้จะพังด้วย`)) return
    setErr(null); setOk(null)
    try {
      await api.adminDeleteMap(token, id); setOk(`ลบ ${id} แล้ว`); await load()
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status}: ${JSON.stringify(e.body)}` : String(e))
    }
  }

  if (!maps || !monstersAll) return <div className="admin-loading">กำลังโหลด…</div>

  return (
    <div>
      <PageHead
        title="แผนที่"
        desc="แนะนำขนาด: 20×14 เล็ก · 24×16 default · 32×20 ใหญ่ (TILE = 64px)"
        right={
          <button className="btn-a btn-a-primary" onClick={() => setCreating(true)}>
            + สร้างแมพใหม่
          </button>
        }
      />
      {ok && <Toast msg={ok} kind="ok" />}
      {err && <Toast msg={err} kind="err" />}

      {creating && (
        <MapEditor mode="create" initial={null}
          monstersAll={monstersAll} allMaps={maps}
          onCancel={() => setCreating(false)}
          onSubmit={(b) => create(b as AdminMapBody & { id: string })} />
      )}
      {editing && (
        <MapEditor mode="edit" initial={editing}
          monstersAll={monstersAll} allMaps={maps}
          onCancel={() => setEditing(null)}
          onSubmit={(b) => save(b, editing.id)} />
      )}

      <div className="admin-card">
        {maps.length === 0 ? (
          <Empty icon="🗺" title="ยังไม่มีแมพ" desc="กด + สร้างแมพใหม่ เพื่อเริ่มต้น" />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th><th>Name</th><th>Lv</th><th>Size</th><th>BG</th>
                <th>Monsters</th><th>Spawn</th><th>Warps</th><th></th>
              </tr>
            </thead>
            <tbody>
              {maps.map((m) => (
                <tr key={m.id}>
                  <td><span className="id-mono">{m.id}</span></td>
                  <td>{m.name}</td>
                  <td>{m.minLv}–{m.maxLv}</td>
                  <td><span className="pill pill-gray">{m.w}×{m.h}</span></td>
                  <td>
                    <div style={{
                      display: 'inline-block', width: 32, height: 18,
                      background: m.bg, border: '1px solid #d1d5db', borderRadius: 3,
                      verticalAlign: 'middle',
                    }} />
                    {m.bgImage && (
                      <span title={m.bgImage} style={{ marginLeft: 6, fontSize: 14 }}>🖼</span>
                    )}
                  </td>
                  <td style={{ fontSize: 13, color: '#6b7280', maxWidth: 240 }}>
                    {m.monsters.length === 0 ? '—' :
                      m.monsters.map((mm) => `${mm.monsterId}×${mm.spawnWeight}`).join(', ')}
                  </td>
                  <td><span className="pill pill-blue">{m.monsterCount}</span></td>
                  <td style={{ fontSize: 13, color: '#6b7280' }}>
                    {m.warps.length === 0 ? '—' :
                      m.warps.map((w) => `→ ${w.toMapId}`).join(', ')}
                  </td>
                  <td className="row-actions">
                    <button className="btn-a btn-a-small" onClick={() => setEditing(m)}>แก้</button>
                    <button className="btn-a btn-a-small btn-a-danger" onClick={() => remove(m.id)} style={{ marginLeft: 4 }}>ลบ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function MapEditor({ mode, initial, monstersAll, allMaps, onSubmit, onCancel }: {
  mode: 'create' | 'edit'
  initial: AdminMapRow | null
  monstersAll: AdminMonsterRow[]
  allMaps: AdminMapRow[]
  onSubmit: (body: AdminMapBody & { id?: string }) => void
  onCancel: () => void
}) {
  const [id, setId] = useState(initial?.id ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [minLv, setMinLv] = useState(initial?.minLv ?? 1)
  const [maxLv, setMaxLv] = useState(initial?.maxLv ?? 5)
  const [w, setW] = useState(initial?.w ?? 24)
  const [h, setH] = useState(initial?.h ?? 16)
  const [bg, setBg] = useState(initial?.bg ?? '#dbe7c9')
  const [bgImage, setBgImage] = useState(initial?.bgImage ?? '')
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const token = useToken()
  const [pathColor, setPathColor] = useState(initial?.pathColor ?? '')
  const [monsterCount, setMonsterCount] = useState(initial?.monsterCount ?? 4)
  const [layout, setLayout] = useState<AdminTile[][]>(() => makeBlankLayout(
    initial?.w ?? 24, initial?.h ?? 16, initial?.layout,
  ))
  const [monsters, setMonsters] = useState<AdminMapMonsterEntry[]>(initial?.monsters ?? [])
  const [warps, setWarps] = useState<AdminWarpEntry[]>(initial?.warps ?? [])
  const [brushIdx, setBrushIdx] = useState(1)
  const [warpPlacingIdx, setWarpPlacingIdx] = useState(-1)
  const [isPainting, setIsPainting] = useState(false)

  function resizeLayout(newW: number, newH: number) {
    setLayout((cur) => makeBlankLayout(newW, newH, cur))
  }
  function paintCell(x: number, y: number) {
    if (warpPlacingIdx >= 0) {
      setWarps((cur) => cur.map((w, i) => (i === warpPlacingIdx ? { ...w, x, y } : w)))
      setWarpPlacingIdx(-1); return
    }
    setLayout((cur) => {
      const next = cur.map((row) => row.slice())
      next[y][x] = TILE_BRUSHES[brushIdx].apply(next[y][x] ?? { walkable: true })
      return next
    })
  }
  function addWarp() {
    const otherId = allMaps.find((m) => m.id !== initial?.id)?.id ?? (initial?.id ?? '')
    setWarps((cur) => [...cur, { x: 0, y: 0, toMapId: otherId, tx: 0, ty: 0, label: null }])
    setWarpPlacingIdx(warps.length)
  }
  function setWarpField(i: number, patch: Partial<AdminWarpEntry>) {
    setWarps((cur) => cur.map((w, idx) => (idx === i ? { ...w, ...patch } : w)))
  }
  function removeWarp(i: number) {
    setWarps((cur) => cur.filter((_, idx) => idx !== i))
    if (warpPlacingIdx === i) setWarpPlacingIdx(-1)
  }
  function toggleMonster(monsterId: string) {
    setMonsters((cur) => {
      const idx = cur.findIndex((m) => m.monsterId === monsterId)
      if (idx >= 0) return cur.filter((_, i) => i !== idx)
      return [...cur, { monsterId, spawnWeight: 1 }]
    })
  }
  function setMonsterWeight(monsterId: string, weight: number) {
    setMonsters((cur) => cur.map((m) =>
      m.monsterId === monsterId ? { ...m, spawnWeight: Math.max(1, weight) } : m,
    ))
  }
  function submit(e: React.FormEvent) {
    e.preventDefault()
    const body: AdminMapBody & { id?: string } = {
      name, minLv: Number(minLv), maxLv: Number(maxLv),
      w: Number(w), h: Number(h), bg,
      bgImage: bgImage.trim() === '' ? null : bgImage.trim(),
      pathColor: pathColor.trim() === '' ? null : pathColor.trim(),
      monsterCount: Number(monsterCount),
      layout, monsters, warps,
    }
    if (mode === 'create') body.id = id.trim()
    onSubmit(body)
  }

  // Bigger cells now that the panel runs full-viewport — scale up to 42px
  // per tile so a 24-wide map fills ~1000px instead of the old 672px.
  const cellPx = Math.max(16, Math.min(42, Math.floor(1000 / w)))

  return (
    <form onSubmit={submit} className="admin-form">
      <div className="admin-form-title">
        {mode === 'create' ? '✨ สร้างแผนที่ใหม่' : `✏️ แก้แผนที่: ${initial?.id}`}
      </div>

      <div className="admin-form-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {mode === 'create' && (
          <Field label="ID (kebab-case)">
            <input value={id} onChange={(e) => setId(e.target.value)} required pattern="[a-z0-9-]+" />
          </Field>
        )}
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Min Lv"><input type="number" min="1" value={minLv} onChange={(e) => setMinLv(Number(e.target.value))} /></Field>
        <Field label="Max Lv"><input type="number" min="1" value={maxLv} onChange={(e) => setMaxLv(Number(e.target.value))} /></Field>
        <Field label="Width (3–60)">
          <input type="number" min="3" max="60" value={w}
                 onChange={(e) => { const v = Number(e.target.value); setW(v); resizeLayout(v, h) }} />
        </Field>
        <Field label="Height (3–40)">
          <input type="number" min="3" max="40" value={h}
                 onChange={(e) => { const v = Number(e.target.value); setH(v); resizeLayout(w, v) }} />
        </Field>
        <Field label="BG color">
          <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
        </Field>
        <Field label="Path color (optional)">
          <input value={pathColor} onChange={(e) => setPathColor(e.target.value)} placeholder="#a86b3a" />
        </Field>
        <Field label="Monster spawn count (0–50)">
          <input type="number" min="0" max="50" value={monsterCount}
                 onChange={(e) => setMonsterCount(Number(e.target.value))} />
        </Field>
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="field" style={{ marginBottom: 6 }}>
          <div>🖼 BG image (upload หรือ พิมพ์ path)</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {bgImage && (
            <img
              src={resolveAssetUrl(bgImage) ?? ''}
              alt="bg preview"
              style={{
                width: 120, height: 80, objectFit: 'cover',
                border: '1px solid #d1d5db', borderRadius: 6,
              }}
            />
          )}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={uploading}
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                setUploading(true); setUploadErr(null)
                try {
                  const r = await api.adminUpload(token, f)
                  setBgImage(r.url)
                } catch (err) {
                  setUploadErr(err instanceof ApiError ? `${err.status}: ${JSON.stringify(err.body)}` : String(err))
                } finally {
                  setUploading(false); e.target.value = ''
                }
              }} />
            <input value={bgImage} onChange={(e) => setBgImage(e.target.value)}
              placeholder="/uploads/maps/... หรือ /assets/maps/..." />
            <div style={{ display: 'flex', gap: 8 }}>
              {uploading && <span style={{ fontSize: 13, color: '#6b7280' }}>กำลังอัพโหลด…</span>}
              {uploadErr && <span style={{ fontSize: 13, color: '#dc2626' }}>{uploadErr}</span>}
              {bgImage && (
                <button type="button" className="btn-a btn-a-small" onClick={() => setBgImage('')}>
                  ล้าง bg image
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: '#374151' }}>
            🎨 Brush — เลือกแล้วคลิก/ลากบน grid
          </div>
          <div className="brush-strip">
            {TILE_BRUSHES.map((b, i) => (
              <button key={i} type="button"
                className={`brush-chip${brushIdx === i ? ' active' : ''}`}
                onClick={() => setBrushIdx(i)}>
                <span className="brush-swatch" style={{ background: b.swatch }} />
                {b.label}
              </button>
            ))}
          </div>

          <div
            onMouseLeave={() => setIsPainting(false)}
            style={{
              display: 'inline-block',
              border: '2px solid #1f2937', background: bg, padding: 4,
              borderRadius: 6,
            }}
          >
            {layout.map((row, y) => (
              <div key={y} style={{ display: 'flex', lineHeight: 0 }}>
                {row.map((cell, x) => {
                  const isWall = !cell.walkable
                  const warpHere = warps.findIndex((w) => w.x === x && w.y === y)
                  const swatch = warpHere >= 0 ? '#a78bfa'
                    : isWall ? '#1f2937aa'
                    : cell.kind === 'shop' ? '#fde047'
                    : cell.kind === 'healer' ? '#fdba74'
                    : 'transparent'
                  return (
                    <div key={x}
                      onMouseDown={() => { setIsPainting(true); paintCell(x, y) }}
                      onMouseUp={() => setIsPainting(false)}
                      onMouseEnter={() => { if (isPainting) paintCell(x, y) }}
                      title={`${x},${y}${isWall ? ' (wall)' : ''}${warpHere >= 0 ? ` → ${warps[warpHere].toMapId}` : ''}`}
                      style={{
                        width: cellPx, height: cellPx, background: swatch,
                        border: warpPlacingIdx >= 0 ? '1px solid #fbbf24' : '1px solid rgba(0,0,0,0.08)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: Math.floor(cellPx * 0.6),
                        cursor: warpPlacingIdx >= 0 ? 'copy' : 'crosshair',
                      }}
                    >
                      {warpHere >= 0 ? '🌀' : (cell.glyph ?? '')}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>
            คลิกหรือลากเมาส์เพื่อทาทั้งแถบ · <b>{layout.flat().filter((t) => !t.walkable).length}</b> จุดห้ามเดิน
          </div>
        </div>

        <div style={{ width: 460, flexShrink: 0, minWidth: 460 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: '#374151' }}>
            👹 Monster Pool ({monsters.length} เลือก)
          </div>
          <div className="monster-pick-list">
            {monstersAll.length === 0 && (
              <div style={{ fontSize: 14, color: '#9ca3af', padding: 10 }}>ยังไม่มี monster ในระบบ</div>
            )}
            {monstersAll.map((mon) => {
              const picked = monsters.find((m) => m.monsterId === mon.id)
              return (
                <label key={mon.id} className={`monster-pick-row${picked ? ' picked' : ''}`}>
                  <input type="checkbox" checked={!!picked} onChange={() => toggleMonster(mon.id)} />
                  <span className="mon-label">
                    <span style={{ fontSize: 16, marginRight: 4 }}>{mon.emoji}</span>
                    {mon.name}
                    <span style={{ color: '#9ca3af', fontSize: 12, marginLeft: 6 }}>Lv{mon.lv}</span>
                  </span>
                  {picked && (
                    <input type="number" min="1" max="99" value={picked.spawnWeight}
                      onChange={(e) => setMonsterWeight(mon.id, Number(e.target.value))}
                      title="spawn weight" />
                  )}
                </label>
              )
            })}
          </div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>
            จำนวนที่ spawn = {monsterCount} (สุ่มจาก pool ตาม weight)
          </div>

          <div style={{ fontWeight: 600, fontSize: 13, marginTop: 16, marginBottom: 6, color: '#374151' }}>
            🌀 Warps ({warps.length})
          </div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
            {warpPlacingIdx >= 0
              ? <span style={{ color: '#b45309', fontWeight: 600 }}>👉 คลิกบนกริดเพื่อวางจุด warp</span>
              : 'เพิ่ม warp → คลิกบนกริดเพื่อระบุตำแหน่งทางออก'}
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {warps.length === 0 && (
              <div style={{ fontSize: 14, color: '#9ca3af', padding: 12,
                background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                ยังไม่มี warp — แมพนี้เป็น isolated island
              </div>
            )}
            {warps.map((w, i) => (
              <div key={i} className={`warp-card${warpPlacingIdx === i ? ' placing' : ''}`}>
                <div className="warp-card-head">
                  <span className="summary">({w.x},{w.y}) → {w.toMapId} ({w.tx},{w.ty})</span>
                  <button type="button" className="btn-a btn-a-small"
                    onClick={() => setWarpPlacingIdx(warpPlacingIdx === i ? -1 : i)}>
                    {warpPlacingIdx === i ? 'ยกเลิก' : 'วาง'}
                  </button>
                  <button type="button" className="btn-a btn-a-small btn-a-danger"
                    onClick={() => removeWarp(i)}>×</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <Field label="ไปแมพ">
                    <select value={w.toMapId}
                      onChange={(e) => setWarpField(i, { toMapId: e.target.value })}>
                      {allMaps.map((m) => (
                        <option key={m.id} value={m.id}>{m.id}</option>
                      ))}
                      {initial && !allMaps.some((m) => m.id === initial.id) && (
                        <option value={initial.id}>{initial.id}</option>
                      )}
                    </select>
                  </Field>
                  <Field label="label (optional)">
                    <input value={w.label ?? ''}
                      onChange={(e) => setWarpField(i, { label: e.target.value || null })}
                      placeholder="ป้ายชื่อ" />
                  </Field>
                </div>
                <div style={{ fontSize: 12, color: '#7c3aed', marginTop: 8, marginBottom: 4, fontWeight: 600 }}>
                  📍 จุดวาร์ปบนแมพนี้
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <Field label="source X">
                    <input type="number" min="0" value={w.x}
                      onChange={(e) => setWarpField(i, { x: Number(e.target.value) })} />
                  </Field>
                  <Field label="source Y">
                    <input type="number" min="0" value={w.y}
                      onChange={(e) => setWarpField(i, { y: Number(e.target.value) })} />
                  </Field>
                </div>
                <div style={{ fontSize: 12, color: '#0891b2', marginTop: 8, marginBottom: 4, fontWeight: 600 }}>
                  🎯 ปลายทางในแมพ {w.toMapId}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <Field label="target X">
                    <input type="number" min="0" value={w.tx}
                      onChange={(e) => setWarpField(i, { tx: Number(e.target.value) })} />
                  </Field>
                  <Field label="target Y">
                    <input type="number" min="0" value={w.ty}
                      onChange={(e) => setWarpField(i, { ty: Number(e.target.value) })} />
                  </Field>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="btn-a" onClick={addWarp}
            style={{ marginTop: 6, width: '100%' }}>
            + เพิ่ม Warp
          </button>
        </div>
      </div>

      <div className="admin-form-foot">
        <button type="button" className="btn-a" onClick={onCancel}>ยกเลิก</button>
        <button type="submit" className="btn-a btn-a-primary">บันทึก</button>
      </div>
    </form>
  )
}

function makeBlankLayout(w: number, h: number, from?: AdminTile[][]): AdminTile[][] {
  const out: AdminTile[][] = []
  for (let y = 0; y < h; y++) {
    const row: AdminTile[] = []
    for (let x = 0; x < w; x++) row.push(from?.[y]?.[x] ?? { walkable: true })
    out.push(row)
  }
  return out
}

// ─── Characters tab (Slice 30 — full editor) ─────────────────────────────

function CharactersTab({ onCount }: { onCount: (n: number) => void }) {
  const token = useToken()
  const [chars, setChars] = useState<AdminCharacterRow[] | null>(null)
  const [editing, setEditing] = useState<AdminCharacterRow | null>(null)
  const [races, setRaces] = useState<Race[]>([])
  const [classes, setClasses] = useState<CharClass[]>([])
  const [items, setItems] = useState<AdminItemRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [q, setQ] = useState('')

  async function load() {
    const [r, rc, cl, it] = await Promise.all([
      api.adminListCharacters(token),
      api.adminListRaces(token),
      api.adminListClasses(token),
      api.adminListItems(token),
    ])
    setChars(r.characters); onCount(r.characters.length)
    setRaces(rc.races); setClasses(cl.classes); setItems(it.items)
  }
  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => {
    if (!chars) return null
    const needle = q.trim().toLowerCase()
    if (!needle) return chars
    return chars.filter((c) =>
      c.name.toLowerCase().includes(needle) || c.username.toLowerCase().includes(needle),
    )
  }, [chars, q])

  async function save(patch: AdminCharacterPatch, id: string, name: string) {
    setErr(null); setOk(null)
    try {
      // Slice 35: server returns the FULL updated row (inventory + plus
      // + everything) — splice it into the local cache so re-opening
      // the editor on the same character shows the just-saved values
      // immediately, without waiting for a full re-list.
      const r = await api.adminPatchCharacter(token, id, patch)
      setOk(`บันทึก ${name} แล้ว`)
      setEditing(null)
      setChars((prev) => prev?.map((c) => c.id === id ? r.character : c) ?? null)
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status}: ${JSON.stringify(e.body)}` : String(e))
    }
  }
  async function remove(c: AdminCharacterRow) {
    if (!confirm(`ลบตัวละคร "${c.name}" (user ${c.username})? ไม่สามารถ undo ได้`)) return
    setErr(null); setOk(null)
    try {
      await api.adminDeleteCharacter(token, c.id)
      setOk(`ลบ ${c.name}`); await load()
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status}: ${JSON.stringify(e.body)}` : String(e))
    }
  }

  if (!chars) return <div className="admin-loading">กำลังโหลด…</div>

  return (
    <div>
      <PageHead
        title="ตัวละครผู้เล่น"
        desc={`${chars.length} ตัวในระบบ — คลิก "แก้" เพื่อปรับทุก field (stats / race / class / inventory)`}
      />
      {ok && <Toast msg={ok} kind="ok" />}
      {err && <Toast msg={err} kind="err" />}
      <div className="admin-toolbar">
        <SearchBar value={q} onChange={setQ} placeholder="ค้นหาด้วยชื่อตัวละครหรือ username…" />
      </div>

      {editing && (
        <CharacterEditorForm
          initial={editing} races={races} classes={classes} items={items}
          onCancel={() => setEditing(null)}
          onSubmit={(patch) => save(patch, editing.id, editing.name)}
        />
      )}

      <div className="admin-card">
        {filtered!.length === 0 ? (
          <Empty icon="🧝" title="ไม่พบตัวละครที่ตรง" />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th><th>Character</th><th>Race / Class</th>
                <th>Lv</th><th>EXP</th><th>Gold</th><th>Map</th><th>Flags</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered!.map((c) => (
                <tr key={c.id}>
                  <td>{c.username}</td>
                  <td><b>{c.name}</b></td>
                  <td style={{ fontSize: 13, color: '#6b7280' }}>{c.raceId} · {c.classId}</td>
                  <td><b>{c.lv}</b></td>
                  <td style={{ fontSize: 13, color: '#6b7280' }}>{c.exp}</td>
                  <td style={{ fontSize: 13 }}>{c.gold.toLocaleString()}</td>
                  <td style={{ fontSize: 13, color: '#6b7280' }}>{c.mapId}</td>
                  <td>
                    {c.transcended && <span className="pill pill-green">✨</span>}
                    {' '}
                    {c.classChanged && <span className="pill pill-purple">🎯</span>}
                  </td>
                  <td className="row-actions">
                    <button className="btn-a btn-a-small" onClick={() => setEditing(c)}>แก้</button>
                    <button className="btn-a btn-a-small btn-a-danger" onClick={() => remove(c)} style={{ marginLeft: 4 }}>ลบ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function CharacterEditorForm({
  initial, races, classes, items, onSubmit, onCancel,
}: {
  initial: AdminCharacterRow
  races: Race[]
  classes: CharClass[]
  items: AdminItemRow[]
  onSubmit: (patch: AdminCharacterPatch) => void
  onCancel: () => void
}) {
  // Slice 33: pre-fill EVERY field from the row so saving without
  // touching a field doesn't nuke that field. Previously inventory/plus
  // defaulted to '{}' which deleted items on save.
  const [lv, setLv] = useState(initial.lv)
  const [exp, setExp] = useState(initial.exp)
  const [gold, setGold] = useState(initial.gold)
  const [mapId, setMapId] = useState(initial.mapId)
  const [raceId, setRaceId] = useState(initial.raceId)
  const [classId, setClassId] = useState(initial.classId)
  const [transcended, setTranscended] = useState(initial.transcended)
  const [classChanged, setClassChanged] = useState(initial.classChanged)
  const [primaryJson, setPrimaryJson] = useState(JSON.stringify({
    str: initial.str, int: initial.int, dex: initial.dex,
    agi: initial.agi, luk: initial.luk, vit: initial.vit,
    unspentPoints: initial.unspentPoints,
  }, null, 2))
  const [inventoryJson, setInventoryJson] = useState(JSON.stringify(initial.inventory, null, 2))
  const [equipWeapon, setEquipWeapon] = useState(initial.equipWeapon ?? '')
  const [equipArmor, setEquipArmor] = useState(initial.equipArmor ?? '')
  const [plusJson, setPlusJson] = useState(JSON.stringify(initial.plus, null, 2))
  const [jsonErr, setJsonErr] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setJsonErr(null)
    let primary: Record<string, number>
    let inventory: Record<string, number>
    let plus: Record<string, number>
    try {
      primary = JSON.parse(primaryJson)
      inventory = JSON.parse(inventoryJson)
      plus = JSON.parse(plusJson)
    } catch (err) {
      setJsonErr(`JSON parse error: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    const patch: AdminCharacterPatch = {
      lv, exp, gold, mapId, raceId, classId, transcended, classChanged,
      ...primary,
      inventory,
      plus,
      equipWeapon: equipWeapon === '' ? null : equipWeapon,
      equipArmor: equipArmor === '' ? null : equipArmor,
    }
    onSubmit(patch)
  }

  return (
    <form onSubmit={submit} className="admin-form">
      <div className="admin-form-title">✏️ แก้ตัวละคร: {initial.name} (user: {initial.username})</div>

      <div className="admin-form-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <Field label="Lv"><input type="number" min="1" value={lv} onChange={(e) => setLv(Number(e.target.value))} /></Field>
        <Field label="EXP"><input type="number" min="0" value={exp} onChange={(e) => setExp(Number(e.target.value))} /></Field>
        <Field label="Gold"><input type="number" min="0" value={gold} onChange={(e) => setGold(Number(e.target.value))} /></Field>
        <Field label="Map ID"><input value={mapId} onChange={(e) => setMapId(e.target.value)} /></Field>
      </div>

      <div className="admin-form-row" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 12 }}>
        <Field label="Race">
          <select value={raceId} onChange={(e) => setRaceId(e.target.value)}>
            {races.map((r) => <option key={r.id} value={r.id}>{r.emoji} {r.id} — {r.name}</option>)}
          </select>
        </Field>
        <Field label="Class">
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.id} — {c.name}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 16 }}>
        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={transcended} onChange={(e) => setTranscended(e.target.checked)} />
          {' '}transcended (ผ่าน Lv 10 race quest)
        </label>
        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={classChanged} onChange={(e) => setClassChanged(e.target.checked)} />
          {' '}classChanged (ผ่าน Lv 120 class quest)
        </label>
      </div>

      <div className="admin-form-row" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 12 }}>
        <Field label="Equip Weapon (item id หรือเว้นว่าง)">
          <select value={equipWeapon} onChange={(e) => setEquipWeapon(e.target.value)}>
            <option value="">(none)</option>
            {items.filter((it) => it.type === 'weapon').map((it) => (
              <option key={it.id} value={it.id}>{it.emoji} {it.id} — {it.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Equip Armor">
          <select value={equipArmor} onChange={(e) => setEquipArmor(e.target.value)}>
            <option value="">(none)</option>
            {items.filter((it) => it.type === 'armor').map((it) => (
              <option key={it.id} value={it.id}>{it.emoji} {it.id} — {it.name}</option>
            ))}
          </select>
        </Field>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: '#6b7280' }}>
        ✏️ Primary stats / Inventory / Plus pre-fill จากค่าปัจจุบัน — แก้ตรงๆ ใน textarea ข้างล่างได้เลย
      </div>

      <div className="admin-form-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 6 }}>
        <Field label='Primary stats JSON — { "str":10, "int":10, "dex":10, "agi":10, "luk":10, "vit":10, "unspentPoints":0 }'>
          <textarea value={primaryJson} onChange={(e) => setPrimaryJson(e.target.value)} rows={6}
            style={{ fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }} />
        </Field>
        <Field label='Inventory JSON — { "itemKey": qty, ... }'>
          <textarea value={inventoryJson} onChange={(e) => setInventoryJson(e.target.value)} rows={6}
            style={{ fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }} />
        </Field>
        <Field label='Plus level JSON — { "sword-1_w": 5, "armor-1_a": 3 }'>
          <textarea value={plusJson} onChange={(e) => setPlusJson(e.target.value)} rows={6}
            style={{ fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }} />
        </Field>
      </div>

      {jsonErr && <Toast msg={jsonErr} kind="err" />}

      <div className="admin-form-foot">
        <button type="button" className="btn-a" onClick={onCancel}>ยกเลิก</button>
        <button type="submit" className="btn-a btn-a-primary">บันทึก</button>
      </div>
    </form>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Slice 30 — Users tab + Logs tab
// ═══════════════════════════════════════════════════════════════════════

const STATUS_PILL: Record<AdminUserStatus, string> = {
  ACTIVE: 'pill-green',
  SUSPENDED: 'pill-yellow',
  BANNED: 'pill-red',
}

function UsersTab({ onCount }: { onCount: (n: number) => void }) {
  const token = useToken()
  const [users, setUsers] = useState<AdminUserRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [q, setQ] = useState('')

  async function load() {
    const r = await api.adminListUsers(token)
    setUsers(r.users); onCount(r.users.length)
  }
  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => {
    if (!users) return null
    const needle = q.trim().toLowerCase()
    if (!needle) return users
    return users.filter((u) =>
      u.username.toLowerCase().includes(needle) ||
      (u.email?.toLowerCase().includes(needle) ?? false),
    )
  }, [users, q])

  async function setStatus(u: AdminUserRow, status: AdminUserStatus) {
    setErr(null); setOk(null)
    try {
      await api.adminSetUserStatus(token, u.id, status)
      setOk(`${u.username}: ${u.status} → ${status}`); await load()
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status}: ${JSON.stringify(e.body)}` : String(e))
    }
  }
  async function remove(u: AdminUserRow) {
    if (!confirm(`ลบบัญชี "${u.username}"? ตัวละครทั้งหมดของบัญชีนี้จะถูกลบด้วย — ไม่สามารถ undo ได้`)) return
    setErr(null); setOk(null)
    try {
      await api.adminDeleteUser(token, u.id)
      setOk(`ลบ ${u.username}`); await load()
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status}: ${JSON.stringify(e.body)}` : String(e))
    }
  }

  if (!users) return <div className="admin-loading">กำลังโหลด…</div>

  return (
    <div>
      <PageHead title="บัญชีผู้ใช้" desc={`${users.length} บัญชี — ปรับสถานะ (ACTIVE / SUSPENDED / BANNED) หรือลบบัญชี`} />
      {ok && <Toast msg={ok} kind="ok" />}
      {err && <Toast msg={err} kind="err" />}
      <div className="admin-toolbar">
        <SearchBar value={q} onChange={setQ} placeholder="ค้นหา username หรือ email…" />
      </div>
      <div className="admin-card">
        {filtered!.length === 0 ? <Empty icon="👤" title="ไม่พบผู้ใช้" /> : (
          <table className="admin-table">
            <thead>
              <tr><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Chars</th><th>Created</th><th></th></tr>
            </thead>
            <tbody>
              {filtered!.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.username}</b></td>
                  <td style={{ fontSize: 13, color: '#6b7280' }}>{u.email ?? '—'}</td>
                  <td>
                    {u.role === 'ADMIN'
                      ? <span className="pill pill-purple">ADMIN</span>
                      : <span className="pill pill-gray">USER</span>}
                  </td>
                  <td><span className={`pill ${STATUS_PILL[u.status]}`}>{u.status}</span></td>
                  <td style={{ fontSize: 13 }}>{u.characterCount}</td>
                  <td style={{ fontSize: 11, color: '#6b7280' }}>
                    {new Date(u.createdAt).toLocaleDateString('th-TH')}
                  </td>
                  <td className="row-actions">
                    <select value={u.status} onChange={(e) => setStatus(u, e.target.value as AdminUserStatus)}
                      style={{ fontSize: 12, padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4 }}>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="SUSPENDED">SUSPENDED</option>
                      <option value="BANNED">BANNED</option>
                    </select>
                    <button className="btn-a btn-a-small btn-a-danger" onClick={() => remove(u)} style={{ marginLeft: 4 }}>ลบ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function LogsTab() {
  const token = useToken()
  const [logs, setLogs] = useState<AdminLogRow[] | null>(null)
  const [action, setAction] = useState('')
  const [targetType, setTargetType] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    setErr(null)
    try {
      const r = await api.adminListLogs(token, {
        action: action || undefined,
        targetType: targetType || undefined,
        limit: 100,
      })
      setLogs(r.logs)
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status}: ${JSON.stringify(e.body)}` : String(e))
    }
  }
  useEffect(() => { void load() }, [])

  return (
    <div>
      <PageHead title="Audit Logs" desc="ทุกการแก้ไขผ่าน /api/admin/* จะถูกบันทึกที่นี่ (100 รายการล่าสุด)" />
      {err && <Toast msg={err} kind="err" />}

      <div className="admin-toolbar">
        <div className="admin-search" style={{ flex: 1 }}>
          <input placeholder="กรอง action (เช่น character. หรือ user.)" value={action}
            onChange={(e) => setAction(e.target.value)} />
        </div>
        <div className="admin-search" style={{ flex: 1 }}>
          <input placeholder="กรอง targetType (เช่น item, monster, character, user)"
            value={targetType} onChange={(e) => setTargetType(e.target.value)} />
        </div>
        <button className="btn-a btn-a-primary" onClick={() => void load()}>🔍 ค้นหา</button>
      </div>

      <div className="admin-card">
        {!logs ? <div className="admin-loading">กำลังโหลด…</div>
          : logs.length === 0 ? <Empty icon="📜" title="ไม่มี log ตรงเงื่อนไข" />
          : (
            <table className="admin-table">
              <thead>
                <tr><th>เมื่อ</th><th>Actor</th><th>Action</th><th>Target</th><th>Payload</th></tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {new Date(l.createdAt).toLocaleString('th-TH')}
                    </td>
                    <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{l.actorUserId ?? 'system'}</td>
                    <td><span className="pill pill-blue">{l.action}</span></td>
                    <td style={{ fontSize: 12 }}>
                      {l.targetType}{l.targetId && <span style={{ color: '#9ca3af' }}> · {l.targetId.slice(0, 8)}…</span>}
                    </td>
                    <td style={{ fontSize: 11, fontFamily: 'monospace', color: '#6b7280', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.payload ? JSON.stringify(l.payload).slice(0, 120) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  )
}

// ─── Cache tab ─────────────────────────────────────────────────────────────

function CacheTab() {
  const token = useToken()
  const loadContent = useGame((s) => s.loadContent)
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function reload() {
    setBusy(true); setErr(null); setOk(null)
    try {
      await api.adminReloadCache(token)
      await loadContent()
      setOk('รีโหลด Content cache เสร็จแล้ว — ของในเกมอัปเดตทันที')
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.status}: ${JSON.stringify(e.body)}` : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHead title="แคช / รีโหลด" desc="บังคับรีโหลด Content cache บน server + client ปัจจุบัน" />
      {ok && <Toast msg={ok} kind="ok" />}
      {err && <Toast msg={err} kind="err" />}

      <div className="admin-card admin-card-pad" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, lineHeight: 1.7, color: '#374151' }}>
          Server มี <b>in-memory ContentCache</b> ที่อ่าน Content ทั้งหมดจาก DB
          ครั้งแรกแล้วเก็บไว้ ทุก mutation ของ admin (Item / Monster / Map / Warp)
          จะ <b>invalidate cache อัตโนมัติ</b> แต่ <b>client ของผู้เล่นที่กำลัง online</b>
          ยังถือ Content cache ของตัวเองอยู่ — ปุ่มข้างล่างจะรีโหลด client ของคุณเอง
          (ผู้เล่นคนอื่นต้อง refresh / login ใหม่)
        </div>
      </div>

      <button className="btn-a btn-a-primary" onClick={reload} disabled={busy}
        style={{ padding: '10px 18px', fontSize: 14 }}>
        {busy ? '⏳ กำลังรีโหลด…' : '♻️ Force reload server + client cache'}
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Slice 28 — Races tab
// ═══════════════════════════════════════════════════════════════════════

const STATS_ORDER_ADMIN: PrimaryStat[] = ['str', 'int', 'dex', 'agi', 'luk', 'vit']

function RacesTab({ onCount }: { onCount: (n: number) => void }) {
  const token = useToken()
  const [races, setRaces] = useState<Race[] | null>(null)
  const [editing, setEditing] = useState<Race | null>(null)
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function load() {
    const r = await api.adminListRaces(token)
    setRaces(r.races); onCount(r.races.length)
  }
  useEffect(() => { void load() }, [])

  async function save(body: Omit<Race, 'id'>, id: string) {
    setErr(null); setOk(null)
    try { await api.adminUpdateRace(token, id, body); setOk(`บันทึก ${id}`); setEditing(null); await load() }
    catch (e) { setErr(e instanceof ApiError ? `${e.status}: ${JSON.stringify(e.body)}` : String(e)) }
  }
  async function create(body: Race) {
    setErr(null); setOk(null)
    try { await api.adminCreateRace(token, body); setOk(`สร้าง ${body.id}`); setCreating(false); await load() }
    catch (e) { setErr(e instanceof ApiError ? `${e.status}: ${JSON.stringify(e.body)}` : String(e)) }
  }
  async function remove(id: string) {
    if (!confirm(`ลบ race ${id}? ตัวละครที่ราคา id นี้จะ raceId ค้าง`)) return
    setErr(null); setOk(null)
    try { await api.adminDeleteRace(token, id); setOk(`ลบ ${id}`); await load() }
    catch (e) { setErr(e instanceof ApiError ? `${e.status}: ${JSON.stringify(e.body)}` : String(e)) }
  }

  if (!races) return <div className="admin-loading">กำลังโหลด…</div>

  return (
    <div>
      <PageHead title="เผ่า (Race)"
        desc={`${races.length} เผ่า — ตัวเลือก Tier-2 ของ class tree (Lv 10 quest)`}
        right={<button className="btn-a btn-a-primary" onClick={() => setCreating(true)}>+ สร้างใหม่</button>} />
      {ok && <Toast msg={ok} kind="ok" />}
      {err && <Toast msg={err} kind="err" />}

      {creating && (
        <RaceForm mode="create" initial={null}
          onCancel={() => setCreating(false)}
          onSubmit={(b) => create(b as Race)} />
      )}
      {editing && (
        <RaceForm mode="edit" initial={editing}
          onCancel={() => setEditing(null)}
          onSubmit={(b) => save(b, editing.id)} />
      )}

      <div className="admin-card">
        {races.length === 0 ? <Empty icon="🧬" title="ยังไม่มี race" /> : (
          <table className="admin-table">
            <thead>
              <tr><th>ID</th><th>Name</th><th>Modifiers</th><th>Flags</th><th></th></tr>
            </thead>
            <tbody>
              {races.map((r) => {
                const mods = STATS_ORDER_ADMIN
                  .map((k) => [k, r.modifiers[k] ?? 0] as const)
                  .filter(([, v]) => v !== 0)
                return (
                  <tr key={r.id}>
                    <td><span className="id-mono">{r.id}</span></td>
                    <td><span style={{ fontSize: 16, marginRight: 6 }}>{r.emoji}</span>{r.name}</td>
                    <td style={{ fontSize: 13, color: '#6b7280' }}>
                      {mods.length === 0 ? '—' :
                        mods.map(([k, v]) => `${k.toUpperCase()} ${v > 0 ? '+' : ''}${v}`).join(' · ')}
                    </td>
                    <td>
                      {r.starter && <span className="pill pill-green">starter</span>}
                      {!r.available && <span className="pill pill-gray" style={{ marginLeft: 4 }}>legacy</span>}
                    </td>
                    <td className="row-actions">
                      <button className="btn-a btn-a-small" onClick={() => setEditing(r)}>แก้</button>
                      <button className="btn-a btn-a-small btn-a-danger" onClick={() => remove(r.id)} style={{ marginLeft: 4 }}>ลบ</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function RaceForm({ mode, initial, onSubmit, onCancel }: {
  mode: 'create' | 'edit'
  initial: Race | null
  onSubmit: (body: Race | Omit<Race, 'id'>) => void
  onCancel: () => void
}) {
  const [id, setId] = useState(initial?.id ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [emoji, setEmoji] = useState(initial?.emoji ?? '🧬')
  const [desc, setDesc] = useState(initial?.desc ?? '')
  const [mods, setMods] = useState<StatModifier>(initial?.modifiers ?? {})
  const [available, setAvailable] = useState(initial?.available ?? true)
  const [starter, setStarter] = useState(initial?.starter ?? false)

  function setMod(k: PrimaryStat, v: string) {
    const n = v === '' ? undefined : Number(v)
    setMods((cur) => ({ ...cur, [k]: n }))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const body = { name, emoji, desc, modifiers: mods, available, starter }
    if (mode === 'create') onSubmit({ id: id.trim(), ...body })
    else onSubmit(body)
  }

  return (
    <form onSubmit={submit} className="admin-form">
      <div className="admin-form-title">
        {mode === 'create' ? '✨ สร้าง Race ใหม่' : `✏️ แก้ Race: ${initial?.id}`}
      </div>
      <div className="admin-form-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {mode === 'create' && (
          <Field label="ID (kebab-case)">
            <input value={id} onChange={(e) => setId(e.target.value)} required pattern="[a-z0-9-]+" />
          </Field>
        )}
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Emoji"><input value={emoji} onChange={(e) => setEmoji(e.target.value)} required /></Field>
      </div>
      <Field label="Description">
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} style={{ resize: 'vertical' }} />
      </Field>

      <div style={{ marginTop: 12, fontWeight: 600, fontSize: 14 }}>Stat modifiers (ปล่อยว่าง = 0)</div>
      <div className="admin-form-row" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        {STATS_ORDER_ADMIN.map((k) => (
          <Field key={k} label={k.toUpperCase()}>
            <input type="number" value={mods[k] ?? ''}
              onChange={(e) => setMod(k, e.target.value)} placeholder="0" />
          </Field>
        ))}
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 16 }}>
        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} />
          {' '}available (โผล่ใน picker)
        </label>
        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={starter} onChange={(e) => setStarter(e.target.checked)} />
          {' '}starter (race อัตโนมัติตอนสร้าง)
        </label>
      </div>

      <div className="admin-form-foot">
        <button type="button" className="btn-a" onClick={onCancel}>ยกเลิก</button>
        <button type="submit" className="btn-a btn-a-primary">บันทึก</button>
      </div>
    </form>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Slice 28 — Classes tab
// ═══════════════════════════════════════════════════════════════════════

const SKILL_TYPES: SkillType[] = ['phys', 'magic', 'heal', 'holy']

function ClassesTab({ onCount }: { onCount: (n: number) => void }) {
  const token = useToken()
  const [classes, setClasses] = useState<CharClass[] | null>(null)
  const [races, setRaces] = useState<Race[] | null>(null)
  const [editing, setEditing] = useState<CharClass | null>(null)
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function load() {
    const [c, r] = await Promise.all([api.adminListClasses(token), api.adminListRaces(token)])
    setClasses(c.classes); setRaces(r.races); onCount(c.classes.length)
  }
  useEffect(() => { void load() }, [])

  async function save(body: Omit<CharClass, 'id'>, id: string) {
    setErr(null); setOk(null)
    try { await api.adminUpdateClass(token, id, body); setOk(`บันทึก ${id}`); setEditing(null); await load() }
    catch (e) { setErr(e instanceof ApiError ? `${e.status}: ${JSON.stringify(e.body)}` : String(e)) }
  }
  async function create(body: CharClass) {
    setErr(null); setOk(null)
    try { await api.adminCreateClass(token, body); setOk(`สร้าง ${body.id}`); setCreating(false); await load() }
    catch (e) { setErr(e instanceof ApiError ? `${e.status}: ${JSON.stringify(e.body)}` : String(e)) }
  }
  async function remove(id: string) {
    if (!confirm(`ลบ class ${id}? ตัวละครที่ classId นี้จะ id ค้าง`)) return
    setErr(null); setOk(null)
    try { await api.adminDeleteClass(token, id); setOk(`ลบ ${id}`); await load() }
    catch (e) { setErr(e instanceof ApiError ? `${e.status}: ${JSON.stringify(e.body)}` : String(e)) }
  }

  if (!classes || !races) return <div className="admin-loading">กำลังโหลด…</div>

  return (
    <div>
      <PageHead title="อาชีพ (Class)"
        desc={`${classes.length} class — Tier-3 ของ class tree (Lv 120 quest, gated โดย requiredRaceId)`}
        right={<button className="btn-a btn-a-primary" onClick={() => setCreating(true)}>+ สร้างใหม่</button>} />
      {ok && <Toast msg={ok} kind="ok" />}
      {err && <Toast msg={err} kind="err" />}

      {creating && (
        <ClassForm mode="create" initial={null} races={races}
          onCancel={() => setCreating(false)}
          onSubmit={(b) => create(b as CharClass)} />
      )}
      {editing && (
        <ClassForm mode="edit" initial={editing} races={races}
          onCancel={() => setEditing(null)}
          onSubmit={(b) => save(b, editing.id)} />
      )}

      <div className="admin-card">
        {classes.length === 0 ? <Empty icon="⚔️" title="ยังไม่มี class" /> : (
          <table className="admin-table">
            <thead>
              <tr><th>ID</th><th>Name</th><th>Race</th><th>Skill</th><th>Growth</th><th>Flags</th><th></th></tr>
            </thead>
            <tbody>
              {classes.map((c) => {
                const growth = STATS_ORDER_ADMIN
                  .map((k) => [k, c.growth[k] ?? 0] as const)
                  .filter(([, v]) => v > 0)
                  .sort((a, b) => b[1] - a[1])
                return (
                  <tr key={c.id}>
                    <td><span className="id-mono">{c.id}</span></td>
                    <td><span style={{ fontSize: 16, marginRight: 6 }}>{c.emoji}</span>{c.name}</td>
                    <td style={{ fontSize: 13, color: '#6b7280' }}>{c.requiredRaceId ?? '—'}</td>
                    <td style={{ fontSize: 13, color: '#6b7280' }}>{c.skill.name} ({c.skill.type} ×{c.skill.mult})</td>
                    <td style={{ fontSize: 13, color: '#6b7280' }}>
                      {growth.length === 0 ? '—' :
                        growth.map(([k, v]) => `${k.toUpperCase()}×${v}`).join(' / ')}
                    </td>
                    <td>
                      {c.starter && <span className="pill pill-green">starter</span>}
                      {!c.available && <span className="pill pill-gray" style={{ marginLeft: 4 }}>legacy</span>}
                    </td>
                    <td className="row-actions">
                      <button className="btn-a btn-a-small" onClick={() => setEditing(c)}>แก้</button>
                      <button className="btn-a btn-a-small btn-a-danger" onClick={() => remove(c.id)} style={{ marginLeft: 4 }}>ลบ</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function ClassForm({ mode, initial, races, onSubmit, onCancel }: {
  mode: 'create' | 'edit'
  initial: CharClass | null
  races: Race[]
  onSubmit: (body: CharClass | Omit<CharClass, 'id'>) => void
  onCancel: () => void
}) {
  const [id, setId] = useState(initial?.id ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [emoji, setEmoji] = useState(initial?.emoji ?? '⚔️')
  const [desc, setDesc] = useState(initial?.desc ?? '')
  const [growth, setGrowth] = useState<StatModifier>(initial?.growth ?? {})
  const [skill, setSkill] = useState<Skill>(initial?.skill ?? {
    name: '', mp: 0, mult: 1, type: 'phys',
  })
  const [starter, setStarter] = useState(initial?.starter ?? false)
  const [available, setAvailable] = useState(initial?.available ?? true)
  const [requiredRaceId, setRequiredRaceId] = useState(initial?.requiredRaceId ?? '')

  function setGrowthVal(k: PrimaryStat, v: string) {
    const n = v === '' ? undefined : Number(v)
    setGrowth((cur) => ({ ...cur, [k]: n }))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const body = {
      name, emoji, desc, growth, skill,
      starter, available,
      requiredRaceId: requiredRaceId === '' ? undefined : requiredRaceId,
    }
    if (mode === 'create') onSubmit({ id: id.trim(), ...body })
    else onSubmit(body)
  }

  return (
    <form onSubmit={submit} className="admin-form">
      <div className="admin-form-title">
        {mode === 'create' ? '✨ สร้าง Class ใหม่' : `✏️ แก้ Class: ${initial?.id}`}
      </div>
      <div className="admin-form-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {mode === 'create' && (
          <Field label="ID (kebab-case)">
            <input value={id} onChange={(e) => setId(e.target.value)} required pattern="[a-z0-9-]+" />
          </Field>
        )}
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Emoji"><input value={emoji} onChange={(e) => setEmoji(e.target.value)} required /></Field>
        <Field label="Required Race (Lv 120 gate)">
          <select value={requiredRaceId} onChange={(e) => setRequiredRaceId(e.target.value)}>
            <option value="">(none — starter / cross-race)</option>
            {races.filter((r) => r.available).map((r) => (
              <option key={r.id} value={r.id}>{r.emoji} {r.id} — {r.name}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Description">
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} style={{ resize: 'vertical' }} />
      </Field>

      <div style={{ marginTop: 12, fontWeight: 600, fontSize: 14 }}>Growth weights (แนะนำการเทใส่ stats)</div>
      <div className="admin-form-row" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        {STATS_ORDER_ADMIN.map((k) => (
          <Field key={k} label={k.toUpperCase()}>
            <input type="number" value={growth[k] ?? ''}
              onChange={(e) => setGrowthVal(k, e.target.value)} placeholder="0" />
          </Field>
        ))}
      </div>

      <div style={{ marginTop: 12, fontWeight: 600, fontSize: 14 }}>Skill</div>
      <div className="admin-form-row" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
        <Field label="Name"><input value={skill.name} onChange={(e) => setSkill({ ...skill, name: e.target.value })} /></Field>
        <Field label="MP cost"><input type="number" value={skill.mp} onChange={(e) => setSkill({ ...skill, mp: Number(e.target.value) })} /></Field>
        <Field label="Multiplier"><input type="number" step="0.1" value={skill.mult} onChange={(e) => setSkill({ ...skill, mult: Number(e.target.value) })} /></Field>
        <Field label="Type">
          <select value={skill.type} onChange={(e) => setSkill({ ...skill, type: e.target.value as SkillType })}>
            {SKILL_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 16 }}>
        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} />
          {' '}available
        </label>
        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={starter} onChange={(e) => setStarter(e.target.checked)} />
          {' '}starter (Lv 1 class)
        </label>
      </div>

      <div className="admin-form-foot">
        <button type="button" className="btn-a" onClick={onCancel}>ยกเลิก</button>
        <button type="submit" className="btn-a btn-a-primary">บันทึก</button>
      </div>
    </form>
  )
}
