import Fastify, { type FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { registerAuthRoutes } from './routes/auth.js'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
    jwtSecret: string
  }
}

export interface BuildServerOptions {
  prisma: PrismaClient
  jwtSecret: string
}

/** Build a configured Fastify instance with injected dependencies, without
 *  binding a port. Tests drive it via `app.inject(...)`; `index.ts` does
 *  `.listen(...)` for production. */
export function buildServer(opts: BuildServerOptions): FastifyInstance {
  const app = Fastify({ logger: false })

  app.decorate('prisma', opts.prisma)
  app.decorate('jwtSecret', opts.jwtSecret)

  app.get('/health', async () => ({ ok: true, service: 'asura-server' }))

  registerAuthRoutes(app)

  return app
}
