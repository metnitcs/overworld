import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Character, InventoryItem } from '@prisma/client'
import {
  deriveStats, type GameState,
  CHARACTER_SLOT_LIMIT, TRANSCEND_LV,
  CLASS_CHANGE_LV,
  STAT_BASE, STAT_HARD_CAP,
  spendPoints, resetStats,
  applyRaceModifiers, shiftRaceModifierDiff,
  HEAL_FULL_COST,
  type PrimaryStat,
} from '@asura/shared'
// Slice 28: race + class data lives in DB now (admin-editable). Server
// reads it via app.contentCache instead of the static @asura/shared
// imports. The shared package still ships RACES/CLASSES as the SEED
// source — runtime always reads from cache so admin edits are live.

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
  /// Slice 38: optimistic concurrency token. ISO timestamp of the
  /// character row when the client last read it (from GET or prior PUT).
  /// Optional for back-compat — clients that omit it skip the staleness
  /// check entirely (and risk overwriting concurrent admin writes).
  expectedUpdatedAt: z.string().optional(),
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

/** Slice 39: equip/unequip intent endpoints — Slice 45 will remove
 *  equipWeapon/equipArmor from the player PUT entirely, leaving these
 *  as the only path to mutate equip slots from the client. */
const equipSchema = z.object({
  itemKey: z.string().min(1),
})
const unequipSchema = z.object({
  slot: z.enum(['weapon', 'armor']),
})

/** Slice 40: consume intent — server applies the heal clamp + decrements
 *  inventory atomically so the client can't fake heal amounts or hold a
 *  potion after using it. */
const consumeSchema = z.object({
  itemKey: z.string().min(1),
})

/** Slice 41: shop buy + healer intent endpoints. NPC id pinpoints which
 *  vendor the request is for; server validates the NPC is on the player's
 *  current map before honoring the price. */
const buySchema = z.object({
  npcId: z.string().min(1),
  itemKey: z.string().min(1),
  qty: z.number().int().min(1).max(99).default(1),
})
const healFullSchema = z.object({
  npcId: z.string().min(1),
})

/** Slice 42: craft intent. `recipeId` mirrors the result item id
 *  (1 recipe per output, see Recipe model). */
const craftSchema = z.object({
  recipeId: z.string().min(1),
})

const DEFAULT_INVENTORY: Record<string, number> = { 'potion-s': 3 }

/** Map a DB Character (+inventory rows) into the API shape, which mirrors the
 *  client's GameState (inventory = Record<itemKey, qty>).
 *  Slice 38: tacks on `updatedAt` (ISO) as the optimistic-concurrency token —
 *  client echoes it in the next PUT; server rejects mismatches with 409 so a
 *  player session can't clobber inventory/equip/plus/gold writes that another
 *  actor (admin GM-add, second tab) made after the last sync. */
function toApiCharacter(
  c: Character & { inventory: InventoryItem[] },
): GameState & { id: string; updatedAt: string } {
  const inv: Record<string, number> = {}
  for (const it of c.inventory) inv[it.itemKey] = it.qty
  return {
    id: c.id,
    updatedAt: c.updatedAt.toISOString(),
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

    // Slice 28: race + class definitions come from the live DB cache so
    // admin edits to "Adventurer" or "human" (e.g. tweak modifiers) take
    // effect on next character creation without a deploy.
    const starterRace = await app.contentCache.getStarterRace()
    const starterClass = await app.contentCache.getStarterClass()

    const baseState: GameState = {
      name,
      raceId: starterRace.id,
      classId: starterClass.id,
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
    const withRace = applyRaceModifiers(baseState, starterRace.modifiers)
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

    // Slice 38: optimistic concurrency. If the client tells us the
    // `updatedAt` it last read, reject the write when the row has moved
    // since — and hand back the current character so the client can
    // refetch + merge + retry instead of clobbering it.
    if (s.expectedUpdatedAt && existing.updatedAt.toISOString() !== s.expectedUpdatedAt) {
      const current = await app.prisma.character.findUniqueOrThrow({
        where: { id: existing.id }, include: { inventory: true },
      })
      return reply.code(409).send({
        error: 'stale',
        character: toApiCharacter(current),
      })
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

    // Slice 38: same optimistic concurrency as the by-id PUT.
    if (s.expectedUpdatedAt && existing.updatedAt.toISOString() !== s.expectedUpdatedAt) {
      const current = await app.prisma.character.findUniqueOrThrow({
        where: { id: existing.id }, include: { inventory: true },
      })
      return reply.code(409).send({
        error: 'stale',
        character: toApiCharacter(current),
      })
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

    const availableRaces = await app.contentCache.getAvailableRaces()
    if (!availableRaces.some((r) => r.id === raceId)) {
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
    // Slice 28: race definitions live in DB now — look them up via cache.
    const oldRace = await app.contentCache.getRaceById(existing.raceId)
    const newRace = await app.contentCache.getRaceById(raceId)
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

    const availableClasses = await app.contentCache.getAvailableClasses()
    if (!availableClasses.some((c) => c.id === classId)) {
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
    // Slice 27: the chosen class must be unlocked by the player's race
    // (e.g. a มาร character can only pick assassin/shaman). The client
    // already filters by race; the server re-validates so a crafted
    // request can't bypass. Slice 28: read from DB cache.
    const allowed = await app.contentCache.getClassesForRace(existing.raceId)
    if (!allowed.some((c) => c.id === classId)) {
      return reply.code(400).send({ error: `class '${classId}' not allowed for race '${existing.raceId}'` })
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

  // ─── POST /api/character/:id/equip — Slice 39 intent endpoint ─────────────
  // Server validates the item exists in content + lives in the player's
  // inventory before pointing the slot at it. Re-runs deriveStats so the
  // returned payload already reflects new atk/def. The item stays in the
  // bag (Demon Online-style "equip is a pointer, not a transfer", Slice 36).
  app.post('/api/character/:id/equip', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = equipSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    }
    const { id } = req.params as { id: string }
    const { itemKey } = parsed.data

    const existing = await app.prisma.character.findUnique({
      where: { id }, include: { inventory: true },
    })
    if (!existing || existing.userId !== req.userId) {
      return reply.code(404).send({ error: 'character not found' })
    }
    const bundle = await app.contentCache.get()
    const item = bundle.items[itemKey]
    if (!item) return reply.code(404).send({ error: 'item not found' })
    if (item.type !== 'weapon' && item.type !== 'armor') {
      return reply.code(400).send({ error: 'item is not equippable' })
    }
    const ownedQty = existing.inventory.find((it) => it.itemKey === itemKey)?.qty ?? 0
    if (ownedQty < 1) return reply.code(409).send({ error: 'item not in inventory' })

    const slotField = item.type === 'weapon' ? 'equipWeapon' : 'equipArmor'
    const draft: GameState & { id: string } = {
      ...toApiCharacter(existing),
      [slotField]: itemKey,
    }
    const next = deriveStats(draft, { items: bundle.items })
    const updated = await app.prisma.character.update({
      where: { id: existing.id },
      data: {
        [slotField]: itemKey,
        maxHp: next.maxHp, maxMp: next.maxMp,
        hp: next.hp, mp: next.mp,
        atk: next.atk, def: next.def, spd: next.spd,
      },
      include: { inventory: true },
    })
    return reply.send({ character: toApiCharacter(updated) })
  })

  // ─── POST /api/character/:id/unequip — Slice 39 intent endpoint ───────────
  // Clears the named slot. Safety net mirroring client Slice 33 logic:
  // if the previously-equipped key has no inventory row (admin-assigned
  // without a matching bag entry), add 1 so the item isn't lost on unequip.
  app.post('/api/character/:id/unequip', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = unequipSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    }
    const { id } = req.params as { id: string }
    const { slot } = parsed.data

    const existing = await app.prisma.character.findUnique({
      where: { id }, include: { inventory: true },
    })
    if (!existing || existing.userId !== req.userId) {
      return reply.code(404).send({ error: 'character not found' })
    }
    const slotField = slot === 'weapon' ? 'equipWeapon' : 'equipArmor'
    const cleared = slot === 'weapon' ? existing.equipWeapon : existing.equipArmor
    if (cleared === null) {
      return reply.send({ character: toApiCharacter(existing) }) // no-op
    }
    const ownedQty = existing.inventory.find((it) => it.itemKey === cleared)?.qty ?? 0
    const bundle = await app.contentCache.get()
    const draft: GameState & { id: string } = {
      ...toApiCharacter(existing),
      [slotField]: null,
      // Safety: rebuild inventory dict for deriveStats with the safety
      // top-up applied if needed.
      inventory: ownedQty < 1
        ? { ...Object.fromEntries(existing.inventory.map((it) => [it.itemKey, it.qty])), [cleared]: 1 }
        : Object.fromEntries(existing.inventory.map((it) => [it.itemKey, it.qty])),
    }
    const next = deriveStats(draft, { items: bundle.items })

    const updated = await app.prisma.$transaction(async (tx) => {
      await tx.character.update({
        where: { id: existing.id },
        data: {
          [slotField]: null,
          maxHp: next.maxHp, maxMp: next.maxMp,
          hp: next.hp, mp: next.mp,
          atk: next.atk, def: next.def, spd: next.spd,
        },
      })
      if (ownedQty < 1) {
        await tx.inventoryItem.upsert({
          where: { characterId_itemKey: { characterId: existing.id, itemKey: cleared } },
          create: { characterId: existing.id, itemKey: cleared, qty: 1 },
          update: { qty: 1 },
        })
      }
      return tx.character.findUniqueOrThrow({
        where: { id: existing.id }, include: { inventory: true },
      })
    })
    return reply.send({ character: toApiCharacter(updated) })
  })

  // ─── POST /api/character/:id/consume — Slice 40 intent endpoint ──────────
  // Server validates type=consume + owned qty ≥ 1, applies the clamped
  // heal/healMp from the item def, decrements the inventory row in the
  // same transaction. No-op heal (already full HP/MP) is allowed — the
  // potion still gets consumed.
  app.post('/api/character/:id/consume', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = consumeSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    }
    const { id } = req.params as { id: string }
    const { itemKey } = parsed.data

    const existing = await app.prisma.character.findUnique({
      where: { id }, include: { inventory: true },
    })
    if (!existing || existing.userId !== req.userId) {
      return reply.code(404).send({ error: 'character not found' })
    }
    const bundle = await app.contentCache.get()
    const item = bundle.items[itemKey]
    if (!item) return reply.code(404).send({ error: 'item not found' })
    if (item.type !== 'consume') {
      return reply.code(400).send({ error: 'item is not consumable' })
    }
    const row = existing.inventory.find((it) => it.itemKey === itemKey)
    if (!row || row.qty < 1) return reply.code(409).send({ error: 'item not in inventory' })

    const newHp = item.heal ? Math.min(existing.maxHp, existing.hp + item.heal) : existing.hp
    const newMp = item.healMp ? Math.min(existing.maxMp, existing.mp + item.healMp) : existing.mp

    const updated = await app.prisma.$transaction(async (tx) => {
      await tx.character.update({
        where: { id: existing.id },
        data: { hp: newHp, mp: newMp },
      })
      if (row.qty <= 1) {
        await tx.inventoryItem.delete({
          where: { characterId_itemKey: { characterId: existing.id, itemKey } },
        })
      } else {
        await tx.inventoryItem.update({
          where: { characterId_itemKey: { characterId: existing.id, itemKey } },
          data: { qty: row.qty - 1 },
        })
      }
      return tx.character.findUniqueOrThrow({
        where: { id: existing.id }, include: { inventory: true },
      })
    })
    return reply.send({ character: toApiCharacter(updated) })
  })

  // ─── POST /api/character/:id/shop/buy — Slice 41 intent endpoint ─────────
  // Server validates: the NPC exists, is a shop, sits on the player's
  // current map, and sells the requested item. Gold + inventory writes
  // are atomic — no double-spend if the request races.
  app.post('/api/character/:id/shop/buy', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = buySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    }
    const { id } = req.params as { id: string }
    const { npcId, itemKey, qty } = parsed.data

    const existing = await app.prisma.character.findUnique({
      where: { id }, include: { inventory: true },
    })
    if (!existing || existing.userId !== req.userId) {
      return reply.code(404).send({ error: 'character not found' })
    }
    const npc = await app.prisma.npc.findUnique({
      where: { id: npcId }, include: { shopItems: true },
    })
    if (!npc || npc.kind !== 'shop' || npc.mapId !== existing.mapId) {
      return reply.code(404).send({ error: 'shop not reachable from current map' })
    }
    const entry = npc.shopItems.find((s) => s.itemId === itemKey)
    if (!entry) return reply.code(404).send({ error: 'shop does not sell this item' })
    const totalCost = entry.price * qty
    if (existing.gold < totalCost) {
      return reply.code(409).send({ error: 'insufficient gold' })
    }

    const updated = await app.prisma.$transaction(async (tx) => {
      await tx.character.update({
        where: { id: existing.id },
        data: { gold: existing.gold - totalCost },
      })
      await tx.inventoryItem.upsert({
        where: { characterId_itemKey: { characterId: existing.id, itemKey } },
        create: { characterId: existing.id, itemKey, qty },
        update: { qty: { increment: qty } },
      })
      return tx.character.findUniqueOrThrow({
        where: { id: existing.id }, include: { inventory: true },
      })
    })
    return reply.send({ character: toApiCharacter(updated) })
  })

  // ─── POST /api/character/:id/heal-full — Slice 41 intent endpoint ────────
  // Healer-NPC service: deduct HEAL_FULL_COST, set hp/mp to max. Validates
  // the healer is reachable from the player's current map.
  app.post('/api/character/:id/heal-full', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = healFullSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    }
    const { id } = req.params as { id: string }
    const { npcId } = parsed.data

    const existing = await app.prisma.character.findUnique({
      where: { id }, include: { inventory: true },
    })
    if (!existing || existing.userId !== req.userId) {
      return reply.code(404).send({ error: 'character not found' })
    }
    const npc = await app.prisma.npc.findUnique({ where: { id: npcId } })
    if (!npc || npc.kind !== 'healer' || npc.mapId !== existing.mapId) {
      return reply.code(404).send({ error: 'healer not reachable from current map' })
    }
    if (existing.gold < HEAL_FULL_COST) {
      return reply.code(409).send({ error: 'insufficient gold' })
    }
    const updated = await app.prisma.character.update({
      where: { id: existing.id },
      data: {
        gold: existing.gold - HEAL_FULL_COST,
        hp: existing.maxHp,
        mp: existing.maxMp,
      },
      include: { inventory: true },
    })
    return reply.send({ character: toApiCharacter(updated) })
  })

  // ─── POST /api/character/:id/craft — Slice 42 intent endpoint ────────────
  // Server validates classReq + mats + gold from the DB recipe (not the
  // client-supplied prices) and runs the whole spend+gain in a single
  // transaction so a race can't half-craft. Mat decrements delete the
  // inventory row when qty hits zero.
  app.post('/api/character/:id/craft', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = craftSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    }
    const { id } = req.params as { id: string }
    const { recipeId } = parsed.data

    const existing = await app.prisma.character.findUnique({
      where: { id }, include: { inventory: true },
    })
    if (!existing || existing.userId !== req.userId) {
      return reply.code(404).send({ error: 'character not found' })
    }
    const recipe = await app.prisma.recipe.findUnique({
      where: { id: recipeId }, include: { mats: true },
    })
    if (!recipe) return reply.code(404).send({ error: 'recipe not found' })

    const classReq = recipe.classReq as string[] | null
    if (classReq !== null && !classReq.includes(existing.classId)) {
      return reply.code(409).send({ error: 'class not allowed to craft this' })
    }
    if (existing.gold < recipe.gold) {
      return reply.code(409).send({ error: 'insufficient gold' })
    }
    const invMap = new Map(existing.inventory.map((it) => [it.itemKey, it.qty]))
    for (const m of recipe.mats) {
      if ((invMap.get(m.itemId) ?? 0) < m.qty) {
        return reply.code(409).send({ error: `insufficient mat: ${m.itemId}` })
      }
    }

    const updated = await app.prisma.$transaction(async (tx) => {
      await tx.character.update({
        where: { id: existing.id },
        data: { gold: existing.gold - recipe.gold },
      })
      for (const m of recipe.mats) {
        const curQty = invMap.get(m.itemId) ?? 0
        if (curQty <= m.qty) {
          await tx.inventoryItem.delete({
            where: { characterId_itemKey: { characterId: existing.id, itemKey: m.itemId } },
          })
        } else {
          await tx.inventoryItem.update({
            where: { characterId_itemKey: { characterId: existing.id, itemKey: m.itemId } },
            data: { qty: curQty - m.qty },
          })
        }
      }
      await tx.inventoryItem.upsert({
        where: { characterId_itemKey: { characterId: existing.id, itemKey: recipeId } },
        create: { characterId: existing.id, itemKey: recipeId, qty: 1 },
        update: { qty: { increment: 1 } },
      })
      return tx.character.findUniqueOrThrow({
        where: { id: existing.id }, include: { inventory: true },
      })
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
