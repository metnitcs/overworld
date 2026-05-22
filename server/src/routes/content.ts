import type { FastifyInstance } from 'fastify'

/** Public Content endpoint — clients fetch this once on app boot and cache
 *  it in their Zustand store. See ADR 0002. */
export function registerContentRoutes(app: FastifyInstance): void {
  app.get('/api/content', async (_req, reply) => {
    const bundle = await app.contentCache.get()
    return reply.send(bundle)
  })
}
