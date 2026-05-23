# อสูรเว็บ Online — แผนพัฒนาต่อ

เอกสารนี้สรุปสถานะปัจจุบันของโปรเจกต์ และโรดแมปต่อจากนี้ ใช้เป็น handoff สำหรับให้ Claude Code (หรือคนอื่น) ทำงานต่อได้ทันที

> **บริบท**: เกม MMORPG เล่นบนเว็บ ได้แรงบันดาลใจจากเกมเว็บไทยยุคเก่า (turn-based encounter, เดินแมพ, อาชีพ/เผ่า, คราฟ, ตีบวก) UI สไตล์ kawaii pastel
> ทุกอย่างเป็นโค้ดและกราฟิก (emoji-based) ที่สร้างขึ้นใหม่ ไม่ได้คัดลอกแอสเซ็ตของเกมต้นแบบ

---

## 1. สถานะปัจจุบัน (Beta 0.2)

### Tech stack ที่ใช้แล้ว
- **Vite 5** + **React 18** + **TypeScript 5** — UI shell
- **Phaser 3.80** — render แผนที่ + sprite + animation
- **Tailwind CSS 3.4** — styling (theme kawaii pastel)
- **Zustand 4** + persist middleware — state + localStorage save
- ไม่มี backend (single-player, ข้อมูลอยู่ใน localStorage)

### ฟีเจอร์ที่ทำเสร็จแล้ว
- หน้า Title + Create Character (เลือก 6 เผ่า × 6 อาชีพ)
- เดินแมพแบบ grid (Phaser scene) ด้วยลูกศร/WASD
- เดินชนมอน → เข้าฉากต่อสู้แบบเทิร์น (โจมตี/สกิล/ไอเทม/หนี)
- ระบบ Warp (🌀) — เดินชนวาปเปลี่ยนแมพอัตโนมัติ
- 5 แมพต่อเนื่องกัน: หมู่บ้าน → ทุ่งซากุระ → ป่าเร้นลับ → ภูเขาไฟ → นรกลึก
- ระบบเลเวล/EXP/ทอง พร้อมเลเวลอัพ
- กระเป๋า มี tabs (ทั่วไป/สวมใส่/ใช้งาน/แร่ธาตุ) สวม/ถอด/ใช้ ไอเทม
- คราฟ — รวมวัตถุดิบ + ทอง → อาวุธ/เกราะ (จำกัดอาชีพ)
- ตีบวก +1 ถึง +10 ใช้ 💠 หินตีบวก โอกาสสำเร็จลดตามระดับ
- เปลี่ยนอาชีพ (500 ทอง)
- ร้านค้า/หมอประจำหมู่บ้าน (ฟื้น HP/MP, ซื้อยา, ซื้อหินตีบวก)
- ดรอปไอเทมจากมอน + ดรอปหินตีบวกแบบสุ่ม
- ระบบแชท (พิมพ์ส่งได้, รวมระบบ log)
- เซฟ/โหลดเกมด้วย localStorage
- HUD เลย์เอาท์: top bar + map + side panel + chat (สไตล์ kawaii pastel)

### ปัญหา/ข้อจำกัดที่ยังเหลือ
- Sprite ทุกอย่างเป็น emoji (ตัวละคร/มอน/วัตถุดิบ) — ไม่ดูเป็นเกมจริง
- ไม่มี sound / music
- การต่อสู้เป็น React DOM (ไม่ได้ใช้ Phaser scene) — สไตล์ animation จำกัด
- ยังไม่มี backend → ข้อมูลหายถ้าเคลียร์ browser storage
- ไม่มี multiplayer
- ดีไซน์ปุ่ม responsive ยังไม่สมบูรณ์บน mobile

---

## 2. โครงสร้างโปรเจกต์

```
demo_clone/
├── package.json
├── vite.config.ts          # Vite + React plugin, alias @/* → src/*
├── tsconfig.json           # strict TS
├── tailwind.config.js      # kawaii palette (kw-* tokens)
├── postcss.config.js
├── index.html              # entry, โหลด Google Font Kanit
├── legacy/
│   └── index.html          # เวอร์ชันเดิม single-file (เก็บอ้างอิง)
├── src/
│   ├── main.tsx            # React entry — ปิด StrictMode (Phaser ไม่ชอบ)
│   ├── App.tsx             # screen routing + global keyboard handler
│   ├── index.css           # tailwind + global components (.btn, .panel, .bar...)
│   ├── game/
│   │   ├── types.ts        # TypeScript types (GameState, Race, Class, MapDef, etc.)
│   │   ├── data.ts         # ค่าคงที่: RACES, CLASSES, ITEMS, MAPS, RECIPES, expForLv()
│   │   ├── store.ts        # Zustand store (state + actions + persist localStorage)
│   │   ├── PhaserGame.tsx  # React wrapper สำหรับ Phaser game instance
│   │   └── scenes/
│   │       └── MapScene.ts # Phaser scene — render tile + warp + monster + player
│   └── ui/
│       ├── TitleScreen.tsx
│       ├── CreateScreen.tsx
│       ├── GameScreen.tsx  # HUD + Phaser map + chat
│       ├── BattleScreen.tsx # ฉากต่อสู้ (React, ไม่ใช่ Phaser)
│       ├── ChatPanel.tsx
│       ├── Modal.tsx       # modal wrapper
│       └── modals/
│           ├── InventoryModal.tsx
│           ├── CraftModal.tsx
│           ├── EnhanceModal.tsx
│           ├── ClassChangeModal.tsx
│           ├── ShopModal.tsx
│           └── HelpModal.tsx
└── PLAN.md                 # เอกสารนี้
```

### Convention ที่ใช้

- **State** อยู่ใน Zustand store เดียว (`src/game/store.ts`) แยกเป็น `game` (persistent) กับ UI state (`screen`, `modal`, `battle`, `monsters`, `chat`)
- **persist middleware** บันทึกเฉพาะ `game` ลง `localStorage` key `asura_online_save_v1`
- **Phaser ↔ React communication** ผ่าน Zustand store เท่านั้น (Phaser subscribe store, แก้ state เรียก action ในนั้น)
- **Keyboard** จัดการที่ window level ใน `App.tsx` (ไม่ใช้ Phaser keyboard plugin — เลี่ยงปัญหา canvas focus)
- **Component naming** PascalCase, ไฟล์ตรงกับชื่อ default export
- **Style** ใช้ tailwind utility + custom classes ใน `index.css` (`.btn`, `.panel`, `.bar`, `.option-card`, `.inv-slot`, `.chat-bubble` ฯลฯ)
- **สี theme**: `kw-cream`, `kw-sky`, `kw-blue-deep`, `kw-orange`, `kw-hp`, `kw-mp`, `kw-exp`, `kw-text`, `kw-border` (ดู `tailwind.config.js`)

### Data shape สำคัญ (ดู `src/game/types.ts`)

```ts
GameState   = { name, raceId, classId, lv, exp, hp/maxHp, mp/maxMp,
                atk, def, spd, gold, inventory, equipWeapon, equipArmor,
                plus, map, px, py, steps }
Race        = { id, name, emoji, hp, mp, atk, def, spd, desc }
CharClass   = { id, name, emoji, atk, def, spd, mp, skill:{ name, mp, mult, type } }
ItemDef     = { name, emoji, type:'mat'|'consume'|'weapon'|'armor', atk?, def?, heal?, healMp?, desc }
MapDef      = { id, name, minLv, maxLv, tiles[], bg, pathColor?,
                monsters[], warps:[{x,y,to,tx,ty,label}], w, h, monsterCount }
BattleEnemy = { name, emoji, lv, maxHp, hp, atk, def, spd, exp, gold, drop? }
ChatMessage = { id, avatar, speaker, text, time, kind? }
```

### Save format
- Key: `asura_online_save_v1`
- Value: JSON ของ `GameState` เท่านั้น (UI state ไม่ถูกบันทึก)

---

## 3. ขั้นตอนถัดไป (Phased)

### Phase 1 — Polish single-player (1-2 สัปดาห์)

เป้าหมาย: ทำให้เกมดูเป็นเกมจริง ก่อนคิดเรื่อง backend/multiplayer

**A. เปลี่ยน emoji เป็น real sprite**
- ใช้แอสเซ็ตฟรี เช่น
  - [Kenney 1-Bit Pack](https://kenney.nl/assets/1-bit-pack) — pixel art ฟรี, license CC0
  - [OpenGameArt RPG Battler](https://opengameart.org) — character/monster sprites
  - [Mana Seed Character Base](https://seliel-the-shaper.itch.io/) (สำหรับ char sprite)
- วิธีทำ:
  1. โหลดแอสเซ็ตใส่ `public/assets/` (เช่น `public/assets/characters/berserk.png`, `public/assets/monsters/wolf.png`)
  2. ใน `MapScene.preload()` โหลดด้วย `this.load.image('berserk', '/assets/characters/berserk.png')`
  3. เปลี่ยน `this.add.text(..., emoji)` เป็น `this.add.sprite(..., 'berserk')`
  4. เพิ่ม spritesheet animation สำหรับเดิน (walk_down/up/left/right) — ใช้ `this.load.spritesheet()` + `this.anims.create()`
- ไฟล์ที่ต้องแก้: `src/game/scenes/MapScene.ts`, `src/game/data.ts` (เพิ่ม field `sprite` ใน Race/Monster), `src/ui/BattleScreen.tsx` (ถ้าจะใช้ sprite ในฉากต่อสู้ด้วย)

**B. ใช้ Tiled map editor**
- ติดตั้ง [Tiled](https://www.mapeditor.org/) ฟรี
- ออกแบบแมพ 14×11 ใส่ tileset แล้ว export เป็น `.json` + `.png`
- ใน Phaser scene โหลดด้วย `this.load.tilemapTiledJSON()` + `this.load.image()`
- สร้าง object layer สำหรับ warp/monster spawn point
- ทำให้แมพดูเหมือนเกมจริง ไม่ใช่ checker pattern

**C. ย้ายฉากต่อสู้เข้า Phaser**
- สร้าง `BattleScene.ts` ใหม่
- ใช้ tween + particle สำหรับ effect (slash, magic, hit flash)
- ใส่ sprite animation ของ attack/skill
- React UI ครอบ HUD แต่ฉากตัวละครเป็น Phaser

**D. เพิ่ม sound + music**
- ใช้ Phaser sound (Howler.js หรือ built-in WebAudio)
- BGM ต่อแมพ + SFX โจมตี/สกิล/UI click/level up
- แหล่งฟรี: [freesound.org](https://freesound.org), [opengameart.org/art-search-advanced?field_art_type_tid%5B%5D=12](audio section)

**E. Pet/Mount system (ตามแบบเกมเว็บคลาสสิก)**
- เพิ่ม `pet?: { id, name, sprite, level }` ใน `GameState`
- Pet เดินตามตัวละครบนแมพ
- Pet ช่วยโจมตีในฉากต่อสู้ (เพิ่ม atk bonus)
- เพิ่มร้านขายเพ็ท / เควสปลดล็อค

### Phase 2 — Backend MVP (2-3 สัปดาห์)

เป้าหมาย: ย้ายข้อมูลจาก localStorage ไปเก็บใน Postgres เพื่อเป็นพื้นฐานสำหรับ multiplayer

**Tech stack**
- **Node 22 + TypeScript + Fastify** (เลือก Fastify มากกว่า Express เพราะเร็วและ TS-friendly)
- **PostgreSQL 16** + **Prisma 5** (ORM ที่ type-safe)
- **Zod** ตรวจ input
- **JWT** สำหรับ auth (เก็บ secret ใน .env)
- **Bcrypt** hash password

**โครงสร้างที่แนะนำ**
```
demo_clone/
├── client/              # ย้าย src/ เดิมมาไว้ที่นี่
├── server/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── index.ts          # Fastify bootstrap
│   │   ├── plugins/
│   │   │   ├── auth.ts       # JWT plugin
│   │   │   └── prisma.ts     # Prisma instance
│   │   ├── routes/
│   │   │   ├── auth.ts       # POST /register, POST /login
│   │   │   ├── character.ts  # GET/PUT /character
│   │   │   ├── inventory.ts  # POST /inventory/equip etc.
│   │   │   ├── battle.ts     # POST /battle/start, /battle/action
│   │   │   ├── craft.ts      # POST /craft
│   │   │   └── enhance.ts    # POST /enhance
│   │   └── lib/
│   │       └── combat.ts     # damage calc, drop logic (server-authoritative)
│   ├── package.json
│   └── tsconfig.json
└── docker-compose.yml   # postgres + redis + adminer
```

**Prisma schema เริ่มต้น**
```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model User {
  id        String   @id @default(cuid())
  username  String   @unique
  password  String   // bcrypt hash
  email     String?  @unique
  createdAt DateTime @default(now())
  characters Character[]
}

model Character {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  name      String
  raceId    String
  classId   String
  lv        Int      @default(1)
  exp       Int      @default(0)
  hp        Int
  maxHp     Int
  mp        Int
  maxMp     Int
  atk       Int
  def       Int
  spd       Int
  gold      Int      @default(100)
  mapId     String   @default("village")
  px        Int      @default(5)
  py        Int      @default(5)
  equipWeapon String?
  equipArmor  String?
  plus      Json     // { "sword-1_w": 5, ... }
  inventory InventoryItem[]
  updatedAt DateTime @updatedAt
}

model InventoryItem {
  id          String    @id @default(cuid())
  characterId String
  character   Character @relation(fields: [characterId], references: [id])
  itemKey     String    // เช่น 'potion-s', 'sword-1'
  qty         Int

  @@unique([characterId, itemKey])
}

model BattleLog {
  id          String   @id @default(cuid())
  characterId String
  enemyName   String
  result      String   // 'win' | 'lose' | 'flee'
  expGained   Int
  goldGained  Int
  itemsDropped String[] // ['silk', ...]
  createdAt   DateTime @default(now())
}
```

**API endpoints แนะนำ**
```
POST   /api/auth/register     { username, password, email? }
POST   /api/auth/login        { username, password } → { token }
GET    /api/character         (auth) → Character
PUT    /api/character/move    { px, py }
POST   /api/character/warp    { to }
GET    /api/inventory
POST   /api/inventory/equip   { itemKey }
POST   /api/inventory/use     { itemKey }
POST   /api/craft             { resultKey }
POST   /api/enhance           { itemKey, slot }
POST   /api/battle/start      { mapId, monsterIdx } → { battleId, enemy }
POST   /api/battle/action     { battleId, action: 'atk'|'skill'|'item'|'run' }
POST   /api/shop/buy          { itemKey, qty }
POST   /api/save              (debug, force flush)
```

**สำคัญ — server authoritative**
- ค่า damage, drop rate, ตีบวก success, EXP ทั้งหมดคำนวณ ฝั่ง server เท่านั้น
- Client ส่ง intent (เช่น "ขอโจมตี") ไม่ส่ง damage
- ใส่ rate-limit (ป้องกัน spam click)

**Migration ฝั่ง client**
- เปลี่ยน Zustand actions เป็น call API
- ใช้ React Query หรือ SWR สำหรับ cache + revalidation
- ลบ persist middleware ออก (server เก็บแล้ว)
- เพิ่มหน้า login/register

### Phase 2 — Slice 47-49 (per-instance gear + Blacksmith)

ที่มา: grilling session 2026-05-23. ปัญหาราก: inventory stack ตาม `(characterId, itemKey)` + Plus เก็บที่ `Character.plus[itemKey+slot]` → ดาบ 2 เล่ม +ต่างกันไม่ได้, admin ตี+ ผ่าน JSON blob แล้ว `atk/def` ไม่ขยับ. รายละเอียดสถาปัตยกรรม + รากเหตุผล: [ADR 0003](./docs/adr/0003-per-instance-identity-for-gear-inventory.md). คำศัพท์ใหม่ (Inventory Item, Plus, Enhance, Blacksmith): [CONTEXT.md](./CONTEXT.md)

#### Slice 47 — Per-instance gear core

- Prisma migration (destructive, reseed): drop `(characterId, itemKey)` unique, add `InventoryItem.id` PK + `plus Int @default(0)`, drop `Character.plus` JSON, change `Character.equipWeapon/equipArmor` → FK to `InventoryItem.id` (ON DELETE SET NULL)
- Server helpers: `addItem(itemKey, qty)` รู้ stack policy จาก ItemType (weapon/armor INSERT แถวใหม่ qty=1, mat/consume bump existing)
- Intent endpoints: `POST /equip` และ `POST /enhance` body เปลี่ยนจาก `{itemKey, slot}` → `{inventoryItemId}` (slot derive จาก `ItemDef.type`). Battle drop / shop buy / craft result: weapon/armor → INSERT แถวใหม่
- Client store: `game.inventory` เปลี่ยน shape จาก `Record<itemKey, qty>` → `InventoryItem[]` (มี id, itemKey, qty, plus). API client + every reader update
- InventoryModal: render แยก row ต่อ weapon/armor instance, badge `+N` มุมบนซ้าย (เฉพาะ N>0), group by itemKey ก่อน sort by plus DESC, mat/consume คงเดิม. EnhanceModal เดิมยังเปิดจาก HUD แต่ operate ด้วย id

#### Slice 48 — Blacksmith NPC + ceremony ✅ shipped 2026-05-23

ดู [vault/wiki/slices/slice-48-blacksmith-ceremony.md](vault/wiki/slices/slice-48-blacksmith-ceremony.md) สำหรับรายละเอียดเต็ม

- ✓ `NpcKind = 'blacksmith'` (migration `20260523120000_slice_48_blacksmith_npc_kind`)
- ✓ Seed: `village-blacksmith` ที่ (6,3) ใน village, emoji 🛠️
- ✓ BlacksmithModal เปิดจาก tile interaction; list unequipped weapon/armor; แสดง `+N / 💠 cost / 💰 cost / success%`
- ✓ Gold fee: `enhanceGoldCost(cur) = 100 * (cur + 1)` (pure helper ใน shared/logic/enhance.ts)
- ✓ POST /enhance: รับ `npcId`, reject equipped (409 'item is equipped'), reject NPC ผิด kind/map (404), หัก gold+stone atomic
- ✓ HUD enhance button ลบแล้ว; `EnhanceModal.tsx` ลบทิ้ง; ModalType `enhance` → `blacksmith`
- ✓ Tests: shared 78/78, server 125/125 (+4 slice 48 cases)

#### Slice 49 — Admin Set-Plus + re-derive bug fix ✅ shipped 2026-05-23

ดู [vault/wiki/slices/slice-49-admin-set-plus.md](vault/wiki/slices/slice-49-admin-set-plus.md) สำหรับรายละเอียดเต็ม

- ✓ `POST /api/admin/inventory/:itemId/set-plus` body `{plus: 0..10}` — atomic update + re-derive owner + audit `inventory.set-plus`
- ✓ AdminCharEditor: ลบ JSON textareas, มี `CharacterInventoryEditor` table พร้อม per-row Plus `<select>` 0..10 (เฉพาะ weapon/armor)
- ✓ Admin PUT `/api/admin/characters/:id`: re-derive defense-in-depth เมื่อ str/int/dex/agi/luk/vit/lv/raceId/classId เปลี่ยน
- ✓ Tests: shared 78/78 (unchanged); server 131/131 (+6 slice 49: 5 set-plus + 1 re-derive defense)

**Bug "admin ตี+ ไม่เห็นเปลี่ยน" ตายตามขั้นตอน Slice 47-49 รวมกัน** — เหลือเพียง 2 write paths (Blacksmith intent / admin Set-Plus intent) ทั้งคู่ re-derive ใน $transaction

**Add Item flow ยังไม่ทำ** — queued เป็น "Admin Inventory v2" (slice ใหม่ภายหลัง)

ตัดสินใจที่ยังไม่เคาะ: gold fee scaling formula ตัวจริง (ตอนนี้ใช้ `100 * (cur+1)` — ต้อง playtest), placement ของ blacksmith NPC เพิ่มเติมในเมืองอื่น



เป้าหมาย: เห็นผู้เล่นคนอื่นเดินบนแมพ + chat realtime

**ตัวเลือก WebSocket framework**
- **Colyseus** — game server framework โดยเฉพาะ มี room/state sync built-in ดีสุดสำหรับ MMO เล็ก-กลาง
- **Socket.IO** — ง่ายและ flexible แต่ต้องเขียน state sync เอง

แนะนำ **Colyseus** สำหรับโปรเจกต์นี้

**โครงสร้าง Colyseus**
```ts
// server/src/rooms/MapRoom.ts
import { Room, Client } from 'colyseus'
import { Schema, MapSchema, type } from '@colyseus/schema'

class PlayerState extends Schema {
  @type('string') name: string
  @type('string') raceId: string
  @type('string') classId: string
  @type('number') px: number
  @type('number') py: number
  @type('number') lv: number
}

class MapState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>()
}

export class MapRoom extends Room<MapState> {
  onCreate() {
    this.setState(new MapState())
    this.onMessage('move', (client, msg) => {
      const p = this.state.players.get(client.sessionId)
      if (!p) return
      p.px = msg.px
      p.py = msg.py
    })
  }
  onJoin(client: Client, options: { token: string }) {
    // verify JWT, load character from DB
    // add to state
  }
  onLeave(client: Client) {
    this.state.players.delete(client.sessionId)
  }
}
```

**Room แยกตามแมพ**
- 1 room ต่อ map id (`village`, `sakura`, ...)
- Player join room เมื่อ warp เข้า, leave เมื่อ warp ออก
- Battle เป็นแบบ private (เห็นแค่ผู้เล่นคนนั้น) ไม่ broadcast

**Client integration**
- `npm install colyseus.js`
- `const client = new Colyseus.Client('ws://localhost:2567')`
- `room.state.players.onAdd(...)` → spawn sprite ผู้เล่นอื่นใน Phaser
- `room.send('move', { px, py })` ตอนเดิน
- Chat broadcast เป็น room-wide message

**Anti-cheat**
- Server validate ทุก movement (ระยะทาง, cooldown)
- Server เป็นคน trigger battle ไม่ใช่ client
- ใส่ heartbeat + auto-kick ถ้า idle เกิน 5 นาที

### Phase 4 — Production deploy (1 สัปดาห์)

**Docker compose สำหรับ dev**
```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: asura
      POSTGRES_USER: asura
      POSTGRES_PASSWORD: dev
    ports: ['5432:5432']
    volumes: [pgdata:/var/lib/postgresql/data]
  redis:
    image: redis:7-alpine
    ports: ['6379:6379']
  adminer:
    image: adminer
    ports: ['8080:8080']
volumes:
  pgdata:
```

**Production Dockerfile (server)**
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
CMD ["node", "dist/index.js"]
```

**แนะนำสำหรับ deploy**
- **Frontend (client)**: Cloudflare Pages / Vercel / Netlify — ฟรี และ deploy จาก git ได้เลย
- **Backend (game server)**: Fly.io (มี free tier, รองรับ WebSocket ดี), Railway, Render
- **Database**: Neon (Postgres serverless ฟรี 0.5 GB), Supabase, Railway PG
- **Redis**: Upstash (serverless free tier)
- ตั้ง CORS ให้ frontend domain ยิง API ได้

### Phase 5 — Quality of life / Endgame content

- ระบบ Quest (NPC ในหมู่บ้าน, เควสล่ามอน, รางวัล)
- ระบบ Guild (สร้าง/สมัคร/กล่องข้อความ)
- PvP arena (1v1)
- Trade / market (ตลาดของผู้เล่น)
- Boss event ตามเวลา (จอมมารโผล่นาทีที่ 0 ทุกชั่วโมง)
- Leaderboard
- Daily login reward
- ระบบรู (gem socket) — ฝังอัญมณีในอาวุธเพิ่ม stat

---

## 4. งานเร่งด่วน / Tech debt

จัดเรียงตามความสำคัญ (สูง → ต่ำ):

1. **เพิ่ม sprite จริง** — emoji ไม่เข้ากับ kawaii UI ดูแปลก
2. **Battle scene เข้า Phaser** — animation/effect จะดูดีขึ้นเยอะ
3. **เพิ่ม sound effects** — ครั้งเดียวก็เห็นความต่าง
4. **NPC + Quest บนแมพ** — ตอนนี้แมพมีแต่มอน
5. **Tutorial guide** — ผู้เล่นใหม่งงว่าจะทำอะไร
6. **Mobile touch controls** — ตอนนี้เล่นไม่ได้บนมือถือ (D-pad บนจอ)
7. **Status conditions** — ติดพิษ, มึนงง, นอนหลับ
8. **Element/ธาตุ** — ไฟ น้ำ ลม ดิน แสง มืด (มอนเสริมจุดอ่อน)
9. **Skill tree** — แต่ละอาชีพมีหลายสกิล ไม่ใช่อันเดียว
10. **i18n** — แยกข้อความออกจาก JSX (กรณีจะทำหลายภาษา)

---

## 5. คำสั่งและสภาพแวดล้อมที่ใช้

```bash
# Dev (Windows PowerShell ต้องใช้ npm.cmd หรือ Set-ExecutionPolicy RemoteSigned)
npm install
npm run dev      # → http://localhost:5173
npm run build    # production build → dist/
npm run preview  # preview production build

# (Phase 2+)
docker compose up -d     # start Postgres + Redis
npx prisma migrate dev   # apply DB migrations
npx prisma studio        # web UI for DB inspection
```

### Environment variables ที่ต้องมี (Phase 2+)
```
# server/.env
DATABASE_URL=postgresql://asura:dev@localhost:5432/asura
JWT_SECRET=<random-32-byte-base64>
REDIS_URL=redis://localhost:6379
PORT=3000

# client/.env
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:2567
```

---

## 6. หลักสำคัญที่ควรรักษา

- **Game data เป็น single source of truth** — แก้ที่ `data.ts` ที่เดียว ทั้ง UI และ logic อ่านจากนั้น
- **ทุก state mutation ผ่าน Zustand action** อย่า `setState` กระจัดกระจาย
- **Phaser scene อ่าน state ผ่าน `useGame.getState()`** ไม่เก็บ state ของตัวเอง (ยกเว้น render cache)
- **ทุก action ที่กระทบเงิน/ไอเทมต้องผ่าน store** — `spendGold`, `addItem`, `removeItem`, `useConsume`
- **เมื่อย้ายไป backend** logic การคำนวณ damage/drop/enhance ต้องย้ายไป server ทั้งหมด
- **ไม่ใช้ React.StrictMode ใน dev** — Phaser ไม่ทำงานกับ double-mount

---

## 7. แหล่งอ้างอิงและแอสเซ็ตฟรี

- **Sprite/Tileset**:
  - [Kenney.nl](https://kenney.nl) — CC0 รวมหลายสไตล์
  - [itch.io free game assets](https://itch.io/game-assets/free)
  - [OpenGameArt.org](https://opengameart.org)
- **เครื่องมือ**:
  - [Tiled](https://www.mapeditor.org/) — map editor
  - [Aseprite](https://www.aseprite.org/) — pixel art ($20)
  - [Piskel](https://www.piskelapp.com/) — pixel art ฟรีบนเว็บ
- **Font ไทย**:
  - [Google Fonts Kanit](https://fonts.google.com/specimen/Kanit) (ใช้อยู่)
  - [Google Fonts Mali](https://fonts.google.com/specimen/Mali) — เหมาะกับสไตล์ kawaii
- **Sound**:
  - [freesound.org](https://freesound.org) — CC-licensed SFX
  - [opengameart.org/art-search-advanced](https://opengameart.org) — BGM

---

## 8. คำแนะนำสุดท้ายสำหรับ Claude Code

- ก่อนทำงาน อ่าน `src/game/types.ts` และ `src/game/data.ts` ให้เข้าใจ shape ก่อน
- ก่อนเพิ่ม feature ใหม่ ตรวจ Zustand store ว่ามี action ที่ใช้ซ้ำได้ไหม
- ก่อนแก้ Phaser scene ตรวจ subscribe lifecycle — อย่าลืม unsubscribe
- เวลาทดสอบ ลบ `localStorage` key `asura_online_save_v1` เพื่อรีเซ็ตเซฟ
- เปิด DevTools (F12) → Console เสมอ มี log จาก Phaser / Zustand
- รัน `npm run build` ดูว่า TS pass ก่อน commit
- ถ้าจะทำ Phase 2 (backend) แยก folder `client/` กับ `server/` ให้ชัด ใช้ pnpm workspace ก็สวย

ขอให้สนุกกับการพัฒนาต่อครับ 🎮
