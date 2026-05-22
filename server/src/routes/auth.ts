import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { hashPassword, verifyPassword, signToken } from '../lib/auth.js'

const registerSchema = z.object({
  username: z.string().min(3).max(40),
  password: z.string().min(8).max(200),
  email: z.string().email().optional(),
})

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
})

/** Resolve the role this user should have. ADMIN if the username (case-
 *  insensitive) appears in `app.adminUsers`; otherwise keep `current`.
 *  Pure for testability. */
function resolveRole(
  username: string,
  current: 'USER' | 'ADMIN',
  adminUsers: Set<string>,
): 'USER' | 'ADMIN' {
  if (adminUsers.has(username.toLowerCase())) return 'ADMIN'
  return current
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post('/api/auth/register', async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    }
    const { username, password, email } = parsed.data

    const existing = await app.prisma.user.findUnique({ where: { username } })
    if (existing) {
      return reply.code(409).send({ error: 'username taken' })
    }

    const hashed = await hashPassword(password)
    const role = resolveRole(username, 'USER', app.adminUsers)
    const user = await app.prisma.user.create({
      data: { username, password: hashed, email, role },
    })

    const token = signToken({ userId: user.id }, app.jwtSecret)
    return reply.code(201).send({
      token,
      user: { id: user.id, username: user.username, role: user.role },
    })
  })

  app.post('/api/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid input' })
    }
    const { username, password } = parsed.data

    const user = await app.prisma.user.findUnique({ where: { username } })
    if (!user || !(await verifyPassword(password, user.password))) {
      return reply.code(401).send({ error: 'invalid credentials' })
    }

    // Auto-sync role from ADMIN_USERS env on every login. Cheap and lets you
    // promote/demote without manual SQL.
    const desired = resolveRole(user.username, user.role, app.adminUsers)
    const synced = desired !== user.role
      ? await app.prisma.user.update({ where: { id: user.id }, data: { role: desired } })
      : user

    const token = signToken({ userId: synced.id }, app.jwtSecret)
    return reply.send({
      token,
      user: { id: synced.id, username: synced.username, role: synced.role },
    })
  })

  app.get('/api/me', { preHandler: app.requireAuth }, async (req, reply) => {
    const user = await app.prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, username: true, role: true },
    })
    if (!user) return reply.code(404).send({ error: 'user not found' })
    return reply.send({ user })
  })
}
