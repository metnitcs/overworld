import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { buildServer } from '../app.js'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

const prisma = new PrismaClient()
// Tests own a throwaway uploads dir so we don't pollute the dev folder.
const testUploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asura-uploads-'))
// Bootstrap one admin via the ADMIN_USERS list ('test_admin') and one normal
// user via plain register.
const app = buildServer({
  prisma,
  jwtSecret: 'integration-test-secret',
  adminUsers: ['test_admin'],
  uploadsDir: testUploadsDir,
})

beforeAll(async () => {
  await app.ready()
})
afterAll(async () => {
  await app.close()
  await prisma.$disconnect()
})
beforeEach(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: 'test_' } } })
  // Item/Monster seed rows used by the admin tests. Use unique ids so we
  // don't collide with the production seed.
  await prisma.monsterDrop.deleteMany({ where: { OR: [
    { itemId: 'test-potion' }, { itemId: 'test-blade' },
    { monsterId: 'test-rat' },
  ] } })
  await prisma.monster.deleteMany({ where: { id: 'test-rat' } })
  await prisma.item.deleteMany({ where: { id: { in: ['test-potion', 'test-blade'] } } })
  await prisma.item.create({ data: {
    id: 'test-potion', name: 'Test Potion', emoji: '🧪',
    type: 'consume', heal: 30, desc: 'test',
  } })
  await prisma.item.create({ data: {
    id: 'test-blade', name: 'Test Blade', emoji: '🗡️',
    type: 'weapon', atk: 10, desc: 'test',
  } })
  await prisma.monster.create({ data: {
    id: 'test-rat', name: 'Test Rat', emoji: '🐀',
    lv: 1, hp: 10, atk: 1, def: 0, spd: 5, exp: 2, gold: 1,
  } })
})

async function registerAndGetToken(
  username: string,
  password = 'supersecret',
): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { username, password },
  })
  return (res.json() as { token: string }).token
}

describe('admin guard', () => {
  it('returns 401 when no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/items' })
    expect(res.statusCode).toBe(401)
  })

  it('returns 403 when token belongs to a non-admin user', async () => {
    const token = await registerAndGetToken('test_normal')
    const res = await app.inject({
      method: 'GET', url: '/api/admin/items',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('grants access when ADMIN_USERS auto-promotes on register', async () => {
    const token = await registerAndGetToken('test_admin')
    const res = await app.inject({
      method: 'GET', url: '/api/admin/items',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })
})

describe('GET /api/me', () => {
  it('returns role=ADMIN for auto-promoted user', async () => {
    const token = await registerAndGetToken('test_admin')
    const res = await app.inject({
      method: 'GET', url: '/api/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { user: { role: string } }).user.role).toBe('ADMIN')
  })

  it('returns role=USER for a normal user', async () => {
    const token = await registerAndGetToken('test_normal')
    const res = await app.inject({
      method: 'GET', url: '/api/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect((res.json() as { user: { role: string } }).user.role).toBe('USER')
  })
})

describe('admin items', () => {
  it('GET /api/admin/items lists items', async () => {
    const token = await registerAndGetToken('test_admin')
    const res = await app.inject({
      method: 'GET', url: '/api/admin/items',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: Array<{ id: string }> }
    expect(body.items.some((i) => i.id === 'test-potion')).toBe(true)
  })

  it('PUT /api/admin/items/:id updates item stats', async () => {
    const token = await registerAndGetToken('test_admin')
    const res = await app.inject({
      method: 'PUT', url: '/api/admin/items/test-blade',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Test Blade+', emoji: '⚔️', type: 'weapon',
                 rarity: 'rare', atk: 15, desc: 'sharp' },
    })
    expect(res.statusCode).toBe(200)
    const row = await prisma.item.findUnique({ where: { id: 'test-blade' } })
    expect(row?.atk).toBe(15)
    expect(row?.name).toBe('Test Blade+')
  })

  it('POST /api/admin/items creates a new item', async () => {
    const token = await registerAndGetToken('test_admin')
    const res = await app.inject({
      method: 'POST', url: '/api/admin/items',
      headers: { authorization: `Bearer ${token}` },
      payload: { id: 'test-newitem', name: 'New', emoji: '✨',
                 type: 'mat', desc: 'created via admin' },
    })
    expect(res.statusCode).toBe(201)
    const row = await prisma.item.findUnique({ where: { id: 'test-newitem' } })
    expect(row).not.toBeNull()
    await prisma.item.delete({ where: { id: 'test-newitem' } })
  })

  it('DELETE /api/admin/items/:id removes an item', async () => {
    const token = await registerAndGetToken('test_admin')
    // Pre-condition: test-blade exists (created in beforeEach).
    const res = await app.inject({
      method: 'DELETE', url: '/api/admin/items/test-blade',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(await prisma.item.findUnique({ where: { id: 'test-blade' } })).toBeNull()
  })
})

describe('admin monsters', () => {
  it('PUT /api/admin/monsters/:id updates monster stats + replaces drops', async () => {
    const token = await registerAndGetToken('test_admin')
    const res = await app.inject({
      method: 'PUT', url: '/api/admin/monsters/test-rat',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Big Rat', emoji: '🐀', rank: 'elite',
        lv: 5, hp: 50, atk: 5, def: 2, spd: 7, exp: 20, gold: 10,
        drops: [
          { item: 'test-potion', chance: 0.5, minQty: 1, maxQty: 2 },
        ],
      },
    })
    expect(res.statusCode).toBe(200)
    const row = await prisma.monster.findUnique({
      where: { id: 'test-rat' },
      include: { drops: true },
    })
    expect(row?.hp).toBe(50)
    expect(row?.drops).toHaveLength(1)
    expect(row?.drops[0].chance).toBeCloseTo(0.5)
  })
})

describe('admin characters', () => {
  it('PUT /api/admin/characters/:id can edit any user\'s stats', async () => {
    const adminToken = await registerAndGetToken('test_admin')
    const userToken = await registerAndGetToken('test_victim')
    // Create a character for test_victim using the normal POST route.
    const created = await app.inject({
      method: 'POST', url: '/api/character',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Victim', classId: 'berserk' },
    })
    const cid = (created.json() as { character: { id: string } }).character.id

    const res = await app.inject({
      method: 'PUT', url: `/api/admin/characters/${cid}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { lv: 99, exp: 0, gold: 999999, mapId: 'sakura' },
    })
    expect(res.statusCode).toBe(200)
    const row = await prisma.character.findUnique({ where: { id: cid } })
    expect(row?.lv).toBe(99)
    expect(row?.gold).toBe(999999)
    expect(row?.mapId).toBe('sakura')
  })
})

describe('admin maps', () => {
  beforeEach(async () => {
    // Pre-clean any leftover from a prior failed run.
    await prisma.mapMonster.deleteMany({ where: { mapId: { startsWith: 'test-' } } })
    await prisma.warp.deleteMany({ where: { OR: [
      { mapId: { startsWith: 'test-' } }, { toMapId: { startsWith: 'test-' } },
    ] } })
    await prisma.npc.deleteMany({ where: { mapId: { startsWith: 'test-' } } })
    await prisma.map.deleteMany({ where: { id: { startsWith: 'test-' } } })
  })

  const sampleLayout = (w = 5, h = 4) =>
    Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x) => ({
        glyph: y === 0 ? '🌲' : undefined,
        walkable: !(y === 0),
      })),
    )

  it('POST /api/admin/maps creates a new map with layout + monster pool', async () => {
    const token = await registerAndGetToken('test_admin')
    const res = await app.inject({
      method: 'POST', url: '/api/admin/maps',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: 'test-forest',
        name: 'Test Forest',
        minLv: 1, maxLv: 5,
        w: 5, h: 4,
        bg: '#9ce29c',
        bgImage: '/assets/maps/forest.png',
        pathColor: '#a86b3a',
        monsterCount: 3,
        layout: sampleLayout(5, 4),
        monsters: [{ monsterId: 'test-rat', spawnWeight: 2 }],
      },
    })
    expect(res.statusCode).toBe(201)
    const row = await prisma.map.findUnique({
      where: { id: 'test-forest' },
      include: { monsters: true },
    })
    expect(row?.bgImage).toBe('/assets/maps/forest.png')
    expect(row?.monsters).toHaveLength(1)
    expect(row?.monsters[0].monsterId).toBe('test-rat')
    expect(row?.monsters[0].spawnWeight).toBe(2)
  })

  it('PUT /api/admin/maps/:id updates layout + replaces monster pool', async () => {
    const token = await registerAndGetToken('test_admin')
    // seed: create map first
    await prisma.map.create({ data: {
      id: 'test-cave', name: 'Test Cave', minLv: 5, maxLv: 10,
      w: 4, h: 4, bg: '#222', monsterCount: 2,
      layout: sampleLayout(4, 4) as unknown as object,
      monsters: { create: [{ monsterId: 'test-rat', spawnWeight: 1 }] },
    } })

    const res = await app.inject({
      method: 'PUT', url: '/api/admin/maps/test-cave',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Test Cave Updated', minLv: 6, maxLv: 12,
        w: 4, h: 4, bg: '#333', bgImage: null, pathColor: null,
        monsterCount: 5,
        layout: sampleLayout(4, 4),
        monsters: [], // empty pool
      },
    })
    expect(res.statusCode).toBe(200)
    const row = await prisma.map.findUnique({
      where: { id: 'test-cave' },
      include: { monsters: true },
    })
    expect(row?.name).toBe('Test Cave Updated')
    expect(row?.monsterCount).toBe(5)
    expect(row?.monsters).toHaveLength(0)
  })

  it('GET /api/admin/maps returns layout + monster pool inline', async () => {
    const token = await registerAndGetToken('test_admin')
    await prisma.map.create({ data: {
      id: 'test-list', name: 'Listed', minLv: 1, maxLv: 1,
      w: 3, h: 3, bg: '#fff', monsterCount: 1,
      layout: sampleLayout(3, 3) as unknown as object,
    } })

    const res = await app.inject({
      method: 'GET', url: '/api/admin/maps',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { maps: Array<{ id: string; layout: unknown[]; monsters: unknown[] }> }
    const found = body.maps.find((m) => m.id === 'test-list')
    expect(found).toBeDefined()
    expect(Array.isArray(found!.layout)).toBe(true)
    expect(Array.isArray(found!.monsters)).toBe(true)
  })

  it('DELETE /api/admin/maps/:id removes a map and its MapMonster join rows', async () => {
    const token = await registerAndGetToken('test_admin')
    await prisma.map.create({ data: {
      id: 'test-del', name: 'Del', minLv: 1, maxLv: 1,
      w: 3, h: 3, bg: '#fff', monsterCount: 0,
      layout: sampleLayout(3, 3) as unknown as object,
      monsters: { create: [{ monsterId: 'test-rat', spawnWeight: 1 }] },
    } })

    const res = await app.inject({
      method: 'DELETE', url: '/api/admin/maps/test-del',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(await prisma.map.findUnique({ where: { id: 'test-del' } })).toBeNull()
    expect(await prisma.mapMonster.findMany({ where: { mapId: 'test-del' } })).toHaveLength(0)
  })

  it('POST /api/admin/maps persists outgoing warps + GET returns them', async () => {
    const token = await registerAndGetToken('test_admin')
    // Need a target map for the warp to point at.
    await prisma.map.create({ data: {
      id: 'test-target', name: 'Target', minLv: 1, maxLv: 1,
      w: 4, h: 4, bg: '#fff', monsterCount: 0,
      layout: sampleLayout(4, 4) as unknown as object,
    } })

    const res = await app.inject({
      method: 'POST', url: '/api/admin/maps',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: 'test-src', name: 'Source', minLv: 1, maxLv: 1,
        w: 4, h: 4, bg: '#fff', monsterCount: 0,
        layout: sampleLayout(4, 4),
        monsters: [],
        warps: [
          { x: 1, y: 1, toMapId: 'test-target', tx: 2, ty: 2, label: 'go!' },
        ],
      },
    })
    expect(res.statusCode).toBe(201)
    const rows = await prisma.warp.findMany({ where: { mapId: 'test-src' } })
    expect(rows).toHaveLength(1)
    expect(rows[0].toMapId).toBe('test-target')
    expect(rows[0].label).toBe('go!')

    const listRes = await app.inject({
      method: 'GET', url: '/api/admin/maps',
      headers: { authorization: `Bearer ${token}` },
    })
    const body = listRes.json() as { maps: Array<{ id: string; warps: unknown[] }> }
    const found = body.maps.find((m) => m.id === 'test-src')
    expect(found?.warps).toHaveLength(1)
  })

  it('PUT /api/admin/maps/:id replaces the warp list atomically', async () => {
    const token = await registerAndGetToken('test_admin')
    await prisma.map.create({ data: {
      id: 'test-warp-tgt', name: 'T', minLv: 1, maxLv: 1,
      w: 4, h: 4, bg: '#fff', monsterCount: 0,
      layout: sampleLayout(4, 4) as unknown as object,
    } })
    await prisma.map.create({ data: {
      id: 'test-warp-edit', name: 'E', minLv: 1, maxLv: 1,
      w: 4, h: 4, bg: '#fff', monsterCount: 0,
      layout: sampleLayout(4, 4) as unknown as object,
      warpsFrom: { create: [
        { x: 0, y: 0, toMapId: 'test-warp-tgt', tx: 1, ty: 1 },
      ] },
    } })

    const res = await app.inject({
      method: 'PUT', url: '/api/admin/maps/test-warp-edit',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'E2', minLv: 1, maxLv: 1, w: 4, h: 4, bg: '#fff', monsterCount: 0,
        layout: sampleLayout(4, 4), monsters: [],
        warps: [
          { x: 2, y: 2, toMapId: 'test-warp-tgt', tx: 3, ty: 3, label: 'new' },
          { x: 3, y: 3, toMapId: 'test-warp-tgt', tx: 0, ty: 0 },
        ],
      },
    })
    expect(res.statusCode).toBe(200)
    const rows = await prisma.warp.findMany({ where: { mapId: 'test-warp-edit' } })
    expect(rows).toHaveLength(2)
    expect(rows.some((w) => w.x === 0 && w.y === 0)).toBe(false) // old gone
  })

  it('POST /api/admin/maps validates toMapId exists', async () => {
    const token = await registerAndGetToken('test_admin')
    const res = await app.inject({
      method: 'POST', url: '/api/admin/maps',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: 'test-warp-bad', name: 'X', minLv: 1, maxLv: 1,
        w: 4, h: 4, bg: '#fff', monsterCount: 0,
        layout: sampleLayout(4, 4),
        monsters: [],
        warps: [{ x: 1, y: 1, toMapId: 'no-such-map', tx: 0, ty: 0 }],
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST /api/admin/maps validates monsterId exists', async () => {
    const token = await registerAndGetToken('test_admin')
    const res = await app.inject({
      method: 'POST', url: '/api/admin/maps',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: 'test-badmon', name: 'X', minLv: 1, maxLv: 1,
        w: 3, h: 3, bg: '#fff', monsterCount: 1,
        layout: sampleLayout(3, 3),
        monsters: [{ monsterId: 'does-not-exist', spawnWeight: 1 }],
      },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('admin upload', () => {
  // Build a minimal multipart body manually — keeps the test free of any
  // extra fixture dependency. The PNG payload is a 1×1 transparent pixel.
  const pngBytes = Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000d49444154789c63000100000005000100' +
    '0d0a2db40000000049454e44ae426082',
    'hex',
  )

  function multipart(filename: string, contentType: string, payload: Buffer) {
    const boundary = '----asuraTestBoundary'
    const head = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
    )
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
    const body = Buffer.concat([head, payload, tail])
    return {
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body,
    }
  }

  it('POST /api/admin/upload writes the file and returns a /uploads/... URL', async () => {
    const token = await registerAndGetToken('test_admin')
    const m = multipart('tiny.png', 'image/png', pngBytes)
    const res = await app.inject({
      method: 'POST', url: '/api/admin/upload',
      headers: { authorization: `Bearer ${token}`, ...m.headers },
      payload: m.body,
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as { url: string }
    expect(body.url.startsWith('/uploads/maps/')).toBe(true)
    // File actually exists on disk.
    const relPath = body.url.replace(/^\/uploads\//, '')
    expect(fs.existsSync(path.join(testUploadsDir, relPath))).toBe(true)
  })

  it('rejects non-image content-type with 400', async () => {
    const token = await registerAndGetToken('test_admin')
    const m = multipart('evil.exe', 'application/octet-stream', Buffer.from('MZ'))
    const res = await app.inject({
      method: 'POST', url: '/api/admin/upload',
      headers: { authorization: `Bearer ${token}`, ...m.headers },
      payload: m.body,
    })
    expect(res.statusCode).toBe(400)
  })

  it('non-admin gets 403', async () => {
    const token = await registerAndGetToken('test_normal_upload')
    const m = multipart('a.png', 'image/png', pngBytes)
    const res = await app.inject({
      method: 'POST', url: '/api/admin/upload',
      headers: { authorization: `Bearer ${token}`, ...m.headers },
      payload: m.body,
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('admin users (Slice 30)', () => {
  it('GET /api/admin/users lists all users with status + characterCount', async () => {
    const adminToken = await registerAndGetToken('test_admin')
    await registerAndGetToken('test_normal_user')
    const res = await app.inject({
      method: 'GET', url: '/api/admin/users',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { users: Array<{ username: string; status: string; characterCount: number }> }
    const normal = body.users.find((u) => u.username === 'test_normal_user')
    expect(normal?.status).toBe('ACTIVE')
    expect(normal?.characterCount).toBe(0)
  })

  it('PATCH /api/admin/users/:id/status can SUSPEND a user', async () => {
    const adminToken = await registerAndGetToken('test_admin')
    const targetToken = await registerAndGetToken('test_target_suspend')
    // Decode targetToken... easier: list users + find target id
    const list = await app.inject({
      method: 'GET', url: '/api/admin/users',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    const target = (list.json() as { users: Array<{ id: string; username: string }> })
      .users.find((u) => u.username === 'test_target_suspend')!

    const res = await app.inject({
      method: 'PATCH', url: `/api/admin/users/${target.id}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'SUSPENDED' },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { user: { status: string } }).user.status).toBe('SUSPENDED')

    // Suspended user's existing token should now be rejected on requireAuth routes.
    const me = await app.inject({
      method: 'GET', url: '/api/me',
      headers: { authorization: `Bearer ${targetToken}` },
    })
    expect(me.statusCode).toBe(403)
  })

  it('PATCH /api/admin/users/:id/status refuses self-suspend', async () => {
    const adminToken = await registerAndGetToken('test_admin')
    const list = await app.inject({
      method: 'GET', url: '/api/admin/users',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    const self = (list.json() as { users: Array<{ id: string; username: string }> })
      .users.find((u) => u.username === 'test_admin')!
    const res = await app.inject({
      method: 'PATCH', url: `/api/admin/users/${self.id}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'SUSPENDED' },
    })
    expect(res.statusCode).toBe(409)
  })

  it('BANNED user cannot log in', async () => {
    const adminToken = await registerAndGetToken('test_admin')
    await registerAndGetToken('test_to_ban')
    const list = await app.inject({
      method: 'GET', url: '/api/admin/users',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    const target = (list.json() as { users: Array<{ id: string; username: string }> })
      .users.find((u) => u.username === 'test_to_ban')!
    await app.inject({
      method: 'PATCH', url: `/api/admin/users/${target.id}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'BANNED' },
    })

    const loginRes = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { username: 'test_to_ban', password: 'supersecret' },
    })
    expect(loginRes.statusCode).toBe(403)
  })
})

describe('admin audit log (Slice 30)', () => {
  it('mutations write to the AuditLog table; GET /api/admin/logs reads back', async () => {
    const adminToken = await registerAndGetToken('test_admin')
    // Trigger a known auditable action: cache reload.
    await app.inject({
      method: 'POST', url: '/api/admin/cache/reload',
      headers: { authorization: `Bearer ${adminToken}` },
    })

    const res = await app.inject({
      method: 'GET', url: '/api/admin/logs?action=cache.&limit=10',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { logs: Array<{ action: string; targetType: string }> }
    expect(body.logs.length).toBeGreaterThan(0)
    expect(body.logs[0].action).toBe('cache.reload')
    expect(body.logs[0].targetType).toBe('cache')
  })
})

describe('admin character (Slice 30 deep editor, Slice 47 scalar-only)', () => {
  // Slice 47: PUT /api/admin/characters/:id no longer accepts inventory /
  // plus / equipWeapon / equipArmor — those flow through per-row admin
  // endpoints in Slice 49. The scalar update path is unchanged.
  it('PUT /api/admin/characters/:id edits primary stats + race/class + flags', async () => {
    const adminToken = await registerAndGetToken('test_admin')
    const userToken = await registerAndGetToken('test_charowner')
    const created = await app.inject({
      method: 'POST', url: '/api/character',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Editable' },
    })
    const cid = (created.json() as { character: { id: string } }).character.id

    const res = await app.inject({
      method: 'PUT', url: `/api/admin/characters/${cid}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        lv: 50, str: 25, vit: 30,
        raceId: 'mara', transcended: true,
      },
    })
    expect(res.statusCode).toBe(200)
    const row = await prisma.character.findUnique({
      where: { id: cid }, include: { inventory: true },
    })
    expect(row?.lv).toBe(50)
    expect(row?.str).toBe(25)
    expect(row?.raceId).toBe('mara')
    expect(row?.transcended).toBe(true)
  })

  // Slice 49: admin PUT re-derives cached atk/def/spd when primary stats
  // (or lv / race / class) change. Without this, the GM's edit would only
  // surface to the player after the next intent endpoint call.
  it('Slice 49: re-derives cached atk/def/spd when primary stats change', async () => {
    const adminToken = await registerAndGetToken('test_admin')
    const userToken = await registerAndGetToken('test_charowner_redrv')
    const created = await app.inject({
      method: 'POST', url: '/api/character',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Buff' },
    })
    const cid = (created.json() as { character: { id: string } }).character.id
    const before = await prisma.character.findUniqueOrThrow({ where: { id: cid } })

    // Bump STR from 10 → 50. deriveStats: pAtk = STR*2 + floor((lv-1)*1.5)
    // → so atk should jump by (50-10)*2 = 80.
    await app.inject({
      method: 'PUT', url: `/api/admin/characters/${cid}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { str: 50 },
    })
    const after = await prisma.character.findUniqueOrThrow({ where: { id: cid } })
    expect(after.str).toBe(50)
    expect(after.atk).toBe(before.atk + 80)
  })
})

describe('Slice 49 — POST /api/admin/inventory/:itemId/set-plus', () => {
  it('updates the row\'s plus + re-derives owner\'s atk when the row is equipped', async () => {
    const adminToken = await registerAndGetToken('test_admin')
    const userToken = await registerAndGetToken('test_charowner_setp')
    const created = await app.inject({
      method: 'POST', url: '/api/character',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'SP' },
    })
    const cid = (created.json() as { character: { id: string } }).character.id
    // Stock a weapon and equip it.
    const sword = await prisma.inventoryItem.create({
      data: { characterId: cid, itemKey: 'sword-1', qty: 1 },
    })
    await app.inject({
      method: 'POST', url: `/api/character/${cid}/equip`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { inventoryItemId: sword.id },
    })
    const atkBefore = (await prisma.character.findUniqueOrThrow({ where: { id: cid } })).atk

    // Bump plus to +5 via the admin intent. sword-1 weapon +N → +3 atk/level.
    const res = await app.inject({
      method: 'POST', url: `/api/admin/inventory/${sword.id}/set-plus`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { plus: 5 },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { inventoryItem: { plus: number } }
    expect(body.inventoryItem.plus).toBe(5)

    const after = await prisma.character.findUniqueOrThrow({ where: { id: cid } })
    expect(after.atk).toBe(atkBefore + 5 * 3)

    // Audit row exists with the action name + old/new plus.
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'inventory.set-plus', targetId: sword.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit).toBeDefined()
    expect((audit?.payload as { newPlus: number; oldPlus: number }).newPlus).toBe(5)
    expect((audit?.payload as { newPlus: number; oldPlus: number }).oldPlus).toBe(0)
  })

  it('rejects plus outside 0..10 with 400', async () => {
    const adminToken = await registerAndGetToken('test_admin')
    const userToken = await registerAndGetToken('test_charowner_setp_bad')
    const created = await app.inject({
      method: 'POST', url: '/api/character',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'BD' },
    })
    const cid = (created.json() as { character: { id: string } }).character.id
    const sword = await prisma.inventoryItem.create({
      data: { characterId: cid, itemKey: 'sword-1', qty: 1 },
    })
    const res = await app.inject({
      method: 'POST', url: `/api/admin/inventory/${sword.id}/set-plus`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { plus: 11 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects setting plus on a non-gear item (400) — potion', async () => {
    const adminToken = await registerAndGetToken('test_admin')
    const userToken = await registerAndGetToken('test_charowner_setp_potion')
    const created = await app.inject({
      method: 'POST', url: '/api/character',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'PP' },
    })
    const cid = (created.json() as { character: { id: string } }).character.id
    const potionRow = await prisma.inventoryItem.findFirstOrThrow({
      where: { characterId: cid, itemKey: 'potion-s' },
    })
    const res = await app.inject({
      method: 'POST', url: `/api/admin/inventory/${potionRow.id}/set-plus`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { plus: 3 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 for an unknown row id', async () => {
    const adminToken = await registerAndGetToken('test_admin')
    const res = await app.inject({
      method: 'POST', url: '/api/admin/inventory/no-such-id/set-plus',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { plus: 3 },
    })
    expect(res.statusCode).toBe(404)
  })

  it('non-admin user is rejected with 403', async () => {
    const userToken = await registerAndGetToken('test_not_admin_setp')
    const created = await app.inject({
      method: 'POST', url: '/api/character',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'NA' },
    })
    const cid = (created.json() as { character: { id: string } }).character.id
    const sword = await prisma.inventoryItem.create({
      data: { characterId: cid, itemKey: 'sword-1', qty: 1 },
    })
    const res = await app.inject({
      method: 'POST', url: `/api/admin/inventory/${sword.id}/set-plus`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { plus: 3 },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('admin cache reload', () => {
  it('POST /api/admin/cache/reload returns ok and clears the cache', async () => {
    const token = await registerAndGetToken('test_admin')
    // Warm the cache by calling /api/content once.
    await app.inject({ method: 'GET', url: '/api/content' })
    const res = await app.inject({
      method: 'POST', url: '/api/admin/cache/reload',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { ok: boolean }).ok).toBe(true)
  })

  it('a PUT to an item is reflected in the next /api/content read', async () => {
    const token = await registerAndGetToken('test_admin')
    // Prime the cache with the current value.
    await app.inject({ method: 'GET', url: '/api/content' })

    await app.inject({
      method: 'PUT', url: '/api/admin/items/test-blade',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Test Blade', emoji: '🗡️', type: 'weapon',
                 rarity: 'common', atk: 77, desc: 'live edit' },
    })

    const after = await app.inject({ method: 'GET', url: '/api/content' })
    const bundle = after.json() as { items: Record<string, { atk?: number }> }
    expect(bundle.items['test-blade'].atk).toBe(77)
  })
})
