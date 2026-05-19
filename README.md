# อสูรเว็บ Online

เกม MMORPG เล่นบนเว็บ สไตล์เก่า ได้แรงบันดาลใจจากเกมเว็บไทยยุค 2007+

## Tech stack

- **Vite + React 18 + TypeScript** — UI framework
- **Phaser 3** — game engine สำหรับเดินแมพ
- **Tailwind CSS** — styling
- **Zustand** — state management (persist เป็น localStorage)

## วิธีรัน

```bash
npm install
npm run dev      # เปิด http://localhost:5173
npm run build    # build production
npm run preview  # preview build
```

## โครงสร้างโปรเจกต์

```
src/
├── main.tsx              entry point
├── App.tsx               root component, จัดการ screen routing
├── index.css             tailwind + global styles
├── game/
│   ├── types.ts          TypeScript types
│   ├── data.ts           game data (races, classes, items, maps, recipes)
│   ├── store.ts          Zustand store (state + actions + save/load)
│   ├── PhaserGame.tsx    React wrapper สำหรับ Phaser
│   └── scenes/
│       └── MapScene.ts   Phaser scene สำหรับเดินแมพ
└── ui/
    ├── TitleScreen.tsx
    ├── CreateScreen.tsx
    ├── GameScreen.tsx    HUD + map ครอบรอบ Phaser
    ├── BattleScreen.tsx  ฉากต่อสู้แบบ React
    ├── Modal.tsx
    └── modals/
        ├── InventoryModal.tsx
        ├── CraftModal.tsx
        ├── EnhanceModal.tsx
        ├── ClassChangeModal.tsx
        ├── ShopModal.tsx
        ├── MapMenuModal.tsx
        └── HelpModal.tsx
```

## ไฟล์เก่า

ดูเวอร์ชัน single-file HTML ที่ `legacy/index.html`

## ขั้นถัดไป

- [ ] backend Node + Postgres + Prisma สำหรับ persistent data
- [ ] auth ผู้เล่น
- [ ] Socket.IO multiplayer
- [ ] Tiled map แทน emoji
- [ ] sound + music
