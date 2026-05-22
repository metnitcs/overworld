import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { verifyToken } from '../lib/auth.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the `requireAuth` preHandler after JWT verification. */
    userId: string
  }
}

/** Build a Fastify preHandler that requires a valid Bearer JWT. On success it
 *  decorates `req.userId`; on failure it replies 401 and the route handler
 *  never runs. The secret is injected so the helper stays pure & testable.
 *
 *  Slice 30: if a `prisma` client is supplied, the handler ALSO checks the
 *  user's account status — SUSPENDED/BANNED accounts get 403 immediately,
 *  even with a valid token. Skipped when prisma is omitted (tests / minimal
 *  setups). */
export function makeRequireAuth(jwtSecret: string, prisma?: PrismaClient): preHandlerHookHandler {
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
    if (prisma) {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId }, select: { status: true },
      })
      if (!user) {
        return reply.code(401).send({ error: 'user not found' })
      }
      if (user.status === 'BANNED') {
        return reply.code(403).send({ error: 'account banned' })
      }
      if (user.status === 'SUSPENDED') {
        return reply.code(403).send({ error: 'account suspended' })
      }
    }
    req.userId = payload.userId
  }
}
