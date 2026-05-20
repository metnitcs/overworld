import Fastify, { type FastifyInstance, type preHandlerHookHandler } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { registerAuthRoutes } from './routes/auth.js'
import { registerCharacterRoutes } from './routes/character.js'
import { makeRequireAuth } from './plugins/requireAuth.js'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
    jwtSecret: string
    requireAuth: preHandlerHookHandler
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
  app.decorate('requireAuth', makeRequireAuth(opts.jwtSecret))

  app.get('/health', async () => ({ ok: true, service: 'asura-server' }))

  registerAuthRoutes(app)
  registerCharacterRoutes(app)

  return app
}
