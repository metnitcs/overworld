import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { buildServer } from '../app.js'

const prisma = new PrismaClient()
const app = buildServer({ prisma, jwtSecret: 'integration-test-secret' })

beforeAll(async () => {
  await app.ready()
})
afterAll(async () => {
  await app.close()
  await prisma.$disconnect()
})
beforeEach(async () => {
  // Wipe seed-test fixtures + drop any cached bundle so each test sees a
  // fresh DB. Order matters because of FK relations:
  //  - Warps cascade from Map source but FK-restrict on Map target — wipe first.
  //  - Npc cascades from Map; ShopItem cascades from Npc.
  //  - Recipe.id FKs to Item; RecipeMat FK-restricts to Item — wipe Recipe first.
  //  - Items wipe last because MonsterDrop + ShopItem + RecipeMat FK-restrict to Item.
  await prisma.warp.deleteMany({ where: { mapId: { startsWith: 'test_' } } })
  await prisma.npc.deleteMany({ where: { id: { startsWith: 'test_' } } })
  await prisma.recipe.deleteMany({ where: { id: { startsWith: 'test_' } } })
  await prisma.map.deleteMany({ where: { id: { startsWith: 'test_' } } })
  await prisma.monster.deleteMany({ where: { id: { startsWith: 'test_' } } })
  await prisma.item.deleteMany({ where: { id: { startsWith: 'test_' } } })
  app.contentCache.invalidate()
})

describe('GET /api/content', () => {
  it('returns items keyed by id from the DB', async () => {
    await prisma.item.create({
      data: {
        id: 'test_sword',
        name: 'ดาบทดสอบ',
        emoji: '🗡️',
        type: 'weapon',
        rarity: 'rare',
        atk: 42,
        desc: 'ทดสอบ ItemDef shape',
      },
    })

    const res = await app.inject({ method: 'GET', url: '/api/content' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: Record<string, unknown> }
    expect(body.items.test_sword).toMatchObject({
      name: 'ดาบทดสอบ',
      emoji: '🗡️',
      type: 'weapon',
      rarity: 'rare',
      atk: 42,
      desc: 'ทดสอบ ItemDef shape',
    })
  })

  it('omits null stat fields rather than emitting them as null', async () => {
    // A consume item shouldn't carry atk/def — undefined-stripped on the wire.
    await prisma.item.create({
      data: {
        id: 'test_potion',
        name: 'ยาทดสอบ',
        emoji: '🧪',
        type: 'consume',
        rarity: 'common',
        heal: 10,
        desc: 'ทดสอบ stat ที่ไม่เกี่ยว',
      },
    })

    const res = await app.inject({ method: 'GET', url: '/api/content' })
    const body = res.json() as { items: Record<string, Record<string, unknown>> }
    const potion = body.items.test_potion
    expect(potion).toMatchObject({ heal: 10 })
    expect(potion.atk).toBeUndefined()
    expect(potion.def).toBeUndefined()
    expect(potion.matk).toBeUndefined()
    expect(potion.healMp).toBeUndefined()
  })

  it('does not require auth (public Content endpoint)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/content' })
    expect(res.statusCode).toBe(200)
  })

  it('returns monsters keyed by id with embedded drops', async () => {
    // A drop references an Item; create the item first to satisfy the FK.
    await prisma.item.create({
      data: {
        id: 'test_fang',
        name: 'เขี้ยวทดสอบ',
        emoji: '🦷',
        type: 'mat',
        rarity: 'common',
        desc: 'fixture',
      },
    })
    await prisma.monster.create({
      data: {
        id: 'test_wolf',
        name: 'หมาป่าทดสอบ',
        emoji: '🐺',
        rank: 'elite',
        lv: 5, hp: 100, atk: 10, def: 4, spd: 6, exp: 20, gold: 12,
        drops: {
          create: [
            { itemId: 'test_fang', chance: 0.5, minQty: 1, maxQty: 2 },
          ],
        },
      },
    })

    const res = await app.inject({ method: 'GET', url: '/api/content' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      monsters: Record<string, {
        id: string; name: string; rank: string;
        drops: Array<{ item: string; chance: number; minQty: number; maxQty: number }>
      }>
    }
    expect(body.monsters.test_wolf).toMatchObject({
      id: 'test_wolf',
      name: 'หมาป่าทดสอบ',
      rank: 'elite',
      lv: 5, hp: 100, atk: 10, def: 4, spd: 6, exp: 20, gold: 12,
    })
    expect(body.monsters.test_wolf.drops).toHaveLength(1)
    expect(body.monsters.test_wolf.drops[0]).toMatchObject({
      item: 'test_fang', chance: 0.5, minQty: 1, maxQty: 2,
    })
  })

  it('returns maps keyed by id with 2D layout + monster id list', async () => {
    await prisma.monster.create({
      data: {
        id: 'test_ghost',
        name: 'ผีทดสอบ',
        emoji: '👻',
        rank: 'normal',
        lv: 3, hp: 30, atk: 5, def: 2, spd: 4, exp: 6, gold: 3,
      },
    })
    const layout = [
      [{ glyph: '🌸', walkable: true }, { walkable: true }],
      [{ walkable: false }, { glyph: '🌿', walkable: true, kind: 'spawn' as const }],
    ]
    await prisma.map.create({
      data: {
        id: 'test_meadow',
        name: 'ทุ่งทดสอบ',
        minLv: 1, maxLv: 5,
        w: 2, h: 2,
        bg: '#abcdef',
        pathColor: '#123456',
        monsterCount: 1,
        layout,
        monsters: { create: [{ monsterId: 'test_ghost', spawnWeight: 1 }] },
      },
    })

    const res = await app.inject({ method: 'GET', url: '/api/content' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      maps: Record<string, {
        id: string; name: string; w: number; h: number;
        layout: Array<Array<{ glyph?: string; walkable: boolean; kind?: string }>>;
        monsters: string[];
      }>
    }
    const meadow = body.maps.test_meadow
    expect(meadow).toMatchObject({
      id: 'test_meadow',
      name: 'ทุ่งทดสอบ',
      w: 2, h: 2,
      bg: '#abcdef',
      pathColor: '#123456',
      monsterCount: 1,
    })
    expect(meadow.layout).toHaveLength(2)
    expect(meadow.layout[0]).toHaveLength(2)
    expect(meadow.layout[0][0]).toMatchObject({ glyph: '🌸', walkable: true })
    expect(meadow.layout[1][0]).toMatchObject({ walkable: false })
    expect(meadow.layout[1][1]).toMatchObject({ walkable: true, kind: 'spawn' })
    expect(meadow.monsters).toEqual(['test_ghost'])
  })

  it('embeds outgoing Warps on each map bundle', async () => {
    // Two-map fixture so the Warp's toMapId has a real target.
    await prisma.map.createMany({
      data: [
        {
          id: 'test_a', name: 'A', minLv: 1, maxLv: 1, w: 2, h: 1,
          bg: '#000', monsterCount: 0,
          layout: [[{ walkable: true }, { walkable: true }]],
        },
        {
          id: 'test_b', name: 'B', minLv: 1, maxLv: 1, w: 2, h: 1,
          bg: '#000', monsterCount: 0,
          layout: [[{ walkable: true }, { walkable: true }]],
        },
      ],
    })
    await prisma.warp.create({
      data: {
        mapId: 'test_a', x: 1, y: 0,
        toMapId: 'test_b', tx: 0, ty: 0,
        label: '→ B',
      },
    })

    const res = await app.inject({ method: 'GET', url: '/api/content' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      maps: Record<string, { warps: Array<{ x: number; y: number; to: string; tx: number; ty: number; label?: string }> }>
    }
    expect(body.maps.test_a.warps).toEqual([
      { x: 1, y: 0, to: 'test_b', tx: 0, ty: 0, label: '→ B' },
    ])
    // B has no outgoing warps — the array is present but empty.
    expect(body.maps.test_b.warps).toEqual([])
  })

  it('embeds NPCs on each map bundle, with shop stock inlined for kind=shop', async () => {
    await prisma.item.create({
      data: {
        id: 'test_potion',
        name: 'ยาทดสอบ',
        emoji: '🧪',
        type: 'consume',
        rarity: 'common',
        heal: 10,
        desc: 'fixture',
      },
    })
    await prisma.map.create({
      data: {
        id: 'test_town',
        name: 'เมืองทดสอบ',
        minLv: 1, maxLv: 1, w: 3, h: 3,
        bg: '#000', monsterCount: 0,
        layout: [
          [{ walkable: true }, { walkable: true }, { walkable: true }],
          [{ walkable: true }, { walkable: true }, { walkable: true }],
          [{ walkable: true }, { walkable: true }, { walkable: true }],
        ],
        npcs: {
          create: [
            {
              id: 'test_shop_npc',
              name: 'ป้าทดสอบ',
              emoji: '🧙‍♀️',
              x: 1, y: 1, kind: 'shop',
              shopItems: { create: [{ itemId: 'test_potion', price: 99 }] },
            },
            {
              id: 'test_healer_npc',
              name: 'หมอทดสอบ',
              emoji: '👩‍⚕️',
              x: 2, y: 2, kind: 'healer',
            },
          ],
        },
      },
    })

    const res = await app.inject({ method: 'GET', url: '/api/content' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      maps: Record<string, {
        npcs: Array<{ id: string; kind: string; x: number; y: number; shop: Array<{ item: string; price: number }> }>
      }>
    }
    const town = body.maps.test_town
    expect(town.npcs).toHaveLength(2)
    const shopkeep = town.npcs.find((n) => n.kind === 'shop')!
    expect(shopkeep).toMatchObject({ id: 'test_shop_npc', x: 1, y: 1, kind: 'shop' })
    expect(shopkeep.shop).toEqual([{ item: 'test_potion', price: 99 }])
    const healer = town.npcs.find((n) => n.kind === 'healer')!
    expect(healer).toMatchObject({ id: 'test_healer_npc', x: 2, y: 2, kind: 'healer' })
    expect(healer.shop).toEqual([])
  })

  it('seed run stamps NPC kinds onto matching village layout cells', async () => {
    // Production data: NPCS in shared/data.ts puts shopkeeper at (3,3) and
    // healer at (8,3) in village. The seed-script overlay should write
    // tile.kind onto those cells.
    const res = await app.inject({ method: 'GET', url: '/api/content' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      maps: Record<string, {
        layout: Array<Array<{ kind?: string }>>
        npcs: Array<{ x: number; y: number; kind: string }>
      }>
    }
    const village = body.maps.village
    if (!village) {
      throw new Error('village map missing — did seed run?')
    }
    for (const npc of village.npcs) {
      expect(village.layout[npc.y][npc.x].kind).toBe(npc.kind)
    }
  })

  it('returns recipes with mats as Record<itemKey, qty> and classReq array', async () => {
    // Need result item + 2 mat items before the recipe can be inserted.
    await prisma.item.createMany({
      data: [
        { id: 'test_sword', name: 'ดาบ', emoji: '🗡', type: 'weapon', rarity: 'rare', atk: 5, desc: 'fixture' },
        { id: 'test_silk',  name: 'ไหม', emoji: '🧵', type: 'mat',    rarity: 'common', desc: 'fixture' },
        { id: 'test_fang',  name: 'เขี้ยว', emoji: '🦷', type: 'mat',  rarity: 'common', desc: 'fixture' },
      ],
    })
    await prisma.recipe.create({
      data: {
        id: 'test_sword',
        gold: 999,
        classReq: ['berserk', 'assassin'],
        mats: {
          create: [
            { itemId: 'test_silk', qty: 3 },
            { itemId: 'test_fang', qty: 2 },
          ],
        },
      },
    })

    const res = await app.inject({ method: 'GET', url: '/api/content' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      recipes: Array<{ result: string; gold: number; classReq?: string[]; mats: Record<string, number> }>
    }
    const rec = body.recipes.find((r) => r.result === 'test_sword')
    expect(rec).toBeDefined()
    expect(rec).toMatchObject({
      result: 'test_sword',
      gold: 999,
      classReq: ['berserk', 'assassin'],
    })
    expect(rec!.mats).toEqual({ test_silk: 3, test_fang: 2 })
  })

  it('returns recipes without classReq (any-class craftable) as classReq omitted', async () => {
    await prisma.item.createMany({
      data: [
        { id: 'test_armor', name: 'เกราะ', emoji: '👕', type: 'armor', rarity: 'common', def: 5, desc: 'fixture' },
        { id: 'test_silk',  name: 'ไหม',   emoji: '🧵', type: 'mat',    rarity: 'common', desc: 'fixture' },
      ],
    })
    await prisma.recipe.create({
      data: {
        id: 'test_armor',
        gold: 60,
        // classReq omitted → null in DB → undefined on the wire
        mats: { create: [{ itemId: 'test_silk', qty: 5 }] },
      },
    })

    const res = await app.inject({ method: 'GET', url: '/api/content' })
    const body = res.json() as {
      recipes: Array<{ result: string; classReq?: string[] }>
    }
    const rec = body.recipes.find((r) => r.result === 'test_armor')
    expect(rec).toBeDefined()
    expect(rec!.classReq).toBeUndefined()
  })
})
