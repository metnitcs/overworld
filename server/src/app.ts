import Fastify, { type FastifyInstance, type preHandlerHookHandler } from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import type { PrismaClient } from '@prisma/client'
import { registerAuthRoutes } from './routes/auth.js'
import { registerCharacterRoutes } from './routes/character.js'
import { registerContentRoutes } from './routes/content.js'
import { registerAdminRoutes } from './routes/admin.js'
import { makeRequireAuth } from './plugins/requireAuth.js'
import { makeRequireAdmin } from './plugins/requireAdmin.js'
import { ContentCache } from './lib/contentCache.js'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
    jwtSecret: string
    requireAuth: preHandlerHookHandler
    requireAdmin: preHandlerHookHandler
    contentCache: ContentCache
    /** Usernames auto-promoted to ADMIN on register/login. Lowercased. */
    adminUsers: Set<string>
    /** Slice 21: absolute path to the uploads dir (mirrors fastify-static root). */
    uploadsDir: string
    /** Slice 30: write an audit-log row. Fire-and-forget — errors are
     *  logged but never thrown so a logging failure can't break the
     *  primary mutation. */
    audit: (params: {
      actorUserId: string | null
      action: string
      targetType: string
      targetId?: string | null
      payload?: unknown
    }) => Promise<void>
  }
}

export interface BuildServerOptions {
  prisma: PrismaClient
  jwtSecret: string
  /** Allowed CORS origins. Default `true` (reflect request origin) for tests
   *  and dev; production should pass an explicit array. */
  corsOrigin?: string | string[] | boolean
  /** Comma-separated usernames to auto-promote to ADMIN on register/login.
   *  Tests pass an explicit list; production reads ADMIN_USERS env in index.ts. */
  adminUsers?: string[]
  /** Absolute path where admin-uploaded files are written + served from.
   *  Defaults to `<repo>/server/uploads` in dev. Tests can override to a temp
   *  dir so the test suite doesn't pollute the real folder. */
  uploadsDir?: string
}

/** Build a configured Fastify instance with injected dependencies, without
 *  binding a port. Tests drive it via `app.inject(...)`; `index.ts` does
 *  `.listen(...)` for production. */
export function buildServer(opts: BuildServerOptions): FastifyInstance {
  const app = Fastify({ logger: false })

  app.register(cors, {
    origin: opts.corsOrigin ?? true,
    credentials: true,
    // @fastify/cors defaults to GET/HEAD/POST only; we need PUT for the
    // character autosave (and DELETE for any future content admin routes).
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })

  // Slice 21: admin file uploads. Multipart parser + a static mount at
  // /uploads/* that serves whatever ends up in server/uploads/. The dir is
  // created on demand so a fresh checkout doesn't 500 on first upload.
  app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5 MB per file — bg art usually <1 MB
      files: 1,
    },
  })
  const uploadsDir = opts.uploadsDir
    ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'uploads')
  fs.mkdirSync(path.join(uploadsDir, 'maps'), { recursive: true })
  app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: '/uploads/',
    decorateReply: false,
  })

  const adminUsers = new Set(
    (opts.adminUsers ?? []).map((u) => u.trim().toLowerCase()).filter(Boolean),
  )

  app.decorate('prisma', opts.prisma)
  app.decorate('jwtSecret', opts.jwtSecret)
  app.decorate('adminUsers', adminUsers)
  app.decorate('uploadsDir', uploadsDir)
  // Slice 30: audit decorator. Best-effort — if the insert fails we log
  // to console but never throw, so a busted audit table can't take down
  // the primary mutation. payload is normalised to a JSON-safe object.
  app.decorate('audit', async ({ actorUserId, action, targetType, targetId, payload }) => {
    try {
      await opts.prisma.auditLog.create({
        data: {
          actorUserId: actorUserId ?? null,
          action,
          targetType,
          targetId: targetId ?? null,
          payload: payload === undefined ? null : JSON.parse(JSON.stringify(payload)),
        },
      })
    } catch (err) {
      app.log.warn({ err, action, targetType, targetId }, 'audit log insert failed')
    }
  })
  app.decorate('requireAuth', makeRequireAuth(opts.jwtSecret, opts.prisma))
  app.decorate('requireAdmin', makeRequireAdmin(opts.jwtSecret, opts.prisma))
  app.decorate('contentCache', new ContentCache(opts.prisma))

  app.get('/health', async () => ({ ok: true, service: 'asura-server' }))

  registerAuthRoutes(app)
  registerCharacterRoutes(app)
  registerContentRoutes(app)
  registerAdminRoutes(app)

  return app
}
