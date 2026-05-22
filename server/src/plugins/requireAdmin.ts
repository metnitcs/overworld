import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { verifyToken } from '../lib/auth.js'

/** preHandler that requires a valid Bearer JWT AND that the user has
 *  role === 'ADMIN' in the database. Decorates `req.userId` like requireAuth.
 *  Replies 401 for missing/invalid token and 403 for non-admin users. */
export function makeRequireAdmin(
  jwtSecret: string,
  prisma: PrismaClient,
): preHandlerHookHandler {
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
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { role: true },
    })
    if (!user || user.role !== 'ADMIN') {
      return reply.code(403).send({ error: 'admin only' })
    }
    req.userId = payload.userId
  }
}
