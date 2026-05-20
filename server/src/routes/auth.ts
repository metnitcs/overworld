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
    const user = await app.prisma.user.create({
      data: { username, password: hashed, email },
    })

    const token = signToken({ userId: user.id }, app.jwtSecret)
    return reply.code(201).send({
      token,
      user: { id: user.id, username: user.username },
    })
  })

  app.post('/api/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid input' })
    }
    const { username, password } = parsed.data

    const user = await app.prisma.user.findUnique({ where: { username } })
    // Single 401 for both missing user and bad password — don't leak existence.
    if (!user || !(await verifyPassword(password, user.password))) {
      return reply.code(401).send({ error: 'invalid credentials' })
    }

    const token = signToken({ userId: user.id }, app.jwtSecret)
    return reply.send({
      token,
      user: { id: user.id, username: user.username },
    })
  })
}
