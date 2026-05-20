import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

/** Bcrypt cost factor. 10 is the standard dev/prod default. */
const BCRYPT_ROUNDS = 10

/** What we put into and read out of the JWT. Keep it small. */
export interface TokenPayload {
  userId: string
}

export interface SignTokenOptions {
  /** jsonwebtoken expiry format: '7d', '1h', or seconds number. Default '7d'. */
  expiresIn?: jwt.SignOptions['expiresIn']
}

/** Hash a plaintext password using bcrypt. Returns the salted hash. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

/** Verify a plaintext password against a previously stored bcrypt hash. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/** Sign a JWT with the given secret. The secret is injected (not read from
 *  process.env) so the helpers stay pure and testable. */
export function signToken(
  payload: TokenPayload,
  secret: string,
  opts: SignTokenOptions = {},
): string {
  return jwt.sign(payload, secret, { expiresIn: opts.expiresIn ?? '7d' })
}

/** Verify a JWT and return the embedded payload, or null if the token is
 *  invalid (bad signature, expired, malformed, etc.). Never throws. */
export function verifyToken(token: string, secret: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, secret)
    if (typeof decoded === 'object' && decoded !== null && 'userId' in decoded) {
      return { userId: String((decoded as { userId: unknown }).userId) }
    }
    return null
  } catch {
    return null
  }
}
