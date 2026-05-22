import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { buildServer } from '../app.js'
import { STARTER_RACE, CHARACTER_SLOT_LIMIT, TRANSCEND_LV } from '@asura/shared'

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

/** Full PUT body shape (Slice 16/17/23). Tests build on top of this.
 *  Primary stats default to 10 (the post-creation seed values). */
function fullSaveBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    lv: 1, exp: 0, gold: 100,
    hp: 100, maxHp: 100, mp: 80, maxMp: 80,
    atk: 11, def: 9, spd: 10,
    str: 10, int: 10, dex: 10, agi: 10, luk: 10, vit: 10,
    unspentPoints: 0,
    map: 'village', px: 5, py: 5, steps: 0,
    equipWeapon: null, equipArmor: null,
    plus: {}, inventory: {},
    transcended: false,
    classChanged: true,
    ...overrides,
  }
}

describe('POST /api/character', () => {
  it('creates a character at the starter race + class regardless of payload (Slice 17 + 26)', async () => {
    const token = await registerAndGetToken('test_alice')

    const res = await app.inject({
      method: 'POST',
      url: '/api/character',
      headers: { authorization: `Bearer ${token}` },
      // raceId AND classId in payload are ignored — server always picks
      // STARTER_RACE (Slice 17) + STARTER_CLASS (Slice 26).
      payload: { name: 'Alice', raceId: 'mara', classId: 'berserk' },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json() as { character: Record<string, unknown> }
    expect(body.character).toMatchObject({
      name: 'Alice',
      raceId: STARTER_RACE.id,        // = 'human'
      classId: 'adventurer',          // = STARTER_CLASS.id, NOT 'berserk'
      lv: 1, exp: 0, gold: 100,
      map: 'village', px: 5, py: 5, steps: 0,
      equipWeapon: null, equipArmor: null,
      transcended: false,
      classChanged: false,
    })
    expect(body.character).toMatchObject({ inventory: { 'potion-s': 3 } })
  })
})

describe('GET /api/character (legacy first-char endpoint)', () => {
  it("returns the authenticated user's first character including inventory", async () => {
    const token = await registerAndGetToken('test_bob')
    await app.inject({
      method: 'POST',
      url: '/api/character',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Bob', classId: 'shaman' },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/character',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      character: { name: string; raceId: string; transcended: boolean; inventory: Record<string, number> }
    }
    expect(body.character.name).toBe('Bob')
    expect(body.character.raceId).toBe(STARTER_RACE.id)
    expect(body.character.transcended).toBe(false)
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

describe('GET /api/characters (Slice 16 multi-char list)', () => {
  it('returns every character owned by the user with the slot limit', async () => {
    const token = await registerAndGetToken('test_lila')
    await app.inject({ method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${token}` },
      payload: { name: 'A', classId: 'berserk' } })
    await app.inject({ method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${token}` },
      payload: { name: 'B', classId: 'shaman' } })

    const res = await app.inject({
      method: 'GET',
      url: '/api/characters',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { characters: Array<{ name: string }>; slotLimit: number }
    expect(body.characters).toHaveLength(2)
    expect(new Set(body.characters.map((c) => c.name))).toEqual(new Set(['A', 'B']))
    expect(body.slotLimit).toBe(CHARACTER_SLOT_LIMIT)
  })

  it('returns an empty array (not 404) when the user has no characters', async () => {
    const token = await registerAndGetToken('test_zara')
    const res = await app.inject({
      method: 'GET',
      url: '/api/characters',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { characters: unknown[] }).characters).toEqual([])
  })
})

describe('GET /api/character/:id (Slice 16 by-id)', () => {
  it('returns the character when the caller owns it', async () => {
    const token = await registerAndGetToken('test_pip')
    const created = await app.inject({
      method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Pip', classId: 'berserk' },
    })
    const id = (created.json() as { character: { id: string } }).character.id

    const res = await app.inject({
      method: 'GET',
      url: `/api/character/${id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { character: { name: string } }).character.name).toBe('Pip')
  })

  it('returns 404 when the caller is not the owner', async () => {
    const tokenA = await registerAndGetToken('test_owner')
    const created = await app.inject({
      method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: 'Owned', classId: 'berserk' },
    })
    const id = (created.json() as { character: { id: string } }).character.id

    const tokenB = await registerAndGetToken('test_stranger')
    const res = await app.inject({
      method: 'GET',
      url: `/api/character/${id}`,
      headers: { authorization: `Bearer ${tokenB}` },
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

describe('POST /api/character slot cap', () => {
  it(`returns 409 once the user reaches the ${CHARACTER_SLOT_LIMIT}-character cap`, async () => {
    const token = await registerAndGetToken('test_capcap')
    for (let i = 0; i < CHARACTER_SLOT_LIMIT; i++) {
      const r = await app.inject({
        method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${token}` },
        payload: { name: `C${i}`, classId: 'berserk' },
      })
      expect(r.statusCode).toBe(201)
    }
    const overflow = await app.inject({
      method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${token}` },
      payload: { name: 'OneTooMany', classId: 'berserk' },
    })
    expect(overflow.statusCode).toBe(409)
  })
})

describe('PUT /api/character/:id (Slice 16 by-id save)', () => {
  it('updates fields + replaces inventory + persists transcended flag', async () => {
    const token = await registerAndGetToken('test_gina')
    const created = await app.inject({
      method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Gina', classId: 'assassin' },
    })
    const id = (created.json() as { character: { id: string } }).character.id

    const update = fullSaveBody({
      lv: 5, exp: 12, gold: 250,
      hp: 120, maxHp: 150, mp: 40, maxMp: 60,
      atk: 30, def: 18, spd: 20,
      map: 'sakura', px: 3, py: 7, steps: 42,
      equipWeapon: 'sword-1',
      plus: { 'sword-1_w': 2 },
      inventory: { 'potion-s': 1, 'silk': 4 },
      transcended: true,
    })
    const res = await app.inject({
      method: 'PUT',
      url: `/api/character/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: update,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { character: Record<string, unknown> }
    expect(body.character).toMatchObject({
      ...update,
      // Slice 26: classId is always STARTER_CLASS (= 'adventurer') after
      // creation. The `assassin` in the POST payload is ignored.
      name: 'Gina', raceId: STARTER_RACE.id, classId: 'adventurer',
    })

    const verify = await app.inject({
      method: 'GET', url: `/api/character/${id}`, headers: { authorization: `Bearer ${token}` },
    })
    const verified = (verify.json() as { character: { inventory: Record<string, number>; transcended: boolean } }).character
    expect(verified.inventory).toEqual({ 'potion-s': 1, 'silk': 4 })
    expect(verified.transcended).toBe(true)
  })

  // Slice 38: optimistic concurrency. expectedUpdatedAt is the row's
  // `updatedAt` from the client's last read; mismatch ⇒ 409 + current row.
  it('rejects a stale PUT with 409 + current character when expectedUpdatedAt is older', async () => {
    const token = await registerAndGetToken('test_stale_put')
    const created = await app.inject({
      method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Sten' },
    })
    const c0 = (created.json() as { character: { id: string; updatedAt: string } }).character
    expect(typeof c0.updatedAt).toBe('string')

    // Simulate an admin/other-tab write that bumped updatedAt + added an
    // item between the client's read and the client's save.
    await new Promise((r) => setTimeout(r, 5))
    await prisma.character.update({
      where: { id: c0.id },
      data: { gold: 999 },
    })
    await prisma.inventoryItem.create({
      data: { characterId: c0.id, itemKey: 'sword-1', qty: 1 },
    })

    const res = await app.inject({
      method: 'PUT',
      url: `/api/character/${c0.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: fullSaveBody({ expectedUpdatedAt: c0.updatedAt, gold: 50, inventory: {} }),
    })
    expect(res.statusCode).toBe(409)
    const body = res.json() as { error: string; character: { gold: number; inventory: Record<string, number>; updatedAt: string } }
    expect(body.error).toBe('stale')
    // Server hands back the *current* state so the client can merge + retry.
    expect(body.character.gold).toBe(999)
    expect(body.character.inventory).toEqual({ 'potion-s': 3, 'sword-1': 1 })
    expect(body.character.updatedAt).not.toBe(c0.updatedAt)
  })

  it('accepts a PUT when expectedUpdatedAt matches the row', async () => {
    const token = await registerAndGetToken('test_fresh_put')
    const created = await app.inject({
      method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Fr' },
    })
    const c0 = (created.json() as { character: { id: string; updatedAt: string } }).character

    const res = await app.inject({
      method: 'PUT',
      url: `/api/character/${c0.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: fullSaveBody({ expectedUpdatedAt: c0.updatedAt, gold: 250 }),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { character: { gold: number; updatedAt: string } }
    expect(body.character.gold).toBe(250)
    // updatedAt advances after a successful write.
    expect(body.character.updatedAt).not.toBe(c0.updatedAt)
  })

  it('accepts a PUT that omits expectedUpdatedAt (back-compat for older clients)', async () => {
    const token = await registerAndGetToken('test_nover_put')
    const created = await app.inject({
      method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Nv' },
    })
    const id = (created.json() as { character: { id: string } }).character.id
    const res = await app.inject({
      method: 'PUT',
      url: `/api/character/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: fullSaveBody({ gold: 77 }), // no expectedUpdatedAt
    })
    expect(res.statusCode).toBe(200)
  })

  it("returns 404 when trying to PUT another user's character", async () => {
    const tokenA = await registerAndGetToken('test_user_a')
    const created = await app.inject({
      method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: 'A', classId: 'berserk' },
    })
    const id = (created.json() as { character: { id: string } }).character.id
    const tokenB = await registerAndGetToken('test_user_b')

    const res = await app.inject({
      method: 'PUT',
      url: `/api/character/${id}`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: fullSaveBody(),
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('PUT /api/character (legacy first-char save)', () => {
  it('updates the first character + persists transcended flag', async () => {
    const token = await registerAndGetToken('test_legacy_put')
    await app.inject({
      method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${token}` },
      payload: { name: 'L', classId: 'shaman' },
    })

    const res = await app.inject({
      method: 'PUT', url: '/api/character', headers: { authorization: `Bearer ${token}` },
      payload: fullSaveBody({ lv: 3, exp: 5, transcended: false }),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { character: { lv: number } }
    expect(body.character.lv).toBe(3)
  })

  it('returns 404 when the user has no character', async () => {
    const token = await registerAndGetToken('test_hugh')
    const res = await app.inject({
      method: 'PUT', url: '/api/character', headers: { authorization: `Bearer ${token}` },
      payload: fullSaveBody(),
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/character/:id/transcend (Slice 17 race-change)', () => {
  async function makeCharAtLv(token: string, name: string, lv: number) {
    const created = await app.inject({
      method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${token}` },
      payload: { name, classId: 'berserk' },
    })
    const id = (created.json() as { character: { id: string } }).character.id
    if (lv > 1) {
      await app.inject({
        method: 'PUT', url: `/api/character/${id}`, headers: { authorization: `Bearer ${token}` },
        payload: fullSaveBody({ lv }),
      })
    }
    return id
  }

  it('flips raceId + transcended=true when called at the threshold lv', async () => {
    const token = await registerAndGetToken('test_trans_ok')
    const id = await makeCharAtLv(token, 'TransOK', TRANSCEND_LV)
    const res = await app.inject({
      method: 'POST', url: `/api/character/${id}/transcend`,
      headers: { authorization: `Bearer ${token}` },
      payload: { raceId: 'mara' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { character: { raceId: string; transcended: boolean } }
    expect(body.character.raceId).toBe('mara')
    expect(body.character.transcended).toBe(true)
  })

  it('Slice 25 + 27 — stat-shift plumbing still works; current race modifiers are all {} so no change', async () => {
    // Slice 27: race no longer carries stat modifiers (all races = {}).
    // The shiftRaceModifierDiff plumbing still runs on transcend but
    // produces zero diff, so primary stats stay exactly as they were.
    // (If we ever re-introduce race modifiers, this test should be
    // updated to assert the new numbers.)
    const token = await registerAndGetToken('test_trans_shift')
    const id = await makeCharAtLv(token, 'Shifty', TRANSCEND_LV)
    const res = await app.inject({
      method: 'POST', url: `/api/character/${id}/transcend`,
      headers: { authorization: `Bearer ${token}` },
      payload: { raceId: 'mara' },
    })
    expect(res.statusCode).toBe(200)
    const c = (res.json() as { character: Record<string, number> }).character
    expect(c.str).toBe(10)
    expect(c.vit).toBe(10)
    expect(c.int).toBe(10)
    expect(c.luk).toBe(10)
    expect(c.dex).toBe(10)
    expect(c.agi).toBe(10)
  })

  it('rejects under-lv', async () => {
    const token = await registerAndGetToken('test_trans_under')
    const id = await makeCharAtLv(token, 'Young', TRANSCEND_LV - 1)
    const res = await app.inject({
      method: 'POST', url: `/api/character/${id}/transcend`,
      headers: { authorization: `Bearer ${token}` },
      payload: { raceId: 'god' },
    })
    expect(res.statusCode).toBe(409)
  })

  it('rejects a second transcend attempt', async () => {
    const token = await registerAndGetToken('test_trans_twice')
    const id = await makeCharAtLv(token, 'Twice', TRANSCEND_LV)
    await app.inject({
      method: 'POST', url: `/api/character/${id}/transcend`,
      headers: { authorization: `Bearer ${token}` },
      payload: { raceId: 'mara' },
    })
    const second = await app.inject({
      method: 'POST', url: `/api/character/${id}/transcend`,
      headers: { authorization: `Bearer ${token}` },
      payload: { raceId: 'god' },
    })
    expect(second.statusCode).toBe(409)
  })

  it('rejects a race that is not in AVAILABLE_RACES (deprecated or unknown)', async () => {
    const token = await registerAndGetToken('test_trans_bad')
    const id = await makeCharAtLv(token, 'Bad', TRANSCEND_LV)
    const res = await app.inject({
      method: 'POST', url: `/api/character/${id}/transcend`,
      headers: { authorization: `Bearer ${token}` },
      payload: { raceId: 'angel' },   // legacy, marked available=false
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /api/character/:id/change-class (Slice 26 + 27 endgame class quest)', () => {
  // Slice 27 raised CLASS_CHANGE_LV to 120 and gated each class behind a
  // race. Test helper sets up the character at the required lv + race
  // + classChanged: false so the endpoint is reachable.
  async function makeReadyCharAt(token: string, name: string, raceId: string, lv = 120) {
    const created = await app.inject({
      method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${token}` },
      payload: { name },
    })
    const id = (created.json() as { character: { id: string } }).character.id
    await app.inject({
      method: 'PUT', url: `/api/character/${id}`, headers: { authorization: `Bearer ${token}` },
      payload: fullSaveBody({ lv, classChanged: false }),
    })
    // Force raceId via direct DB write (skips the transcend route's lv
    // gate which would also block us if used here).
    await prisma.character.update({ where: { id }, data: { raceId, transcended: true } })
    return id
  }

  it('flips classId + classChanged=true at Lv 120 for a race-matched class', async () => {
    const token = await registerAndGetToken('test_cc_ok')
    const id = await makeReadyCharAt(token, 'CC', 'mara')
    const res = await app.inject({
      method: 'POST', url: `/api/character/${id}/change-class`,
      headers: { authorization: `Bearer ${token}` },
      payload: { classId: 'shaman' },  // shaman.requiredRaceId === 'mara' ✓
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { character: { classId: string; classChanged: boolean } }
    expect(body.character.classId).toBe('shaman')
    expect(body.character.classChanged).toBe(true)
  })

  it('rejects class whose requiredRaceId does not match the player race', async () => {
    // Slice 27: a มาร character can't pick warrior (a human class).
    const token = await registerAndGetToken('test_cc_wrong_race')
    const id = await makeReadyCharAt(token, 'Wrong', 'mara')
    const res = await app.inject({
      method: 'POST', url: `/api/character/${id}/change-class`,
      headers: { authorization: `Bearer ${token}` },
      payload: { classId: 'warrior' },  // warrior is human-only
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects below-threshold lv (must be Lv 120+)', async () => {
    const token = await registerAndGetToken('test_cc_under')
    const id = await makeReadyCharAt(token, 'Young', 'mara', /* lv */ 50)
    const res = await app.inject({
      method: 'POST', url: `/api/character/${id}/change-class`,
      headers: { authorization: `Bearer ${token}` },
      payload: { classId: 'shaman' },
    })
    expect(res.statusCode).toBe(409)
  })

  it('rejects a second change-class attempt', async () => {
    const token = await registerAndGetToken('test_cc_twice')
    const id = await makeReadyCharAt(token, 'Twice', 'mara')
    await app.inject({
      method: 'POST', url: `/api/character/${id}/change-class`,
      headers: { authorization: `Bearer ${token}` },
      payload: { classId: 'assassin' },
    })
    const second = await app.inject({
      method: 'POST', url: `/api/character/${id}/change-class`,
      headers: { authorization: `Bearer ${token}` },
      payload: { classId: 'shaman' },
    })
    expect(second.statusCode).toBe(409)
  })

  it('rejects starter class as the picked class (must be an advanced class)', async () => {
    const token = await registerAndGetToken('test_cc_bad')
    const id = await makeReadyCharAt(token, 'Bad', 'mara')
    const res = await app.inject({
      method: 'POST', url: `/api/character/${id}/change-class`,
      headers: { authorization: `Bearer ${token}` },
      payload: { classId: 'adventurer' },  // not in AVAILABLE_CLASSES
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /api/character/:id/allocate (Slice 23 stat points)', () => {
  async function makeCharWithPoints(token: string, name: string, points: number) {
    const created = await app.inject({
      method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${token}` },
      payload: { name, classId: 'berserk' },
    })
    const id = (created.json() as { character: { id: string } }).character.id
    // PUT some unspent points onto the char (fixture path).
    await app.inject({
      method: 'PUT', url: `/api/character/${id}`, headers: { authorization: `Bearer ${token}` },
      payload: fullSaveBody({ unspentPoints: points }),
    })
    return id
  }

  it('spends points on the chosen stat and updates derived columns', async () => {
    const token = await registerAndGetToken('test_alloc_ok')
    const id = await makeCharWithPoints(token, 'A', 10)
    const res = await app.inject({
      method: 'POST', url: `/api/character/${id}/allocate`,
      headers: { authorization: `Bearer ${token}` },
      payload: { stat: 'str', amount: 5 },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { character: { str: number; unspentPoints: number; atk: number } }
    expect(body.character.str).toBe(15)        // 10 base + 5
    expect(body.character.unspentPoints).toBe(5) // 10 - 5
    // pAtk should reflect the +10 from STR
    expect(body.character.atk).toBeGreaterThan(11)
  })

  it('rejects insufficient points', async () => {
    const token = await registerAndGetToken('test_alloc_low')
    const id = await makeCharWithPoints(token, 'B', 2)
    const res = await app.inject({
      method: 'POST', url: `/api/character/${id}/allocate`,
      headers: { authorization: `Bearer ${token}` },
      payload: { stat: 'str', amount: 5 },
    })
    expect(res.statusCode).toBe(400)
    expect((res.json() as { error: string }).error).toBe('insufficient-points')
  })

  it("returns 404 when allocating on another user's character", async () => {
    const tokenA = await registerAndGetToken('test_alloc_a')
    const id = await makeCharWithPoints(tokenA, 'AA', 5)
    const tokenB = await registerAndGetToken('test_alloc_b')
    const res = await app.inject({
      method: 'POST', url: `/api/character/${id}/allocate`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { stat: 'str', amount: 1 },
    })
    expect(res.statusCode).toBe(404)
  })

  it('rejects invalid stat name', async () => {
    const token = await registerAndGetToken('test_alloc_bad_stat')
    const id = await makeCharWithPoints(token, 'C', 5)
    const res = await app.inject({
      method: 'POST', url: `/api/character/${id}/allocate`,
      headers: { authorization: `Bearer ${token}` },
      payload: { stat: 'foo', amount: 1 },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /api/character/:id/reset-stats (Slice 23 reset)', () => {
  it('refunds the entire pool and resets every primary stat to 10', async () => {
    const token = await registerAndGetToken('test_reset_ok')
    const created = await app.inject({
      method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${token}` },
      payload: { name: 'R', classId: 'berserk' },
    })
    const id = (created.json() as { character: { id: string } }).character.id
    // PUT to Lv 5 with str/vit spent.
    await app.inject({
      method: 'PUT', url: `/api/character/${id}`, headers: { authorization: `Bearer ${token}` },
      payload: fullSaveBody({ lv: 5, str: 25, vit: 15, unspentPoints: 0 }),
    })

    const res = await app.inject({
      method: 'POST', url: `/api/character/${id}/reset-stats`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { character: { str: number; vit: number; unspentPoints: number } }
    expect(body.character.str).toBe(10)
    expect(body.character.vit).toBe(10)
    // Lv 5 → (5-1) × 5 = 20 refunded
    expect(body.character.unspentPoints).toBe(20)
  })
})

// ─── Slice 39 — equip/unequip intent endpoints ────────────────────────────
describe('POST /api/character/:id/equip', () => {
  async function createCharWithItem(token: string, name: string, itemKey: string, qty = 1): Promise<string> {
    const created = await app.inject({
      method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${token}` },
      payload: { name },
    })
    const id = (created.json() as { character: { id: string } }).character.id
    await prisma.inventoryItem.upsert({
      where: { characterId_itemKey: { characterId: id, itemKey } },
      create: { characterId: id, itemKey, qty },
      update: { qty },
    })
    return id
  }

  it('equips a weapon the player owns and bumps derived atk', async () => {
    const token = await registerAndGetToken('test_equip_ok')
    const id = await createCharWithItem(token, 'Eq', 'sword-1')
    const before = await app.inject({
      method: 'GET', url: `/api/character/${id}`, headers: { authorization: `Bearer ${token}` },
    })
    const atkBefore = (before.json() as { character: { atk: number } }).character.atk

    const res = await app.inject({
      method: 'POST', url: `/api/character/${id}/equip`,
      headers: { authorization: `Bearer ${token}` },
      payload: { itemKey: 'sword-1' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { character: { equipWeapon: string | null; atk: number; inventory: Record<string, number> } }
    expect(body.character.equipWeapon).toBe('sword-1')
    // Item is a pointer — still in bag (Slice 36 model).
    expect(body.character.inventory['sword-1']).toBe(1)
    expect(body.character.atk).toBeGreaterThan(atkBefore)
  })

  it('rejects equipping an item the player does not own (409)', async () => {
    const token = await registerAndGetToken('test_equip_unowned')
    const created = await app.inject({
      method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${token}` },
      payload: { name: 'X' },
    })
    const id = (created.json() as { character: { id: string } }).character.id
    const res = await app.inject({
      method: 'POST', url: `/api/character/${id}/equip`,
      headers: { authorization: `Bearer ${token}` },
      payload: { itemKey: 'sword-1' },
    })
    expect(res.statusCode).toBe(409)
  })

  it('rejects equipping a non-equip item (potion) with 400', async () => {
    const token = await registerAndGetToken('test_equip_potion')
    const id = await createCharWithItem(token, 'P', 'potion-s', 5)
    const res = await app.inject({
      method: 'POST', url: `/api/character/${id}/equip`,
      headers: { authorization: `Bearer ${token}` },
      payload: { itemKey: 'potion-s' },
    })
    expect(res.statusCode).toBe(400)
  })

  it("returns 404 when equipping on another user's character", async () => {
    const tokenA = await registerAndGetToken('test_equip_a')
    const id = await createCharWithItem(tokenA, 'A', 'sword-1')
    const tokenB = await registerAndGetToken('test_equip_b')
    const res = await app.inject({
      method: 'POST', url: `/api/character/${id}/equip`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { itemKey: 'sword-1' },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/character/:id/unequip', () => {
  it('clears the requested slot and item stays in inventory', async () => {
    const token = await registerAndGetToken('test_unequip_ok')
    const created = await app.inject({
      method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${token}` },
      payload: { name: 'U' },
    })
    const id = (created.json() as { character: { id: string } }).character.id
    await prisma.inventoryItem.create({ data: { characterId: id, itemKey: 'sword-1', qty: 1 } })
    await app.inject({
      method: 'POST', url: `/api/character/${id}/equip`,
      headers: { authorization: `Bearer ${token}` },
      payload: { itemKey: 'sword-1' },
    })
    const res = await app.inject({
      method: 'POST', url: `/api/character/${id}/unequip`,
      headers: { authorization: `Bearer ${token}` },
      payload: { slot: 'weapon' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { character: { equipWeapon: string | null; inventory: Record<string, number> } }
    expect(body.character.equipWeapon).toBeNull()
    expect(body.character.inventory['sword-1']).toBe(1) // pointer cleared, item kept
  })

  it('safety: unequipping an admin-assigned slot without inventory row re-adds 1', async () => {
    const token = await registerAndGetToken('test_unequip_safety')
    const created = await app.inject({
      method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${token}` },
      payload: { name: 'S' },
    })
    const id = (created.json() as { character: { id: string } }).character.id
    // Simulate admin setting equipWeapon without adding to inventory.
    await prisma.character.update({
      where: { id },
      data: { equipWeapon: 'sword-1' },
    })

    const res = await app.inject({
      method: 'POST', url: `/api/character/${id}/unequip`,
      headers: { authorization: `Bearer ${token}` },
      payload: { slot: 'weapon' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { character: { equipWeapon: string | null; inventory: Record<string, number> } }
    expect(body.character.equipWeapon).toBeNull()
    expect(body.character.inventory['sword-1']).toBe(1) // safety top-up
  })

  it('no-op when the slot is already empty', async () => {
    const token = await registerAndGetToken('test_unequip_empty')
    const created = await app.inject({
      method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${token}` },
      payload: { name: 'E' },
    })
    const id = (created.json() as { character: { id: string } }).character.id
    const res = await app.inject({
      method: 'POST', url: `/api/character/${id}/unequip`,
      headers: { authorization: `Bearer ${token}` },
      payload: { slot: 'armor' },
    })
    expect(res.statusCode).toBe(200)
  })
})

describe('DELETE /api/character/:id (Slice 16 slot reclaim)', () => {
  it('removes the character so the slot can be reused', async () => {
    const token = await registerAndGetToken('test_del')
    const created = await app.inject({
      method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Doomed', classId: 'berserk' },
    })
    const id = (created.json() as { character: { id: string } }).character.id

    const del = await app.inject({
      method: 'DELETE', url: `/api/character/${id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(del.statusCode).toBe(200)

    const list = await app.inject({
      method: 'GET', url: '/api/characters', headers: { authorization: `Bearer ${token}` },
    })
    expect((list.json() as { characters: unknown[] }).characters).toHaveLength(0)
  })

  it("returns 404 when deleting another user's character", async () => {
    const tokenA = await registerAndGetToken('test_del_owner')
    const created = await app.inject({
      method: 'POST', url: '/api/character', headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: 'Mine', classId: 'berserk' },
    })
    const id = (created.json() as { character: { id: string } }).character.id
    const tokenB = await registerAndGetToken('test_del_attacker')

    const res = await app.inject({
      method: 'DELETE', url: `/api/character/${id}`,
      headers: { authorization: `Bearer ${tokenB}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('CORS preflight for /api/character', () => {
  // Regression guard: @fastify/cors defaults to GET/HEAD/POST only. The
  // browser-side autosave does PUT /api/character — without explicit
  // `methods: [..., 'PUT', ...]` the preflight rejects and saves are silently
  // dropped (the user just sees their character reset on next login).
  it('allows PUT in the preflight Access-Control-Allow-Methods', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/character',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'authorization,content-type',
      },
    })
    expect(res.statusCode).toBeLessThan(300)
    const allowed = res.headers['access-control-allow-methods']
    expect(typeof allowed).toBe('string')
    expect(String(allowed)).toContain('PUT')
    const allowedHeaders = res.headers['access-control-allow-headers']
    expect(String(allowedHeaders).toLowerCase()).toContain('authorization')
  })
})
