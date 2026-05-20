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
  // Tests use the 'test_' prefix on usernames so we can wipe just our rows.
  await prisma.user.deleteMany({ where: { username: { startsWith: 'test_' } } })
})

describe('POST /api/auth/register', () => {
  it('creates a user and returns 201 with a JWT and public user fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'test_alice', password: 'supersecret' },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json() as { token: string; user: { id: string; username: string } }
    expect(body.user.username).toBe('test_alice')
    expect(typeof body.user.id).toBe('string')
    expect(typeof body.token).toBe('string')

    // The password hash must never leak in the response.
    expect(JSON.stringify(body)).not.toMatch(/password|hash/i)

    // Row exists and the stored password is hashed (not equal to the plaintext).
    const row = await prisma.user.findUnique({ where: { username: 'test_alice' } })
    expect(row).not.toBeNull()
    expect(row!.password).not.toBe('supersecret')
  })

  it('rejects a duplicate username with 409', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'test_alice', password: 'supersecret' },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'test_alice', password: 'anothersecret' },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ error: expect.stringMatching(/taken|exists/i) })
  })

  it('returns 400 when the payload fails validation (password too short)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'test_bob', password: 'short' },
    })

    expect(res.statusCode).toBe(400)
    // and nothing got stored
    const row = await prisma.user.findUnique({ where: { username: 'test_bob' } })
    expect(row).toBeNull()
  })
})

describe('POST /api/auth/login', () => {
  async function register(username: string, password: string) {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username, password },
    })
  }

  it('returns 200 + JWT + public user fields on correct credentials', async () => {
    await register('test_carol', 'rightpassword')

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'test_carol', password: 'rightpassword' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { token: string; user: { id: string; username: string } }
    expect(body.user.username).toBe('test_carol')
    expect(typeof body.token).toBe('string')
    expect(JSON.stringify(body)).not.toMatch(/password|hash/i)
  })

  it('returns 401 on wrong password', async () => {
    await register('test_dave', 'rightpassword')

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'test_dave', password: 'wrongpassword' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns 401 on unknown username (does not reveal whether user exists)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'test_nobody', password: 'whatever' },
    })

    expect(res.statusCode).toBe(401)
  })
})
