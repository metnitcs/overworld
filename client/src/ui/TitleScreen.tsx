import { useEffect, useMemo, useState } from 'react'
import { useGame } from '../game/store'
import { ApiError } from '../api/client'

// ──────────────────────────────────────────────────────────────
// Portal — the front page of อสูรเว็บ Online.
// Rendered when store.screen === 'title'. Uses the Mochi design
// system layered with the Asura dark-MMORPG override (see index.css).
// ──────────────────────────────────────────────────────────────

const PALETTES: Array<[string, string]> = [
  ['#fda4af', '#e11d48'], ['#c4b5fd', '#7c3aed'], ['#7dd3fc', '#0284c7'],
  ['#6ee7b7', '#059669'], ['#fcd34d', '#d97706'], ['#fca5a5', '#dc2626'],
  ['#a5b4fc', '#4f46e5'], ['#fdba74', '#ea580c'], ['#d8b4fe', '#9333ea'],
  ['#5eead4', '#0d9488'], ['#f0abfc', '#c026d3'], ['#86efac', '#16a34a'],
]

const NAMES_TH = [
  'ลูกพีช','นมเย็น','ดาบหวาน','พิษเงา','นางฟ้าน้อย','สายฟ้า','ราตรี','คาฟกะ',
  'เงาดำ','โซดา','คุกกี้','มาชา','ปุยฝ้าย','แพนเค้ก','คาราเมล','ชีสบอล',
  'ไอติม','ดวงดาว','โคโค่','พริกหวาน','ลาเต้','ทาโกะ','เมโลดี้','ทาร์ต',
  'โซดาเย็น','ดอกหญ้า','ฟ้าใส','น้ำผึ้ง','ส้มหวาน','อสูรน้อย',
  'แมวเหมียว','น้องโบว์','กล้วยหอม','ลูกบอล','คุณคุง','พริ้งงาม',
  'ฟาดเดี้ยว','พ่อมด','เสือโคร่ง','สาวซากุระ','เลือดมืด','ดอกซากุระ',
  'ภูเขาไฟ','นรกลึก','มารน้อย','เทพน้อย','ยักษ์จ๋า','พญาโหด',
]

interface Member { online: boolean; palette?: [string, string]; name?: string; monogram?: string; lvl?: number }

function makeMembers(n: number, rng: () => number = Math.random): Member[] {
  const out: Member[] = []
  for (let i = 0; i < n; i++) {
    if (rng() >= 0.86) { out.push({ online: false }); continue }
    const p = PALETTES[Math.floor(rng() * PALETTES.length)]
    const nm = NAMES_TH[i % NAMES_TH.length]
    out.push({ online: true, palette: p, name: nm, monogram: nm[0], lvl: 30 + Math.floor(rng() * 70) })
  }
  return out
}

export function TitleScreen() {
  const setScreen = useGame(s => s.setScreen)
  const setModal = useGame(s => s.setModal)
  const loadFromStorage = useGame(s => s.loadFromStorage)
  const hasSave = useGame(s => s.hasSave)
  const token = useGame(s => s.token)
  const username = useGame(s => s.username)
  const logout = useGame(s => s.logout)

  const [nav, setNav] = useState(0)
  const [now, setNow] = useState(new Date())
  const [toast, setToast] = useState('')
  const [search, setSearch] = useState('')
  const members = useMemo(() => makeMembers(48), [])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  async function startGame() {
    if (!token) {
      showToast('กรุณาเข้าสู่ระบบก่อนเริ่มเล่น')
      return
    }
    if (hasSave) {
      try {
        await loadFromStorage()
      } catch {
        setScreen('create')
      }
    } else {
      setScreen('create')
    }
  }

  return (
    <div className="mochi asura mochi-page">
      <TopBar
        nav={nav}
        setNav={setNav}
        username={username}
        onLogout={logout}
        onLoginScroll={() => {
          document.querySelector('.login-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }}
      />

      <Hero
        onStart={startGame}
        onHelp={() => setModal('help')}
        hasSave={hasSave}
        loggedIn={!!token}
        username={username}
        onToast={showToast}
      />

      <div className="container">
        <Kpis />
        <NewsAndProfile />
        <TopPlayers />
        <OnlineMembers members={members} search={search} setSearch={setSearch} />
        <EventWeek today={now.getDay()} />
        <QuickActions
          onCreate={() => setScreen('create')}
          onSoon={(label) => showToast(`${label} — เร็วๆ นี้`)}
        />
        <Board />
      </div>

      <Footer now={now} />

      <div className={`toast ${toast ? 'show' : ''}`}>
        <div className="tico">✓</div>
        <div>{toast}</div>
      </div>
    </div>
  )
}

// ============ TOP NAV ============
function TopBar({
  nav, setNav, username, onLogout, onLoginScroll,
}: {
  nav: number; setNav: (n: number) => void;
  username: string | null; onLogout: () => void; onLoginScroll: () => void;
}) {
  const items = ['หน้าหลัก', 'ข้อมูลเกม', 'ข่าว', 'เว็บบอร์ด', 'ติดต่อ']
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand">
          <div className="brand-mark">อ</div>
          <div className="brand-name">อสูรเว็บ<span className="dot">.</span></div>
        </a>
        <nav className="nav">
          {items.map((t, i) => (
            <button key={t} className={nav === i ? 'active' : ''} onClick={() => setNav(i)}>{t}</button>
          ))}
        </nav>
        <div className="nav-right">
          {username ? (
            <>
              <div className="currency-pills">
                <div className="cpill"><span className="cico gold">G</span>368</div>
                <div className="cpill"><span className="cico dia">D</span>23</div>
                <div className="cpill"><span className="cico stamp">S</span>5.2k</div>
              </div>
              <div className="nav-avatar" title={username}>{username[0]?.toUpperCase() || 'อ'}</div>
              <button className="nav-logout" onClick={onLogout} title="ออกจากระบบ">ออก</button>
            </>
          ) : (
            <button className="nav-login-btn" onClick={onLoginScroll}>เข้าสู่ระบบ</button>
          )}
        </div>
      </div>
    </header>
  )
}

// ============ HERO ============
function Hero({
  onStart, onHelp, hasSave, loggedIn, username, onToast,
}: {
  onStart: () => void; onHelp: () => void; hasSave: boolean;
  loggedIn: boolean; username: string | null; onToast: (s: string) => void;
}) {
  return (
    <section className="hero">
      <div className="hero-text">
        <div className="hero-eyebrow">เซิร์ฟเวอร์ ซากุระ เปิดวันที่ 25 พ.ค.</div>
        <h1>ผจญภัยในดินแดน<br/><span className="accent">อสูร</span> ที่ไม่เคยหลับใหล</h1>
        <p className="lead">
          MMO สังคมไทยที่รวมเพื่อนกว่า 1,200 คนทุกค่ำคืน — สร้างตัวละคร 6 เผ่า × 6 อาชีพ,
          คราฟอาวุธ, ตีบวก, เดินสำรวจ 5 แมพต่อเนื่องจากหมู่บ้านไปจนถึงนรกลึก
        </p>
        <div className="hero-cta">
          <button className="btn btn-primary" onClick={onStart} disabled={!loggedIn}>
            {loggedIn ? (hasSave ? 'เล่นต่อจากเซฟ' : 'เริ่มเล่นเกม') : 'ล็อก — กรุณาเข้าสู่ระบบ'} <span className="arrow">→</span>
          </button>
          <button className="btn btn-secondary" onClick={onHelp}>ดูวิธีเล่น</button>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <div className="v"><span className="dot"></span>1,284</div>
            <div className="l">ออนไลน์ตอนนี้</div>
          </div>
          <div className="hero-stat">
            <div className="v accent">x6</div>
            <div className="l">EXP base ตอนนี้</div>
          </div>
          <div className="hero-stat">
            <div className="v">26,300+</div>
            <div className="l">ตัวละครทั้งหมด</div>
          </div>
        </div>
      </div>

      <LoginPanel loggedIn={loggedIn} username={username} onStart={onStart} onToast={onToast} hasSave={hasSave} />
    </section>
  )
}

// ============ LOGIN PANEL ============
function LoginPanel({
  loggedIn, username, onStart, onToast, hasSave,
}: {
  loggedIn: boolean; username: string | null; onStart: () => void; onToast: (s: string) => void; hasSave: boolean;
}) {
  const register = useGame(s => s.register)
  const login = useGame(s => s.login)
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (u.trim().length < 3) { setErr('ชื่อผู้ใช้อย่างน้อย 3 ตัวอักษร'); return }
    if (p.length < 6) { setErr('รหัสผ่านอย่างน้อย 6 ตัวอักษร'); return }
    setBusy(true)
    try {
      if (tab === 'login') {
        await login(u.trim(), p)
        onToast(`ยินดีต้อนรับกลับ ${u.trim()}`)
      } else {
        await register(u.trim(), p)
        onToast(`สร้างบัญชี ${u.trim()} สำเร็จ`)
      }
    } catch (e) {
      if (e instanceof ApiError) {
        const body = (e.body && typeof e.body === 'object') ? e.body as { error?: string } : {}
        setErr(body.error ?? (e.status === 401 ? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
                          : e.status === 409 ? 'มีผู้ใช้งานชื่อนี้แล้ว'
                          : `เกิดข้อผิดพลาด (${e.status})`))
      } else {
        setErr('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
      }
    } finally {
      setBusy(false)
    }
  }

  if (loggedIn) {
    return (
      <div className="login-panel">
        <div className="login-head">
          <div className="crest">อ</div>
          <h3>ยินดีต้อนรับสู่ดินแดนอสูร</h3>
          <div className="sub">PLAYER LOGGED IN</div>
        </div>
        <div className="login-welcome">
          <div className="greet">สวัสดี <span className="name">{username}</span></div>
          <div className="sub">{hasSave ? 'ตัวละครของคุณรออยู่ในเซิร์ฟเวอร์' : 'ยังไม่มีตัวละคร — กดเริ่มเล่นเพื่อสร้าง'}</div>
        </div>
        <button className="btn btn-primary login-submit" onClick={onStart}>
          {hasSave ? 'เข้าเล่นต่อ' : 'สร้างตัวละครใหม่'} <span className="arrow">→</span>
        </button>
      </div>
    )
  }

  return (
    <form className="login-panel" onSubmit={submit}>
      <div className="login-head">
        <div className="crest">อ</div>
        <h3>เข้าสู่ดินแดนอสูร</h3>
        <div className="sub">ENTER THE REALM</div>
      </div>
      <div className="login-tabs">
        <button type="button" className={tab === 'login' ? 'active' : ''} onClick={() => { setTab('login'); setErr(null) }}>เข้าสู่ระบบ</button>
        <button type="button" className={tab === 'register' ? 'active' : ''} onClick={() => { setTab('register'); setErr(null) }}>สมัครสมาชิก</button>
      </div>
      <div className="login-field">
        <label htmlFor="lp-user">ชื่อผู้ใช้</label>
        <input id="lp-user" type="text" autoComplete="username" placeholder="adventurer01" value={u} onChange={e => setU(e.target.value)} disabled={busy} />
      </div>
      <div className="login-field">
        <label htmlFor="lp-pass">รหัสผ่าน</label>
        <input id="lp-pass" type="password" autoComplete={tab === 'login' ? 'current-password' : 'new-password'} placeholder="••••••••" value={p} onChange={e => setP(e.target.value)} disabled={busy} />
      </div>
      {err && <div className="login-error">{err}</div>}
      <button type="submit" className="btn btn-primary login-submit" disabled={busy}>
        {busy ? 'กำลังเข้าสู่ระบบ…' : (tab === 'login' ? 'เข้าสู่ระบบ' : 'สร้างบัญชี')}
      </button>
      <div className="login-foot">
        <span>{tab === 'login' ? 'ยังไม่มีบัญชี?' : 'มีบัญชีอยู่แล้ว?'}</span>
        <a onClick={() => { setTab(tab === 'login' ? 'register' : 'login'); setErr(null) }}>
          {tab === 'login' ? 'สมัครสมาชิก →' : '← เข้าสู่ระบบ'}
        </a>
      </div>
    </form>
  )
}

// ============ KPI ============
function Kpis() {
  const items = [
    { label: 'ผู้เล่นออนไลน์', value: '1,284', delta: '+128 ในชั่วโมงนี้', ic: '◉', tone: 'pink' as const },
    { label: 'EXP Multiplier', value: 'x6', delta: 'หมดเขต 31 พ.ค.', ic: '⚡', tone: 'amber' as const, flat: true },
    { label: 'อันดับสูงสุดวันนี้', value: 'จอมมารราตรี', delta: 'Lv 99 · นักดาบเดือด', ic: '♛', tone: 'violet' as const, flat: true },
    { label: 'กิลด์ทั้งหมด', value: '843', delta: '+12 สัปดาห์นี้', ic: '⚔', tone: 'blue' as const },
  ]
  return (
    <section className="section">
      <div className="kpis">
        {items.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="top">
              <span className="label">{k.label}</span>
              <span className={`ico ${k.tone}`}>{k.ic}</span>
            </div>
            <div className="value">{k.value}</div>
            <div className={`delta${k.flat ? ' flat' : ''}`}>{k.delta}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ============ NEWS + PROFILE ============
type NewsTone = 'blue' | 'pink' | 'amber' | 'violet' | 'mint'
type NewsCat = 'update' | 'event' | 'promo'

function NewsAndProfile() {
  const [tab, setTab] = useState<'all' | NewsCat>('all')
  const TABS: Array<{ k: 'all' | NewsCat; l: string }> = [
    { k: 'all', l: 'ทั้งหมด' },
    { k: 'update', l: 'อัพเดต' },
    { k: 'event', l: 'อีเวนต์' },
    { k: 'promo', l: 'โปรโมชั่น' },
  ]
  const news: Array<{ tag: string; tone: NewsTone; icon: string; date: string; title: string; ex: string; cat: NewsCat }> = [
    { tag: 'อัพเดต', tone: 'blue',   icon: '◢', date: '15 พ.ค.', title: 'แพตช์ Beta 0.2.1 — ปรับสมดุลนักดาบเดือดและชาแมนเร้นลับ', ex: 'รายละเอียดสกิลใหม่ บัฟตัวละคร และไอเทมเสริมพลัง',     cat: 'update' },
    { tag: 'ใหม่',   tone: 'pink',   icon: '✦', date: '12 พ.ค.', title: "แมพใหม่ 'นรกลึก' เปิดให้สำรวจ พร้อมบอสจอมมาร",         ex: 'ทดสอบบอสประจำชั้น พร้อมดรอปเกราะมงกุฎมาร',                 cat: 'update' },
    { tag: 'อีเวนต์', tone: 'amber', icon: '★', date: '07 พ.ค.', title: 'อีเวนต์ฉลองเปิดเซิร์ฟ — รับของรางวัลใหญ่ตลอดเดือน',     ex: 'ล็อกอินทุกวันรับหินตีบวกและตั๋วชิงโชค',                     cat: 'event' },
    { tag: 'โปรโมชั่น', tone: 'violet', icon: '✿', date: '04 พ.ค.', title: 'โปรโมชั่นเติม 300฿ รับโบนัสเพิ่ม 50% ตลอดเดือน พ.ค.', ex: 'เฉพาะยอดเติม 300 บาทขึ้นไป จำกัด 1 ครั้ง/วัน',             cat: 'promo' },
    { tag: 'HOT',    tone: 'mint',   icon: '▲', date: '01 พ.ค.', title: 'เปิดเซิร์ฟเวอร์ใหม่ ซากุระ — 25 พ.ค. 18:00 น.',          ex: 'เซิร์ฟเวอร์ที่ 2 เปิดให้สร้างตัวล่วงหน้าได้แล้ว',          cat: 'event' },
  ]
  const filtered = tab === 'all' ? news : news.filter(n => n.cat === tab)

  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>ข่าวสารและกิจกรรม</h2>
          <div className="sub">รายการอัพเดตล่าสุดและกิจกรรมประจำเดือน</div>
        </div>
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="news-tabs">
            {TABS.map(x => (
              <button key={x.k} className={tab === x.k ? 'active' : ''} onClick={() => setTab(x.k)}>{x.l}</button>
            ))}
          </div>
          <div className="news-list">
            {filtered.map((n, i) => (
              <div className="news-row" key={i}>
                <div className={`news-thumb t-${n.tone}`}>{n.icon}</div>
                <div className="news-meta">
                  <div className={`tag ${n.tone}`}>{n.tag}</div>
                  <div className="ttl">{n.title}</div>
                  <div className="ex">{n.ex}</div>
                </div>
                <div className="news-date">{n.date}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="profile">
          <div className="card card-pad">
            <div className="profile-head">
              <div className="profile-art">
                <span>😈</span>
                <span className="badge-lvl">Lv 1</span>
              </div>
              <div>
                <div className="profile-name">นักผจญภัย</div>
                <div className="profile-id">@asura_021 · นักดาบเดือด</div>
              </div>
            </div>
            <div>
              <div className="stat-row">
                <span className="l"><span className="sico gold">G</span>ทอง</span>
                <span className="v">368</span>
              </div>
              <div className="stat-row">
                <span className="l"><span className="sico dia">D</span>เพชร</span>
                <span className="v">23</span>
              </div>
              <div className="stat-row">
                <span className="l"><span className="sico stamp">S</span>แสตมป์</span>
                <span className="v">5,250</span>
              </div>
            </div>
            <div className="profile-actions">
              <button className="btn pa-primary">เติมเงิน</button>
              <button className="btn pa-ghost">โปรไฟล์</button>
            </div>
          </div>

          <div className="mail-tile">
            <div className="mico">✉</div>
            <div className="info">
              <div className="t">กล่องจดหมาย</div>
              <div className="s">มีของขวัญใหม่ 3 รายการ</div>
            </div>
            <span className="count">3</span>
          </div>
        </div>
      </div>
    </section>
  )
}

// ============ TOP PLAYERS ============
function TopPlayers() {
  const groups: Array<{ tier: 'gold' | 'violet' | 'mint'; tone: string; cap: string; heroName: string; heroLv: number; emoji: string; entries: Array<[string, number]> }> = [
    {
      tier: 'gold', tone: 'BABY', cap: 'MAX LV 30', heroName: 'เด็กน้อยจอมพลัง', heroLv: 30, emoji: '👼',
      entries: [['เด็กน้อยจอมพลัง', 30], ['ดาบเล็ก', 30], ['ปืนนิดเดียว', 30], ['นางฟ้ากระจิด', 30], ['สัตว์อสูรน้อย', 30], ['กาแฟเย็น', 30]],
    },
    {
      tier: 'violet', tone: 'MAIN', cap: 'MAX LV 99', heroName: 'จอมมารราตรี', heroLv: 99, emoji: '😈',
      entries: [['จอมมารราตรี', 99], ['นักดาบฟ้าผ่า', 99], ['อัสซาซินเงา', 99], ['ชาแมนพันปี', 99], ['อัศวินคลั่ง', 99], ['นักดนตรีเทพ', 99]],
    },
    {
      tier: 'mint', tone: 'SUPER', cap: 'MAX LV 50', heroName: 'ผู้พิทักษ์สายลม', heroLv: 50, emoji: '🐺',
      entries: [['ผู้พิทักษ์สายลม', 50], ['หมาป่าเงา', 49], ['มังกรน้อย', 48], ['จอมเวท', 47], ['สวรรค์มืด', 46], ['พญายักษ์', 45]],
    },
  ]
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>อันดับผู้เล่น</h2>
          <div className="sub">3 ประเภทแชมป์ประจำเซิร์ฟเวอร์ — อัปเดตทุกชั่วโมง</div>
        </div>
        <a className="more">ดูทั้งหมด</a>
      </div>
      <div className="podium-grid">
        {groups.map((g) => (
          <div className={`player-card ${g.tier}`} key={g.tone}>
            <div className="head">
              <span className="tier">{g.tone}</span>
              <span className="cap">{g.cap}</span>
            </div>
            <div className="player-art">
              <span>{g.emoji}</span>
              <div className="hero-name">{g.heroName} · Lv {g.heroLv}</div>
            </div>
            <div className="player-list">
              {g.entries.map(([n, lv], i) => (
                <div className="row" key={n}>
                  <span className="rk">{i + 1}</span>
                  <span className="pn">{n}</span>
                  <span className="lv">Lv {lv}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ============ MEMBERS ============
function OnlineMembers({ members, search, setSearch }: { members: Member[]; search: string; setSearch: (s: string) => void }) {
  const filtered = members.filter(m => !search || (m.name && m.name.toLowerCase().includes(search.toLowerCase())))
  const onlineN = members.filter(m => m.online).length
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>สมาชิกออนไลน์</h2>
          <div className="sub">รายชื่อล่าสุด — สามารถคลิกเพื่อดูโปรไฟล์</div>
        </div>
        <a className="more">ดูทั้งหมด</a>
      </div>
      <div className="card members-card">
        <div className="members-filter">
          <div className="search-box">
            <input
              placeholder="ค้นหาชื่อสมาชิก..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="count-chip">{onlineN} ออนไลน์</span>
        </div>
        <div className="members">
          {filtered.map((m, i) => (
            <Avatar key={i} {...m} />
          ))}
        </div>
      </div>
    </section>
  )
}

function Avatar({ palette, monogram, lvl, name, online = true }: Member) {
  if (!online || !palette) return <div className="avatar empty">—</div>
  const grad = `linear-gradient(135deg, ${palette[0]} 0%, ${palette[1]} 100%)`
  return (
    <div className="avatar" style={{ background: grad }} title={`${name || ''} Lv ${lvl}`}>
      <span>{monogram}</span>
      <span className="lvl">Lv {lvl}</span>
    </div>
  )
}

// ============ EVENT WEEK ============
function EventWeek({ today = 1 }: { today: number }) {
  const days = [
    { d: 'MON', mul: '150', reward: 'EXP Extra' },
    { d: 'TUE', mul: '300', reward: 'EXP Base' },
    { d: 'WED', mul: '500', reward: 'Drop Item' },
    { d: 'THU', mul: '300', reward: 'EXP Base' },
    { d: 'FRI', mul: '200', reward: 'EXP Extra' },
    { d: 'SAT', mul: '300', reward: 'Drop Item' },
    { d: 'SUN', mul: '4',   reward: 'ดรอป 4 ช่อง', special: true },
  ]
  // today: 0=Sun..6=Sat → MON-first index
  const mondayIndex = today === 0 ? 6 : today - 1
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>ปฏิทินอีเวนต์ประจำสัปดาห์</h2>
          <div className="sub">โบนัส EXP และอัตราดรอปไอเทมประจำวัน</div>
        </div>
      </div>
      <div className="week">
        {days.map((d, i) => (
          <button key={d.d} className={`day-card ${i === mondayIndex ? 'today' : ''}`}>
            {i === mondayIndex && <span className="badge-today">วันนี้</span>}
            <div className="dlbl">{d.d}</div>
            <div className="multiplier">
              {d.special ? <>{d.mul}<span className="pct"> ช่อง</span></> : <>+{d.mul}<span className="pct">%</span></>}
            </div>
            <div className="reward">{d.reward}</div>
          </button>
        ))}
      </div>
    </section>
  )
}

// ============ QUICK ACTIONS ============
function QuickActions({ onCreate, onSoon }: { onCreate: () => void; onSoon: (label: string) => void }) {
  const items: Array<{ ic: string; t: string; d: string; tone: string; action?: () => void }> = [
    { ic: '⊞', t: 'สร้างตัวละครใหม่', d: 'สร้างเพื่อนใหม่ในเซิร์ฟเวอร์', tone: 'a-pink',   action: onCreate },
    { ic: '⚔', t: 'จัดการกิลด์',      d: 'ดูสมาชิก / ตั้งค่ากิลด์',     tone: 'a-violet' },
    { ic: '◫', t: 'ระบบร้านค้า',      d: 'ซื้อขายไอเทมในเกม',           tone: 'a-blue'   },
    { ic: '✎', t: 'ไอเทมโค้ด',        d: 'แลกโค้ดของรางวัล',            tone: 'a-amber'  },
    { ic: '✨', t: 'ระบบตีบวก',       d: 'อัพเกรดอาวุธ/เกราะด้วยหินตีบวก', tone: 'a-mint'   },
    { ic: '∑', t: 'คำนวณค่าบวก',     d: 'ประมาณค่าสถานะเสริม',          tone: 'a-slate'  },
    { ic: '↗', t: 'อัพโหลดรูป',       d: 'อวตารและภาพประจำตัว',         tone: 'a-violet' },
    { ic: '⚠', t: 'แจ้งบัก',          d: 'รายงานปัญหาให้ทีมงาน',        tone: 'a-red'    },
  ]
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>เครื่องมือผู้เล่น</h2>
          <div className="sub">ทางลัดไปยังระบบหลัก</div>
        </div>
      </div>
      <div className="action-grid">
        {items.map((it) => (
          <button
            className={`action-tile ${it.tone}`}
            key={it.t}
            onClick={() => (it.action ? it.action() : onSoon(it.t))}
          >
            <div className="aico">{it.ic}</div>
            <div className="at">{it.t}</div>
            <div className="ad">{it.d}</div>
          </button>
        ))}
      </div>
    </section>
  )
}

// ============ BOARD ============
function Board() {
  const rows = [
    { c: 'q1', i: 'Q', t: 'กิจกรรมแจกหินตีบวก 5 ก้อน/วัน ทุกคน ตอบคำถามสนุก ๆ กับ GM', r: 142, d: '19 พ.ค. 13:17' },
    { c: 'q2', i: 'Q', t: 'รวมจุดสปอนบอสใหม่ในแผนที่ นรกลึก',                              r: 87,  d: '19 พ.ค. 11:02' },
    { c: 'q3', i: 'Q', t: 'ขออธิบายระบบตีบวก +7 ขึ้นไปแบบละเอียดหน่อยครับ',                r: 53,  d: '18 พ.ค. 22:48' },
    { c: 'q4', i: 'Q', t: 'รับซื้อ ดาบเขี้ยว ราคาดี + หินตีบวก 20 ก้อน',                    r: 29,  d: '18 พ.ค. 19:15' },
    { c: 'q1', i: 'Q', t: 'มาแชร์บิลด์อัศวินสวรรค์สายป้องกัน + อาวุธคราฟกันครับ',           r: 18,  d: '18 พ.ค. 14:02' },
  ]
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>เว็บบอร์ดยอดนิยม</h2>
          <div className="sub">หัวข้อที่กำลังได้รับความสนใจมากที่สุดในวันนี้</div>
        </div>
        <a className="more">อ่านทั้งหมด</a>
      </div>
      <div className="card board-list">
        {rows.map((r, i) => (
          <div className="brow" key={i}>
            <div className={`qico ${r.c}`}>{r.i}</div>
            <div className="qtitle">{r.t}</div>
            <span className="reply-count">{r.r} ตอบ</span>
            <span className="qmeta">{r.d}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ============ FOOTER ============
function Footer({ now }: { now: Date }) {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="links">
          <a>นโยบายความเป็นส่วนตัว</a>
          <a>เงื่อนไขการใช้งาน</a>
          <a>ติดต่อ GM</a>
          <a>รายงานปัญหา</a>
        </div>
        <div className="meta">© 2026 อสูรเว็บ Online · เกมตัวอย่างต้นฉบับ · {now.toLocaleDateString('th-TH')}</div>
      </div>
    </footer>
  )
}
