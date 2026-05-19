import Fastify, { type FastifyInstance } from 'fastify'

/** Build a configured Fastify instance without binding a port, so tests can
 *  drive it via `app.inject(...)` and production can `.listen(...)`. */
export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false })

  app.get('/health', async () => ({ ok: true, service: 'asura-server' }))

  return app
}
