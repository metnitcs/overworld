import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify'
import { verifyToken } from '../lib/auth.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the `requireAuth` preHandler after JWT verification. */
    userId: string
  }
}

/** Build a Fastify preHandler that requires a valid Bearer JWT. On success it
 *  decorates `req.userId`; on failure it replies 401 and the route handler
 *  never runs. The secret is injected so the helper stays pure & testable. */
export function makeRequireAuth(jwtSecret: string): preHandlerHookHandler {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'missing or malformed Authorization header' })
    }
    const token = header.slice('Bearer '.length).trim()
    const payload = verifyToken(token, jwtSecret)
    if (!payload) {
      return reply.code(401).send({ error: 'invalid or expired token' })
    }
    req.userId = payload.userId
  }
}
