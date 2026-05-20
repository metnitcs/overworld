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
  // Cascading delete wipes characters + inventory items for our test users.
  await prisma.user.deleteMany({ where: { username: { startsWith: 'test_' } } })
})

async function registerAndGetToken(username: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username, password: 'supersecret' },
  })
  return (res.json() as { token: string }).token
}

describe('POST /api/character', () => {
  it('creates a character for the authenticated user with @asura/shared-derived initial stats', async () => {
    const token = await registerAndGetToken('test_alice')

    const res = await app.inject({
      method: 'POST',
      url: '/api/character',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Alice', raceId: 'mara', classId: 'berserk' },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json() as { character: Record<string, unknown> }
    expect(body.character).toMatchObject({
      name: 'Alice',
      raceId: 'mara',
      classId: 'berserk',
      lv: 1,
      exp: 0,
      gold: 100,
      // API exposes the field as `map` to match the client's GameState shape
      // (DB column is `mapId` but the server serialiser maps it).
      map: 'village',
      px: 5,
      py: 5,
      steps: 0,
      equipWeapon: null,
      equipArmor: null,
    })
    // mara (hp110 mp80 atk12 def8 spd10) + berserk (atk6 def2 spd1 mp0) at lv1 → deriveStats:
    expect(body.character).toMatchObject({
      atk: 18,
      def: 10,
      spd: 11,
      maxHp: 110,
      maxMp: 80,
      hp: 110,
      mp: 80,
    })
    // Default starting inventory: 3 small potions (mirrors current client initialGame).
    expect(body.character).toMatchObject({ inventory: { 'potion-s': 3 } })
  })
})

describe('GET /api/character', () => {
  it('returns the authenticated user\'s character including its inventory', async () => {
    const token = await registerAndGetToken('test_bob')
    await app.inject({
      method: 'POST',
      url: '/api/character',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Bob', raceId: 'angel', classId: 'shaman' },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/character',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { character: { name: string; raceId: string; inventory: Record<string, number> } }
    expect(body.character.name).toBe('Bob')
    expect(body.character.raceId).toBe('angel')
    expect(body.character.inventory).toEqual({ 'potion-s': 3 })
  })

  it('returns 404 when the authenticated user has no character yet', async () => {
    const token = await registerAndGetToken('test_eve')

    const res = await app.inject({
      method: 'GET',
      url: '/api/character',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(404)
  })
})

describe('auth guard on /api/character', () => {
  it('returns 401 with no Authorization header', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/character' })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 with a malformed / unsigned token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/character',
      headers: { authorization: 'Bearer not.a.real.token' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/character (duplicate)', () => {
  it('returns 409 when the user already has a character', async () => {
    const token = await registerAndGetToken('test_frank')
    const first = await app.inject({
      method: 'POST',
      url: '/api/character',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Frank', raceId: 'mara', classId: 'berserk' },
    })
    expect(first.statusCode).toBe(201)

    const second = await app.inject({
      method: 'POST',
      url: '/api/character',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Frank2', raceId: 'angel', classId: 'shaman' },
    })

    expect(second.statusCode).toBe(409)
  })
})

describe('PUT /api/character', () => {
  it('updates fields and replaces the inventory, returning the persisted state', async () => {
    const token = await registerAndGetToken('test_gina')
    await app.inject({
      method: 'POST',
      url: '/api/character',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Gina', raceId: 'beast', classId: 'assassin' },
    })

    const update = {
      lv: 5, exp: 12, gold: 250,
      hp: 120, maxHp: 150, mp: 40, maxMp: 60,
      atk: 30, def: 18, spd: 20,
      map: 'sakura', px: 3, py: 7, steps: 42,
      equipWeapon: 'sword-1', equipArmor: null,
      plus: { 'sword-1_w': 2 },
      inventory: { 'potion-s': 1, 'silk': 4 },
    }
    const res = await app.inject({
      method: 'PUT',
      url: '/api/character',
      headers: { authorization: `Bearer ${token}` },
      payload: update,
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { character: Record<string, unknown> }
    expect(body.character).toMatchObject({
      ...update,
      // identity/raceclass preserved
      name: 'Gina', raceId: 'beast', classId: 'assassin',
    })

    // and a subsequent GET sees exactly the same persisted state
    const getRes = await app.inject({
      method: 'GET',
      url: '/api/character',
      headers: { authorization: `Bearer ${token}` },
    })
    expect((getRes.json() as { character: { inventory: Record<string, number> } }).character.inventory)
      .toEqual({ 'potion-s': 1, 'silk': 4 })
  })

  it('returns 404 when the user has no character to update', async () => {
    const token = await registerAndGetToken('test_hugh')

    const res = await app.inject({
      method: 'PUT',
      url: '/api/character',
      headers: { authorization: `Bearer ${token}` },
      payload: { lv: 1, exp: 0, gold: 0, hp: 1, maxHp: 1, mp: 0, maxMp: 0,
        atk: 1, def: 1, spd: 1, map: 'village', px: 0, py: 0, steps: 0,
        equipWeapon: null, equipArmor: null, plus: {}, inventory: {} },
    })

    expect(res.statusCode).toBe(404)
  })
})
