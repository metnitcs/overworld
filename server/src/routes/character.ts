import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Character, InventoryItem } from '@prisma/client'
import { deriveStats, type GameState } from '@asura/shared'

const createSchema = z.object({
  name: z.string().min(1).max(40),
  raceId: z.string(),
  classId: z.string(),
})

/** Whole-state save body, mirroring the persistent slice of the client's
 *  GameState (server-authoritative gameplay still arrives in slice 6 —
 *  this PUT is the bridge that replaces localStorage). */
const updateSchema = z.object({
  lv: z.number().int().min(1),
  exp: z.number().int().min(0),
  hp: z.number().int().min(0),
  maxHp: z.number().int().min(1),
  mp: z.number().int().min(0),
  maxMp: z.number().int().min(0),
  atk: z.number().int().min(0),
  def: z.number().int().min(0),
  spd: z.number().int().min(0),
  gold: z.number().int().min(0),
  map: z.string(),
  px: z.number().int(),
  py: z.number().int(),
  steps: z.number().int().min(0),
  equipWeapon: z.string().nullable(),
  equipArmor: z.string().nullable(),
  plus: z.record(z.string(), z.number().int().min(0)),
  inventory: z.record(z.string(), z.number().int().min(0)),
})

const DEFAULT_INVENTORY: Record<string, number> = { 'potion-s': 3 }

/** Map a DB Character (+inventory rows) into the API shape, which mirrors the
 *  client's GameState (inventory = Record<itemKey, qty>). */
function toApiCharacter(
  c: Character & { inventory: InventoryItem[] },
): GameState & { id: string } {
  const inv: Record<string, number> = {}
  for (const it of c.inventory) inv[it.itemKey] = it.qty
  return {
    id: c.id,
    name: c.name,
    raceId: c.raceId,
    classId: c.classId,
    lv: c.lv,
    exp: c.exp,
    hp: c.hp,
    maxHp: c.maxHp,
    mp: c.mp,
    maxMp: c.maxMp,
    atk: c.atk,
    def: c.def,
    spd: c.spd,
    gold: c.gold,
    inventory: inv,
    equipWeapon: c.equipWeapon,
    equipArmor: c.equipArmor,
    plus: c.plus as Record<string, number>,
    map: c.mapId,
    px: c.px,
    py: c.py,
    steps: c.steps,
  }
}

export function registerCharacterRoutes(app: FastifyInstance): void {
  app.get('/api/character', { preHandler: app.requireAuth }, async (req, reply) => {
    const character = await app.prisma.character.findFirst({
      where: { userId: req.userId },
      include: { inventory: true },
      orderBy: { updatedAt: 'desc' },
    })
    if (!character) {
      return reply.code(404).send({ error: 'no character for this user' })
    }
    return reply.send({ character: toApiCharacter(character) })
  })

  app.post('/api/character', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    }
    const { name, raceId, classId } = parsed.data

    // Single character per user for now (schema allows multiple; we don't expose it).
    const existing = await app.prisma.character.findFirst({ where: { userId: req.userId } })
    if (existing) {
      return reply.code(409).send({ error: 'character already exists for this user' })
    }

    // Derive initial stats via the shared rules — single source of truth.
    const derived = deriveStats({
      name, raceId, classId,
      lv: 1, exp: 0,
      hp: 0, maxHp: 0, mp: 0, maxMp: 0,
      atk: 0, def: 0, spd: 0,
      gold: 100,
      inventory: { ...DEFAULT_INVENTORY },
      equipWeapon: null,
      equipArmor: null,
      plus: {},
      map: 'village', px: 5, py: 5, steps: 0,
    })

    const created = await app.prisma.character.create({
      data: {
        userId: req.userId,
        name: derived.name,
        raceId: derived.raceId,
        classId: derived.classId,
        lv: derived.lv,
        exp: derived.exp,
        hp: derived.maxHp,
        maxHp: derived.maxHp,
        mp: derived.maxMp,
        maxMp: derived.maxMp,
        atk: derived.atk,
        def: derived.def,
        spd: derived.spd,
        gold: derived.gold,
        mapId: derived.map,
        px: derived.px,
        py: derived.py,
        steps: derived.steps,
        equipWeapon: null,
        equipArmor: null,
        plus: {},
        inventory: {
          create: Object.entries(DEFAULT_INVENTORY).map(([itemKey, qty]) => ({ itemKey, qty })),
        },
      },
      include: { inventory: true },
    })

    return reply.code(201).send({ character: toApiCharacter(created) })
  })

  app.put('/api/character', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    }
    const s = parsed.data

    const existing = await app.prisma.character.findFirst({ where: { userId: req.userId } })
    if (!existing) {
      return reply.code(404).send({ error: 'no character for this user' })
    }

    // Atomic: overwrite fields + replace inventory rows.
    const updated = await app.prisma.$transaction(async (tx) => {
      await tx.character.update({
        where: { id: existing.id },
        data: {
          lv: s.lv, exp: s.exp,
          hp: s.hp, maxHp: s.maxHp, mp: s.mp, maxMp: s.maxMp,
          atk: s.atk, def: s.def, spd: s.spd,
          gold: s.gold,
          mapId: s.map, px: s.px, py: s.py, steps: s.steps,
          equipWeapon: s.equipWeapon, equipArmor: s.equipArmor,
          plus: s.plus,
        },
      })
      await tx.inventoryItem.deleteMany({ where: { characterId: existing.id } })
      const entries = Object.entries(s.inventory).filter(([, qty]) => qty > 0)
      if (entries.length > 0) {
        await tx.inventoryItem.createMany({
          data: entries.map(([itemKey, qty]) => ({
            characterId: existing.id, itemKey, qty,
          })),
        })
      }
      return tx.character.findUniqueOrThrow({
        where: { id: existing.id },
        include: { inventory: true },
      })
    })

    return reply.send({ character: toApiCharacter(updated) })
  })
}
