# อสูรเว็บ Online — Claude Code Instructions

เอกสารนี้เป็นคู่มือให้ Claude Code ทำงานในโปรเจกต์นี้ อ่านก่อนแก้ทุกครั้ง

## โปรเจกต์คืออะไร

เกม MMORPG บนเว็บ สไตล์เกมเว็บไทยยุค 2000s (kawaii pastel, turn-based encounter, เดินแมพ, อาชีพ/เผ่า, คราฟ, ตีบวก)

ตอนนี้อยู่ **Phase 2 — Backend MVP** บน branch `phase-2-backend` ดู [PLAN.md](PLAN.md) สำหรับโรดแมปเต็ม และ [CONTEXT.md](CONTEXT.md) สำหรับ glossary คำศัพท์ที่ใช้ทั่วโปรเจกต์ (Portal, Character Creation, Screen, Pre-game, In-game)

## โครงสร้าง — npm workspaces monorepo

```
demo_clone/
├── shared/   @asura/shared  — types + data + pure logic (single source of truth)
├── client/   @asura/client  — Vite + React 18 + Phaser 3 + Zustand + Tailwind
├── server/   @asura/server  — Fastify + Prisma + Postgres + JWT
├── vault/    Obsidian wiki (แยกจากโค้ดเกม — อย่าปนกัน)
└── legacy/   เวอร์ชัน single-file เก่า อ้างอิงเท่านั้น
```

- [shared/src/types.ts](shared/src/types.ts), [shared/src/data.ts](shared/src/data.ts) — types และ game data ที่ทั้ง client/server ใช้
- [shared/src/logic/](shared/src/logic/) — pure logic ที่ฉีด RNG เข้ามา (combat, stats, progression, enhance) **server-authoritative**
- [client/src/ui/](client/src/ui/) — React screens + modals
- [client/src/game/](client/src/game/) — Zustand store + Phaser scenes
- [server/src/routes/](server/src/routes/), [server/src/plugins/](server/src/plugins/), [server/src/lib/](server/src/lib/)

## คำสั่ง

```bash
npm install
npm run dev:client     # Vite → http://localhost:5173
npm run dev:server     # Fastify → http://localhost:3000
npm run build          # build ทั้ง client + server
npm test               # รัน test ทั้ง shared + client + server
```

ตั้ง Postgres ผ่าน `docker compose up -d` ก่อน server start

## หลักการทำงานที่ต้องยึด

### 1. ห้ามมโน (No fabrication)
- ถ้าไม่รู้ว่ามีฟังก์ชัน/ไฟล์/API อยู่จริงไหม → ใช้ Read/Grep/Glob ตรวจก่อน อย่าเดา
- ถ้าไม่แน่ใจ requirement → **ถาม** อย่าไปต่อเอง
- ถ้าจำเป็นต้องหาความรู้นอกโปรเจกต์ (เช่น Fastify, Prisma, Phaser, React API) **research ได้** — ใช้ WebSearch/WebFetch หรืออ่าน docs ก่อนเขียนโค้ด
- อย่าอ้างอิง memory/หรือบทสนทนาเก่า โดยไม่ได้ verify state ปัจจุบันก่อน

### 2. ต้องเขียน test ทุกครั้งที่ทำ function ใหม่
- **shared/logic/**: pure logic ทุกตัวต้องมี unit test คู่กัน (ดู [shared/src/logic/combat.test.ts](shared/src/logic/combat.test.ts) เป็นตัวอย่าง)
- **server/routes/**: endpoint ใหม่เขียน integration test ผ่าน `app.inject` ก่อน implement handler (TDD red-green)
- **client/**: logic ที่ซับซ้อน (selector, derived state, helper) ต้องมี test; component test เน้นเฉพาะ behavior สำคัญ
- รัน `npm test` ก่อน commit ทุกครั้ง — fail = ยังไม่จบ

### 3. ใช้ shared component / shared logic — ห้ามสร้างซ้ำ
- **ก่อนเขียน component ใหม่** ตรวจ [client/src/ui/](client/src/ui/) และ [client/src/ui/modals/](client/src/ui/modals/) ก่อน
  - มี `Modal.tsx` wrapper ใช้แล้ว → ใช้ตัวนี้ อย่าทำ modal เอง
  - utility classes ใน [client/src/index.css](client/src/index.css) (`.btn`, `.panel`, `.bar`, `.option-card`, `.inv-slot`, `.chat-bubble`) → ใช้ก่อนเขียน Tailwind ซ้ำ
- **ก่อนเขียน game logic ใหม่** ตรวจ [shared/src/logic/](shared/src/logic/) ก่อน — ถ้ามีอยู่แล้ว `import` มาใช้ ห้าม copy/รีไรท์
- **types และ data**: ใช้จาก `@asura/shared` เท่านั้น ห้าม redefine ใน client หรือ server
- ถ้าจำเป็นต้องมี variant ของ component เดิม → extend prop ตัวเก่า ไม่ใช่สร้างไฟล์ใหม่
- ถ้าเจอ logic/style ซ้ำกัน 2 ที่ → extract ไปที่ shared แล้วเรียกใช้

### 4. Style การเขียน component
- **PascalCase** ชื่อไฟล์ตรงกับ default export
- **Functional component + hook** ห้าม class component
- **State ผ่าน Zustand store เดียว** ([client/src/game/store.ts](client/src/game/store.ts)) — อย่ากระจาย `useState` ในส่วนที่กระทบเงิน/ไอเทม/ตัวละคร
- **Phaser ↔ React คุยกันผ่าน Zustand เท่านั้น** — Phaser subscribe store, แก้ state เรียก action ในนั้น
- **อย่าใช้ React.StrictMode** — Phaser ไม่ทำงานกับ double-mount
- **Tailwind utility ก่อน** — ถ้า utility คลาสซ้ำ ๆ ในหลายที่ค่อย extract เป็น class ใน `index.css`
- **kawaii palette tokens**: ใช้ `kw-*` จาก `tailwind.config.js` (`kw-cream`, `kw-sky`, `kw-blue-deep`, `kw-orange`, `kw-hp`, `kw-mp`, `kw-exp`, `kw-text`, `kw-border`) อย่า hardcode hex
- **Action ที่กระทบเงิน/ไอเทม/stat** ต้องผ่าน store action (`spendGold`, `addItem`, `removeItem`, `useConsume`) ห้าม mutate ตรง ๆ

### 5. Server authoritative
- Logic การคำนวณ damage, drop rate, ตีบวก success, EXP — **คำนวณฝั่ง server เท่านั้น**
- Client ส่ง intent ("ขอโจมตี") ไม่ส่งค่า damage
- Server route ใช้ pure rule จาก `@asura/shared` (`resolveAttack`, `scaleEnemy`, `rollLoot`, `applyExp`, `resolveEnhance`)
- ทุก write ที่เกี่ยวกับ gold/inventory ใช้ Prisma transaction atomic

### 6. Workflow
- ทำเป็น **vertical slice แบบ TDD** — test ก่อน, code หลัง, commit ต่อ slice (ดู memory `phase-2-backend-plan`)
- ก่อน commit: `npm run build` + `npm test` ต้องผ่าน
- ก่อนแก้ Phaser scene ตรวจ subscribe lifecycle — อย่าลืม unsubscribe
- ถ้า task ใหญ่หลายขั้น → ใช้ TodoWrite track ความคืบหน้า

### 7. Obsidian wiki — read first, log after

Wiki vault อยู่ที่ [vault/wiki/](vault/wiki/) เป็น single source of truth สำหรับ project knowledge ข้ามเซสชัน

**ก่อนเริ่มงานทุกครั้ง (read):**

1. อ่าน [vault/wiki/hot.md](vault/wiki/hot.md) ก่อน — ~500 คำ รวมสถานะปัจจุบัน
2. ถ้าไม่พอ อ่าน [vault/wiki/index.md](vault/wiki/index.md) — master catalog
3. drill ลึกตามต้องการใน `vault/wiki/<folder>/` (decisions, slices, modules, flows, concepts, …)
4. คำตอบที่อ่านได้ใน wiki — อย่า grep โค้ดซ้ำ

**หลังทำงานที่มีนัยสำคัญ (write):**

- เสร็จ slice / แก้บั๊กราก / grilling decision / ADR ใหม่ / port logic → **append entry ใน [vault/wiki/log.md](vault/wiki/log.md) (newest บนสุด)** + อัพ/สร้างหน้าใน folder ที่เหมาะ
- ใช้ skill `claude-obsidian:save` สำหรับ save บทสนทนา/insight, `claude-obsidian:wiki-ingest` สำหรับเอกสารใน `.raw/`
- frontmatter ใช้ flat YAML (type/title/status/created/updated/tags) wikilink เป็น `[[ชื่อไฟล์]]` (ไม่ใส่ path)

**Sync กับ docs ใน repo root:**

- `CONTEXT.md` (glossary) และ `docs/adr/` ยังเป็น source ของ project — wiki เป็น navigation layer ที่ link ออกไป
- เปลี่ยน ADR / glossary ครั้งใหญ่ → อัพ `vault/wiki/decisions/` หรือ `vault/wiki/concepts/` ที่ชี้กลับมาด้วย

## สิ่งที่ห้ามทำ
- ห้ามสร้าง component/logic ซ้ำกับที่มีอยู่ใน shared หรือ ui/
- ห้าม commit โค้ดที่ไม่มี test รองรับ (สำหรับ function ใหม่)
- ห้ามใส่ค่า damage/drop/enhance success ฝั่ง client
- ห้ามแก้ไฟล์ใน `legacy/`
- ห้ามแก้ไฟล์ใน `vault/.raw/` (source documents)
- ห้าม commit ถ้า user ไม่ได้บอกให้ commit
- ห้ามข้าม wiki — เริ่มงานต้องอ่าน hot.md/index.md ก่อน, เสร็จงานต้อง log

## ถ้าไม่แน่ใจ
ถามก่อน อย่าเดา การ research จาก docs/web ทำได้และส่งเสริมให้ทำเพื่อความแม่นยำ
