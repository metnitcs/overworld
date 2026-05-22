import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { pipeline } from 'node:stream/promises'

// ─── Schemas ──────────────────────────────────────────────────────────────

const itemTypeEnum = z.enum(['mat', 'consume', 'weapon', 'armor'])
const rarityEnum = z.enum(['common', 'rare', 'epic', 'legendary'])
const monsterRankEnum = z.enum(['normal', 'elite', 'boss'])

const itemBody = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
  type: itemTypeEnum,
  rarity: rarityEnum.optional().default('common'),
  atk: z.number().int().nullable().optional(),
  def: z.number().int().nullable().optional(),
  matk: z.number().int().nullable().optional(),
  heal: z.number().int().nullable().optional(),
  healMp: z.number().int().nullable().optional(),
  desc: z.string(),
})

const itemCreateBody = itemBody.extend({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'lowercase-kebab-case only'),
})

const dropEntry = z.object({
  item: z.string(),
  chance: z.number().min(0).max(1),
  minQty: z.number().int().min(1).default(1),
  maxQty: z.number().int().min(1).default(1),
})

const monsterBody = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
  rank: monsterRankEnum.optional().default('normal'),
  lv: z.number().int().min(1),
  hp: z.number().int().min(1),
  atk: z.number().int().min(0),
  def: z.number().int().min(0),
  spd: z.number().int().min(0),
  exp: z.number().int().min(0),
  gold: z.number().int().min(0),
  drops: z.array(dropEntry).optional().default([]),
})

const monsterCreateBody = monsterBody.extend({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'lowercase-kebab-case only'),
})

// Tile shape — must match shared TileDef. We don't import Zod across the
// workspace boundary, so duplicate the rule definition here.
const tileSchema = z.object({
  glyph: z.string().optional(),
  walkable: z.boolean(),
  kind: z.enum(['shop', 'healer', 'quest', 'warp']).optional(),
})

const mapMonsterEntry = z.object({
  monsterId: z.string(),
  spawnWeight: z.number().int().min(1).default(1),
})

const warpEntry = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  toMapId: z.string().min(1),
  tx: z.number().int().min(0),
  ty: z.number().int().min(0),
  label: z.string().nullable().optional(),
})

const mapBody = z.object({
  name: z.string().min(1),
  minLv: z.number().int().min(1),
  maxLv: z.number().int().min(1),
  w: z.number().int().min(3).max(60),
  h: z.number().int().min(3).max(40),
  bg: z.string().min(1),
  bgImage: z.string().nullable().optional(),
  pathColor: z.string().nullable().optional(),
  monsterCount: z.number().int().min(0).max(50),
  layout: z.array(z.array(tileSchema)),
  monsters: z.array(mapMonsterEntry).default([]),
  warps: z.array(warpEntry).default([]),
})

const mapCreateBody = mapBody.extend({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'lowercase-kebab-case only'),
})

// ─── Slice 28: Race + CharClass schemas ─────────────────────────────
const statModifierSchema = z.object({
  str: z.number().int().optional(),
  int: z.number().int().optional(),
  dex: z.number().int().optional(),
  agi: z.number().int().optional(),
  luk: z.number().int().optional(),
  vit: z.number().int().optional(),
})

const raceBody = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
  desc: z.string(),
  modifiers: statModifierSchema,
  available: z.boolean().optional().default(true),
  starter: z.boolean().optional().default(false),
})

const raceCreateBody = raceBody.extend({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'lowercase-kebab-case only'),
})

const skillSchema = z.object({
  name: z.string(),
  mp: z.number().int().min(0),
  mult: z.number(),
  type: z.enum(['phys', 'magic', 'heal', 'holy']),
})

const classBody = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
  desc: z.string(),
  growth: statModifierSchema,
  skill: skillSchema,
  starter: z.boolean().optional().default(false),
  available: z.boolean().optional().default(true),
  requiredRaceId: z.string().nullable().optional(),
})

const classCreateBody = classBody.extend({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'lowercase-kebab-case only'),
})

const characterPatch = z.object({
  lv: z.number().int().min(1).optional(),
  exp: z.number().int().min(0).optional(),
  gold: z.number().int().min(0).optional(),
  hp: z.number().int().min(0).optional(),
  maxHp: z.number().int().min(1).optional(),
  mp: z.number().int().min(0).optional(),
  maxMp: z.number().int().min(0).optional(),
  atk: z.number().int().min(0).optional(),
  def: z.number().int().min(0).optional(),
  spd: z.number().int().min(0).optional(),
  mapId: z.string().optional(),
})

// ─── Routes ──────────────────────────────────────────────────────────────

export function registerAdminRoutes(app: FastifyInstance): void {
  const guard = { preHandler: app.requireAdmin }

  // ── Items ──
  app.get('/api/admin/items', guard, async (_req, reply) => {
    const items = await app.prisma.item.findMany({ orderBy: { id: 'asc' } })
    return reply.send({ items })
  })

  app.post('/api/admin/items', guard, async (req, reply) => {
    const parsed = itemCreateBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    const exists = await app.prisma.item.findUnique({ where: { id: parsed.data.id } })
    if (exists) return reply.code(409).send({ error: 'item id already exists' })
    const created = await app.prisma.item.create({ data: parsed.data })
    app.contentCache.invalidate()
    return reply.code(201).send({ item: created })
  })

  app.put('/api/admin/items/:id', guard, async (req, reply) => {
    const parsed = itemBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    const { id } = req.params as { id: string }
    const exists = await app.prisma.item.findUnique({ where: { id } })
    if (!exists) return reply.code(404).send({ error: 'item not found' })
    const updated = await app.prisma.item.update({ where: { id }, data: parsed.data })
    app.contentCache.invalidate()
    return reply.send({ item: updated })
  })

  app.delete('/api/admin/items/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string }
    const exists = await app.prisma.item.findUnique({ where: { id } })
    if (!exists) return reply.code(404).send({ error: 'item not found' })
    try {
      await app.prisma.item.delete({ where: { id } })
    } catch {
      return reply.code(409).send({ error: 'item is referenced by other rows (drops/shop/recipe)' })
    }
    app.contentCache.invalidate()
    return reply.send({ ok: true })
  })

  // ── Monsters ──
  app.get('/api/admin/monsters', guard, async (_req, reply) => {
    const monsters = await app.prisma.monster.findMany({
      include: { drops: true },
      orderBy: { id: 'asc' },
    })
    return reply.send({ monsters })
  })

  app.post('/api/admin/monsters', guard, async (req, reply) => {
    const parsed = monsterCreateBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    const exists = await app.prisma.monster.findUnique({ where: { id: parsed.data.id } })
    if (exists) return reply.code(409).send({ error: 'monster id already exists' })
    const { drops, ...rest } = parsed.data
    const created = await app.prisma.monster.create({
      data: {
        ...rest,
        drops: { create: drops.map((d) => ({
          itemId: d.item, chance: d.chance, minQty: d.minQty, maxQty: d.maxQty,
        })) },
      },
      include: { drops: true },
    })
    app.contentCache.invalidate()
    return reply.code(201).send({ monster: created })
  })

  app.put('/api/admin/monsters/:id', guard, async (req, reply) => {
    const parsed = monsterBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    const { id } = req.params as { id: string }
    const exists = await app.prisma.monster.findUnique({ where: { id } })
    if (!exists) return reply.code(404).send({ error: 'monster not found' })

    const { drops, ...rest } = parsed.data
    const updated = await app.prisma.$transaction(async (tx) => {
      await tx.monster.update({ where: { id }, data: rest })
      await tx.monsterDrop.deleteMany({ where: { monsterId: id } })
      if (drops.length > 0) {
        await tx.monsterDrop.createMany({
          data: drops.map((d) => ({
            monsterId: id, itemId: d.item,
            chance: d.chance, minQty: d.minQty, maxQty: d.maxQty,
          })),
        })
      }
      return tx.monster.findUniqueOrThrow({ where: { id }, include: { drops: true } })
    })
    app.contentCache.invalidate()
    return reply.send({ monster: updated })
  })

  app.delete('/api/admin/monsters/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string }
    const exists = await app.prisma.monster.findUnique({ where: { id } })
    if (!exists) return reply.code(404).send({ error: 'monster not found' })
    try {
      await app.prisma.monster.delete({ where: { id } })
    } catch {
      return reply.code(409).send({ error: 'monster is referenced by other rows' })
    }
    app.contentCache.invalidate()
    return reply.send({ ok: true })
  })

  // ── Maps ──
  app.get('/api/admin/maps', guard, async (_req, reply) => {
    const maps = await app.prisma.map.findMany({
      include: { monsters: true, warpsFrom: true },
      orderBy: { id: 'asc' },
    })
    // Slice 22: expose outgoing warps under a stable `warps` key (matches
    // the body shape on PUT/POST). The DB relation is named `warpsFrom`
    // because of the dual-FK on Warp; we don't want to leak that detail.
    return reply.send({
      maps: maps.map(({ warpsFrom, ...rest }) => ({
        ...rest,
        warps: warpsFrom.map((w) => ({
          x: w.x, y: w.y, toMapId: w.toMapId, tx: w.tx, ty: w.ty, label: w.label,
        })),
      })),
    })
  })

  app.post('/api/admin/maps', guard, async (req, reply) => {
    const parsed = mapCreateBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    const data = parsed.data
    // Validate dimensions match layout grid.
    if (data.layout.length !== data.h || data.layout.some((row) => row.length !== data.w)) {
      return reply.code(400).send({ error: 'layout dimensions do not match w/h' })
    }
    // Validate every referenced monsterId actually exists.
    if (data.monsters.length > 0) {
      const ids = data.monsters.map((m) => m.monsterId)
      const found = await app.prisma.monster.findMany({
        where: { id: { in: ids } }, select: { id: true },
      })
      if (found.length !== new Set(ids).size) {
        return reply.code(400).send({ error: 'one or more monsterIds do not exist' })
      }
    }
    const exists = await app.prisma.map.findUnique({ where: { id: data.id } })
    if (exists) return reply.code(409).send({ error: 'map id already exists' })

    // Validate every warp targets a map that exists (or this map itself,
    // since we may be creating that right now).
    if (data.warps.length > 0) {
      const targetIds = [...new Set(data.warps.map((w) => w.toMapId))]
      const others = targetIds.filter((id) => id !== data.id)
      if (others.length > 0) {
        const found = await app.prisma.map.findMany({
          where: { id: { in: others } }, select: { id: true },
        })
        if (found.length !== others.length) {
          return reply.code(400).send({ error: 'one or more warp toMapId do not exist' })
        }
      }
    }

    const { monsters, layout, id, warps, ...rest } = data
    const created = await app.prisma.map.create({
      data: {
        id,
        ...rest,
        bgImage: rest.bgImage ?? null,
        pathColor: rest.pathColor ?? null,
        layout: layout as unknown as object,
        monsters: { create: monsters.map((m) => ({
          monsterId: m.monsterId, spawnWeight: m.spawnWeight,
        })) },
        warpsFrom: { create: warps.map((w) => ({
          x: w.x, y: w.y, toMapId: w.toMapId, tx: w.tx, ty: w.ty,
          label: w.label ?? null,
        })) },
      },
      include: { monsters: true, warpsFrom: true },
    })
    app.contentCache.invalidate()
    return reply.code(201).send({ map: created })
  })

  app.put('/api/admin/maps/:id', guard, async (req, reply) => {
    const parsed = mapBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    const data = parsed.data
    const { id } = req.params as { id: string }
    const exists = await app.prisma.map.findUnique({ where: { id } })
    if (!exists) return reply.code(404).send({ error: 'map not found' })
    if (data.layout.length !== data.h || data.layout.some((row) => row.length !== data.w)) {
      return reply.code(400).send({ error: 'layout dimensions do not match w/h' })
    }
    if (data.monsters.length > 0) {
      const ids = data.monsters.map((m) => m.monsterId)
      const found = await app.prisma.monster.findMany({
        where: { id: { in: ids } }, select: { id: true },
      })
      if (found.length !== new Set(ids).size) {
        return reply.code(400).send({ error: 'one or more monsterIds do not exist' })
      }
    }
    if (data.warps.length > 0) {
      const targetIds = [...new Set(data.warps.map((w) => w.toMapId))]
      const others = targetIds.filter((tid) => tid !== id)
      if (others.length > 0) {
        const found = await app.prisma.map.findMany({
          where: { id: { in: others } }, select: { id: true },
        })
        if (found.length !== others.length) {
          return reply.code(400).send({ error: 'one or more warp toMapId do not exist' })
        }
      }
    }

    const { monsters, layout, warps, ...rest } = data
    const updated = await app.prisma.$transaction(async (tx) => {
      await tx.map.update({
        where: { id },
        data: {
          ...rest,
          bgImage: rest.bgImage ?? null,
          pathColor: rest.pathColor ?? null,
          layout: layout as unknown as object,
        },
      })
      await tx.mapMonster.deleteMany({ where: { mapId: id } })
      if (monsters.length > 0) {
        await tx.mapMonster.createMany({
          data: monsters.map((m) => ({
            mapId: id, monsterId: m.monsterId, spawnWeight: m.spawnWeight,
          })),
        })
      }
      // Replace outgoing warps wholesale — matches the wholesale-replace
      // semantics of monsters and keeps the editor's "current state" model.
      await tx.warp.deleteMany({ where: { mapId: id } })
      if (warps.length > 0) {
        await tx.warp.createMany({
          data: warps.map((w) => ({
            mapId: id, x: w.x, y: w.y,
            toMapId: w.toMapId, tx: w.tx, ty: w.ty,
            label: w.label ?? null,
          })),
        })
      }
      return tx.map.findUniqueOrThrow({
        where: { id }, include: { monsters: true, warpsFrom: true },
      })
    })
    app.contentCache.invalidate()
    return reply.send({ map: updated })
  })

  app.delete('/api/admin/maps/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string }
    const exists = await app.prisma.map.findUnique({ where: { id } })
    if (!exists) return reply.code(404).send({ error: 'map not found' })
    try {
      await app.prisma.map.delete({ where: { id } })
    } catch {
      return reply.code(409).send({ error: 'map is referenced by warps or characters' })
    }
    app.contentCache.invalidate()
    return reply.send({ ok: true })
  })

  // ── Races (Slice 28) ──
  app.get('/api/admin/races', guard, async (_req, reply) => {
    const races = await app.prisma.race.findMany({ orderBy: { id: 'asc' } })
    return reply.send({ races })
  })

  app.post('/api/admin/races', guard, async (req, reply) => {
    const parsed = raceCreateBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    const exists = await app.prisma.race.findUnique({ where: { id: parsed.data.id } })
    if (exists) return reply.code(409).send({ error: 'race id already exists' })
    const { modifiers, ...rest } = parsed.data
    const created = await app.prisma.race.create({
      data: { ...rest, modifiers: modifiers as unknown as object },
    })
    app.contentCache.invalidate()
    return reply.code(201).send({ race: created })
  })

  app.put('/api/admin/races/:id', guard, async (req, reply) => {
    const parsed = raceBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    const { id } = req.params as { id: string }
    const exists = await app.prisma.race.findUnique({ where: { id } })
    if (!exists) return reply.code(404).send({ error: 'race not found' })
    const { modifiers, ...rest } = parsed.data
    const updated = await app.prisma.race.update({
      where: { id }, data: { ...rest, modifiers: modifiers as unknown as object },
    })
    app.contentCache.invalidate()
    return reply.send({ race: updated })
  })

  app.delete('/api/admin/races/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string }
    const exists = await app.prisma.race.findUnique({ where: { id } })
    if (!exists) return reply.code(404).send({ error: 'race not found' })
    await app.prisma.race.delete({ where: { id } })
    app.contentCache.invalidate()
    return reply.send({ ok: true })
  })

  // ── CharClasses (Slice 28) ──
  app.get('/api/admin/classes', guard, async (_req, reply) => {
    const classes = await app.prisma.charClass.findMany({ orderBy: { id: 'asc' } })
    return reply.send({ classes })
  })

  app.post('/api/admin/classes', guard, async (req, reply) => {
    const parsed = classCreateBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    const exists = await app.prisma.charClass.findUnique({ where: { id: parsed.data.id } })
    if (exists) return reply.code(409).send({ error: 'class id already exists' })
    const { growth, skill, requiredRaceId, ...rest } = parsed.data
    const created = await app.prisma.charClass.create({
      data: {
        ...rest,
        growth: growth as unknown as object,
        skill: skill as unknown as object,
        requiredRaceId: requiredRaceId ?? null,
      },
    })
    app.contentCache.invalidate()
    return reply.code(201).send({ class: created })
  })

  app.put('/api/admin/classes/:id', guard, async (req, reply) => {
    const parsed = classBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    const { id } = req.params as { id: string }
    const exists = await app.prisma.charClass.findUnique({ where: { id } })
    if (!exists) return reply.code(404).send({ error: 'class not found' })
    const { growth, skill, requiredRaceId, ...rest } = parsed.data
    const updated = await app.prisma.charClass.update({
      where: { id },
      data: {
        ...rest,
        growth: growth as unknown as object,
        skill: skill as unknown as object,
        requiredRaceId: requiredRaceId ?? null,
      },
    })
    app.contentCache.invalidate()
    return reply.send({ class: updated })
  })

  app.delete('/api/admin/classes/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string }
    const exists = await app.prisma.charClass.findUnique({ where: { id } })
    if (!exists) return reply.code(404).send({ error: 'class not found' })
    await app.prisma.charClass.delete({ where: { id } })
    app.contentCache.invalidate()
    return reply.send({ ok: true })
  })

  // ── Characters ──
  app.get('/api/admin/characters', guard, async (_req, reply) => {
    const characters = await app.prisma.character.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 200, // hard cap so a giant DB doesn't blow up the panel
      include: { user: { select: { username: true } } },
    })
    return reply.send({
      characters: characters.map((c) => ({
        id: c.id,
        username: c.user.username,
        name: c.name,
        raceId: c.raceId,
        classId: c.classId,
        lv: c.lv,
        exp: c.exp,
        gold: c.gold,
        mapId: c.mapId,
        transcended: c.transcended,
      })),
    })
  })

  app.put('/api/admin/characters/:id', guard, async (req, reply) => {
    const parsed = characterPatch.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    const { id } = req.params as { id: string }
    const exists = await app.prisma.character.findUnique({ where: { id } })
    if (!exists) return reply.code(404).send({ error: 'character not found' })
    const updated = await app.prisma.character.update({
      where: { id }, data: parsed.data,
    })
    return reply.send({ character: updated })
  })

  // ── Upload (Slice 21) ──
  // Accepts one multipart file under field name "file". Writes it into
  // server/uploads/maps/<random>.<ext> and returns the public path so the
  // caller can stash it in Map.bgImage.
  const ALLOWED_MIME = new Set([
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  ])
  const EXT_BY_MIME: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg',
    'image/webp': 'webp', 'image/gif': 'gif',
  }

  app.post('/api/admin/upload', guard, async (req, reply) => {
    const file = await req.file().catch(() => null)
    if (!file) return reply.code(400).send({ error: 'no file field' })
    if (!ALLOWED_MIME.has(file.mimetype)) {
      // Drain so the multipart parser doesn't keep the buffer.
      await file.file.resume()
      return reply.code(400).send({ error: `mime not allowed: ${file.mimetype}` })
    }
    const ext = EXT_BY_MIME[file.mimetype]
    const name = `${crypto.randomUUID()}.${ext}`
    const target = path.join(app.uploadsDir, 'maps', name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    await pipeline(file.file, fs.createWriteStream(target))
    // The truncated property is set by multipart parser when fileSize cap hit.
    if (file.file.truncated) {
      fs.unlinkSync(target)
      return reply.code(413).send({ error: 'file too large' })
    }
    return reply.code(201).send({ url: `/uploads/maps/${name}` })
  })

  // ── Cache reload ──
  app.post('/api/admin/cache/reload', guard, async (_req, reply) => {
    app.contentCache.invalidate()
    return reply.send({ ok: true })
  })
}
