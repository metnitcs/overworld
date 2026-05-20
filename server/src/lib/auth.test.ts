import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, signToken, verifyToken } from './auth.js'

describe('hashPassword / verifyPassword', () => {
  it('hashes a password to a non-plaintext string that verifies back', async () => {
    const plain = 'correct horse battery staple'
    const hash = await hashPassword(plain)

    expect(hash).not.toBe(plain)
    expect(hash.length).toBeGreaterThan(20)
    expect(await verifyPassword(plain, hash)).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct')
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })
})

describe('signToken / verifyToken', () => {
  const secret = 'test-secret-key'

  it('round-trips a userId payload through a JWT', () => {
    const token = signToken({ userId: 'user_123' }, secret)

    expect(typeof token).toBe('string')
    expect(token.split('.').length).toBe(3) // header.payload.signature

    expect(verifyToken(token, secret)).toEqual({ userId: 'user_123' })
  })

  it('returns null (never throws) when the secret does not match', () => {
    const token = signToken({ userId: 'u' }, secret)

    expect(verifyToken(token, 'other-secret')).toBeNull()
  })

  it('returns null for an expired token', () => {
    // already-expired: expiresIn negative seconds backdates `exp` past now
    const token = signToken({ userId: 'u' }, secret, { expiresIn: -1 })

    expect(verifyToken(token, secret)).toBeNull()
  })

  it('returns null for malformed garbage input', () => {
    expect(verifyToken('not-a-jwt', secret)).toBeNull()
  })
})
