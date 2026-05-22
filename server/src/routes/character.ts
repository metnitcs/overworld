import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Character, InventoryItem } from '@prisma/client'
import {
  deriveStats, type GameState,
  STARTER_RACE, AVAILABLE_RACES, RACES, CHARACTER_SLOT_LIMIT, TRANSCEND_LV,
  STARTER_CLASS, AVAILABLE_CLASSES, CLASS_CHANGE_LV,
  STAT_BASE, STAT_HARD_CAP,
  spendPoints, resetStats,
  applyRaceModifiers, shiftRaceModifierDiff,
  type PrimaryStat,
} from '@asura/shared'

const createSchema = z.object({
  name: z.string().min(1).max(40),
  // Slice 26: classId is no longer client-supplied at creation (was Slice 17
  // for raceId — same pattern now applied to class). Every new character
  // starts as STARTER_CLASS and chooses an advanced class via the Lv-5
  // class-change quest. Accepted for backward compat but ignored.
  classId: z.string().optional(),
  raceId: z.string().optional(),
})

/** Whole-state save body, mirroring the persistent slice of the client's
 *  GameState. Slice 16 added the `:id` URL param so the user can own
 *  multiple characters; Slice 23 added the 6 primary stats + unspentPoints. */
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
  // Slice 23: primary stats. Server still computes them via deriveStats but
  // accepts the client's snapshot to keep PUT semantics simple (the client
  // should already have run deriveStats).
  str: z.number().int().min(1).max(STAT_HARD_CAP),
  int: z.number().int().min(1).max(STAT_HARD_CAP),
  dex: z.number().int().min(1).max(STAT_HARD_CAP),
  agi: z.number().int().min(1).max(STAT_HARD_CAP),
  luk: z.number().int().min(1).max(STAT_HARD_CAP),
  vit: z.number().int().min(1).max(STAT_HARD_CAP),
  unspentPoints: z.number().int().min(0),
  gold: z.number().int().min(0),
  map: z.string(),
  px: z.number().int(),
  py: z.number().int(),
  steps: z.number().int().min(0),
  equipWeapon: z.string().nullable(),
  equipArmor: z.string().nullable(),
  plus: z.record(z.string(), z.number().int().min(0)),
  inventory: z.record(z.string(), z.number().int().min(0)),
  transcended: z.boolean(),
  classChanged: z.boolean(),
})

/** POST /api/character/:id/allocate — spend one chunk of points on one stat. */
const allocateSchema = z.object({
  stat: z.enum(['str', 'int', 'dex', 'agi', 'luk', 'vit']),
  amount: z.number().int().min(1).max(500),
})

const transcendSchema = z.object({
  raceId: z.string(),
})

const changeClassSchema = z.object({
  classId: z.string(),
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
    // Slice 23: primary stats round-trip 1:1.
    str: c.str,
    int: c.int,
    dex: c.dex,
    agi: c.agi,
    luk: c.luk,
    vit: c.vit,
    unspentPoints: c.unspentPoints,
    gold: c.gold,
    inventory: inv,
    equipWeapon: c.equipWeapon,
    equipArmor: c.equipArmor,
    plus: c.plus as Record<string, number>,
    map: c.mapId,
    px: c.px,
    py: c.py,
    steps: c.steps,
    transcended: c.transcended,
    classChanged: c.classChanged,
  }
}

export function registerCharacterRoutes(app: FastifyInstance): void {
  // ─── GET /api/characters — list all characters for the authenticated user ──
  app.get('/api/characters', { preHandler: app.requireAuth }, async (req, reply) => {
    const characters = await app.prisma.character.findMany({
      where: { userId: req.userId },
      include: { inventory: true },
      orderBy: { updatedAt: 'desc' },
    })
    return reply.send({
      characters: characters.map(toApiCharacter),
      slotLimit: CHARACTER_SLOT_LIMIT,
    })
  })

  // ─── LEGACY GET /api/character — first character (kept for prior clients) ──
  // Returns 404 if the user has no characters yet.
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

  // ─── GET /api/character/:id — fetch a specific character, ownership checked ─
  app.get('/api/character/:id', { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const character = await app.prisma.character.findUnique({
      where: { id },
      include: { inventory: true },
    })
    if (!character || character.userId !== req.userId) {
      return reply.code(404).send({ error: 'character not found' })
    }
    return reply.send({ character: toApiCharacter(character) })
  })

  // ─── POST /api/character — create. Race AND Class are ALWAYS the ─────────
  // configured starters (Slice 17 race, Slice 26 class). Enforces the
  // per-account slot cap (Slice 16). Client may send `classId` for backward
  // compat — it's ignored.
  app.post('/api/character', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    }
    const { name } = parsed.data

    const count = await app.prisma.character.count({ where: { userId: req.userId } })
    if (count >= CHARACTER_SLOT_LIMIT) {
      return reply.code(409).send({
        error: `character slot limit reached (${CHARACTER_SLOT_LIMIT})`,
      })
    }

    // Derive initial stats via the shared rules — starter race + class are
    // both fixed. Slice 23: STAT_BASE in every primary stat, 0 unspent.
    // Slice 25: apply starter race modifier. Slice 26: classId = STARTER_CLASS.
    const baseState: GameState = {
      name,
      raceId: STARTER_RACE.id,
      classId: STARTER_CLASS.id,
      lv: 1, exp: 0,
      hp: 0, maxHp: 0, mp: 0, maxMp: 0,
      atk: 0, def: 0, spd: 0,
      str: STAT_BASE, int: STAT_BASE, dex: STAT_BASE,
      agi: STAT_BASE, luk: STAT_BASE, vit: STAT_BASE,
      unspentPoints: 0,
      gold: 100,
      inventory: { ...DEFAULT_INVENTORY },
      equipWeapon: null,
      equipArmor: null,
      plus: {},
      map: 'village', px: 5, py: 5, steps: 0,
      transcended: false,
      classChanged: false,
    }
    const withRace = applyRaceModifiers(baseState, STARTER_RACE.modifiers)
    const derived = deriveStats(withRace)

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
        str: derived.str,
        int: derived.int,
        dex: derived.dex,
        agi: derived.agi,
        luk: derived.luk,
        vit: derived.vit,
        unspentPoints: derived.unspentPoints,
        gold: derived.gold,
        mapId: derived.map,
        px: derived.px,
        py: derived.py,
        steps: derived.steps,
        equipWeapon: null,
        equipArmor: null,
        plus: {},
        transcended: false,
        classChanged: false,
        inventory: {
          create: Object.entries(DEFAULT_INVENTORY).map(([itemKey, qty]) => ({ itemKey, qty })),
        },
      },
      include: { inventory: true },
    })

    return reply.code(201).send({ character: toApiCharacter(created) })
  })

  // ─── PUT /api/character/:id — full-state save, ownership checked ───────────
  app.put('/api/character/:id', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    }
    const s = parsed.data
    const { id } = req.params as { id: string }

    const existing = await app.prisma.character.findUnique({ where: { id } })
    if (!existing || existing.userId !== req.userId) {
      return reply.code(404).send({ error: 'character not found' })
    }

    const updated = await app.prisma.$transaction(async (tx) => {
      await tx.character.update({
        where: { id: existing.id },
        data: {
          lv: s.lv, exp: s.exp,
          hp: s.hp, maxHp: s.maxHp, mp: s.mp, maxMp: s.maxMp,
          atk: s.atk, def: s.def, spd: s.spd,
          str: s.str, int: s.int, dex: s.dex,
          agi: s.agi, luk: s.luk, vit: s.vit,
          unspentPoints: s.unspentPoints,
          gold: s.gold,
          mapId: s.map, px: s.px, py: s.py, steps: s.steps,
          equipWeapon: s.equipWeapon, equipArmor: s.equipArmor,
          plus: s.plus,
          transcended: s.transcended,
          classChanged: s.classChanged,
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

  // ─── LEGACY PUT /api/character — applies to the first character ────────────
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

    const updated = await app.prisma.$transaction(async (tx) => {
      await tx.character.update({
        where: { id: existing.id },
        data: {
          lv: s.lv, exp: s.exp,
          hp: s.hp, maxHp: s.maxHp, mp: s.mp, maxMp: s.maxMp,
          atk: s.atk, def: s.def, spd: s.spd,
          str: s.str, int: s.int, dex: s.dex,
          agi: s.agi, luk: s.luk, vit: s.vit,
          unspentPoints: s.unspentPoints,
          gold: s.gold,
          mapId: s.map, px: s.px, py: s.py, steps: s.steps,
          equipWeapon: s.equipWeapon, equipArmor: s.equipArmor,
          plus: s.plus,
          transcended: s.transcended,
          classChanged: s.classChanged,
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

  // ─── POST /api/character/:id/transcend — Lv 10 race-change quest ───────────
  // Validates: character is at TRANSCEND_LV, hasn't transcended yet, and the
  // chosen race is in AVAILABLE_RACES. Sets raceId + transcended=true.
  // Stats are recomputed by the client on next loadFromStorage (deriveStats).
  app.post('/api/character/:id/transcend', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = transcendSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    }
    const { id } = req.params as { id: string }
    const { raceId } = parsed.data

    if (!AVAILABLE_RACES.some((r) => r.id === raceId)) {
      return reply.code(400).send({ error: 'raceId not allowed' })
    }

    const existing = await app.prisma.character.findUnique({
      where: { id },
      include: { inventory: true },
    })
    if (!existing || existing.userId !== req.userId) {
      return reply.code(404).send({ error: 'character not found' })
    }
    if (existing.transcended) {
      return reply.code(409).send({ error: 'character already transcended' })
    }
    if (existing.lv < TRANSCEND_LV) {
      return reply.code(409).send({ error: `must be Lv ${TRANSCEND_LV}+ to transcend` })
    }

    // Slice 25: shift primary stats by the (newRace - oldRace) modifier
    // diff so the racial flavor follows the player without wiping their
    // hard-earned allocation. shiftRaceModifierDiff clamps each stat at
    // STAT_BASE so a strongly negative diff can't sink anyone below floor.
    const oldRace = RACES.find((r) => r.id === existing.raceId)
    const newRace = RACES.find((r) => r.id === raceId)
    if (!newRace) {
      return reply.code(400).send({ error: 'raceId not found' })
    }
    const shifted = shiftRaceModifierDiff(
      toApiCharacter(existing),
      oldRace?.modifiers ?? {},
      newRace.modifiers,
    )
    const next = deriveStats({ ...shifted, raceId, transcended: true })

    const updated = await app.prisma.character.update({
      where: { id: existing.id },
      data: {
        raceId, transcended: true,
        str: next.str, int: next.int, dex: next.dex,
        agi: next.agi, luk: next.luk, vit: next.vit,
        // Re-cache derived columns (VIT/INT shifts change HP/MP/etc).
        maxHp: next.maxHp, maxMp: next.maxMp,
        hp: next.hp, mp: next.mp,
        atk: next.atk, def: next.def, spd: next.spd,
      },
      include: { inventory: true },
    })
    return reply.send({ character: toApiCharacter(updated) })
  })

  // ─── POST /api/character/:id/allocate — spend stat points (Slice 23) ──────
  // Server-authoritative: client sends { stat, amount }; we re-run spendPoints
  // on the DB snapshot and persist the new totals atomically.
  app.post('/api/character/:id/allocate', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = allocateSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    }
    const { id } = req.params as { id: string }
    const { stat, amount } = parsed.data
    const existing = await app.prisma.character.findUnique({
      where: { id }, include: { inventory: true },
    })
    if (!existing || existing.userId !== req.userId) {
      return reply.code(404).send({ error: 'character not found' })
    }

    // Run spendPoints on the GameState shape so the validation logic is
    // identical to the client preview.
    const current = toApiCharacter(existing)
    const r = spendPoints(current, stat as PrimaryStat, amount)
    if (!r.ok) {
      return reply.code(400).send({ error: r.error })
    }
    const next = deriveStats(r.state)

    const updated = await app.prisma.character.update({
      where: { id: existing.id },
      data: {
        str: next.str, int: next.int, dex: next.dex,
        agi: next.agi, luk: next.luk, vit: next.vit,
        unspentPoints: next.unspentPoints,
        // Re-cache derived columns since stat allocation can change them.
        maxHp: next.maxHp, maxMp: next.maxMp,
        atk: next.atk, def: next.def, spd: next.spd,
      },
      include: { inventory: true },
    })
    return reply.send({ character: toApiCharacter(updated) })
  })

  // ─── POST /api/character/:id/change-class — Lv 5 class-change quest ──────
  // Mirror of /transcend (Slice 17 race) — Slice 26 starter-class flow.
  // Validates: lv >= CLASS_CHANGE_LV, not yet class-changed, classId in
  // AVAILABLE_CLASSES. Flips classId + classChanged=true. Does NOT touch
  // primary stats — the player has already invested by this point.
  app.post('/api/character/:id/change-class', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = changeClassSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    }
    const { id } = req.params as { id: string }
    const { classId } = parsed.data

    if (!AVAILABLE_CLASSES.some((c) => c.id === classId)) {
      return reply.code(400).send({ error: 'classId not allowed' })
    }

    const existing = await app.prisma.character.findUnique({
      where: { id }, include: { inventory: true },
    })
    if (!existing || existing.userId !== req.userId) {
      return reply.code(404).send({ error: 'character not found' })
    }
    if (existing.classChanged) {
      return reply.code(409).send({ error: 'character already class-changed' })
    }
    if (existing.lv < CLASS_CHANGE_LV) {
      return reply.code(409).send({ error: `must be Lv ${CLASS_CHANGE_LV}+ to change class` })
    }

    const updated = await app.prisma.character.update({
      where: { id: existing.id },
      data: { classId, classChanged: true },
      include: { inventory: true },
    })
    return reply.send({ character: toApiCharacter(updated) })
  })

  // ─── POST /api/character/:id/reset-stats — full primary-stat reset ─────────
  // Refunds (lv-1) × STAT_POINTS_PER_LEVEL into unspentPoints, every stat
  // back to STAT_BASE. In future a consumable item ("reset stone") will
  // gate this — for now it requires a regular auth'd request from the owner.
  app.post('/api/character/:id/reset-stats', { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const existing = await app.prisma.character.findUnique({
      where: { id }, include: { inventory: true },
    })
    if (!existing || existing.userId !== req.userId) {
      return reply.code(404).send({ error: 'character not found' })
    }
    const next = deriveStats(resetStats(toApiCharacter(existing)))
    const updated = await app.prisma.character.update({
      where: { id: existing.id },
      data: {
        str: next.str, int: next.int, dex: next.dex,
        agi: next.agi, luk: next.luk, vit: next.vit,
        unspentPoints: next.unspentPoints,
        maxHp: next.maxHp, maxMp: next.maxMp,
        hp: next.hp, mp: next.mp,
        atk: next.atk, def: next.def, spd: next.spd,
      },
      include: { inventory: true },
    })
    return reply.send({ character: toApiCharacter(updated) })
  })

  // ─── DELETE /api/character/:id — delete a character (free a slot) ──────────
  app.delete('/api/character/:id', { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const existing = await app.prisma.character.findUnique({ where: { id } })
    if (!existing || existing.userId !== req.userId) {
      return reply.code(404).send({ error: 'character not found' })
    }
    await app.prisma.character.delete({ where: { id: existing.id } })
    return reply.send({ ok: true })
  })
}
