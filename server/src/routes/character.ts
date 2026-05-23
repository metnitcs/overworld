import type { FastifyInstance } from 'fastify'
import type { Prisma, PrismaClient } from '@prisma/client'
import type { Character, InventoryItem as PrismaInventoryItem } from '@prisma/client'
import { z } from 'zod'
import {
  deriveStats, type GameState, type InventoryItem, type ItemDef,
  CHARACTER_SLOT_LIMIT, TRANSCEND_LV,
  CLASS_CHANGE_LV,
  STAT_BASE, STAT_HARD_CAP,
  spendPoints, resetStats,
  applyRaceModifiers, shiftRaceModifierDiff,
  HEAL_FULL_COST,
  resolveEnhance, applyExp, expForLv,
  type PrimaryStat,
} from '@asura/shared'

/** Slice 47: stack-policy helper. Weapon/armor are per-instance — always
 *  INSERT a fresh InventoryItem row (qty=1, plus=0) so each physical item
 *  carries its own Plus. Mat/consume stack — upsert by (characterId, itemKey).
 *  Falls back to per-instance if the ItemDef is unknown (defensive — should
 *  never happen because every itemKey we add originated from the catalog). */
type Tx = Prisma.TransactionClient | PrismaClient
async function addItem(
  tx: Tx,
  characterId: string,
  itemKey: string,
  qty: number,
  items: Record<string, ItemDef>,
): Promise<void> {
  if (qty <= 0) return
  const def = items[itemKey]
  const stackable = def?.type === 'mat' || def?.type === 'consume'
  if (stackable) {
    const existing = await tx.inventoryItem.findFirst({
      where: { characterId, itemKey },
    })
    if (existing) {
      await tx.inventoryItem.update({
        where: { id: existing.id }, data: { qty: existing.qty + qty },
      })
    } else {
      await tx.inventoryItem.create({
        data: { characterId, itemKey, qty },
      })
    }
  } else {
    // Per-instance — N rows, qty=1 each. Plus defaults to 0.
    for (let i = 0; i < qty; i++) {
      await tx.inventoryItem.create({
        data: { characterId, itemKey, qty: 1, plus: 0 },
      })
    }
  }
}
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
  map: z.string(),
  px: z.number().int(),
  py: z.number().int(),
  steps: z.number().int().min(0),
  transcended: z.boolean(),
  classChanged: z.boolean(),
  /// Slice 38: optimistic concurrency token. ISO timestamp of the
  /// character row when the client last read it (from GET or prior PUT).
  /// Optional for back-compat — clients that omit it skip the staleness
  /// check entirely (and risk overwriting concurrent admin writes).
  expectedUpdatedAt: z.string().optional(),
  /// Slice 45: gold / inventory / equipWeapon / equipArmor / plus were
  /// removed from the player PUT. Those mutations now flow exclusively
  /// through intent endpoints (Slices 39-44: equip, unequip, consume,
  /// shop/buy, heal-full, craft, enhance, battle/resolve). Any field
  /// presented here is silently ignored — schema doesn't list it so
  /// Zod strips it. Admin PUT /api/admin/characters/:id continues to
  /// accept the full shape (Slice 30) and is the only way to edit
  /// these from outside the game loop.
}).strict()

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

/** Slice 39: equip/unequip intent endpoints — Slice 45 removed
 *  equipWeapon/equipArmor from the player PUT entirely; these are the
 *  only path to mutate equip slots from the client.
 *  Slice 47: equip now takes an inventoryItemId (not an itemKey) because
 *  inventory rows for gear are per-instance. The slot (weapon/armor) is
 *  derived from the row's ItemDef.type. */
const equipSchema = z.object({
  inventoryItemId: z.string().min(1),
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

/** Slice 43 → 47 → 48: enhance is now gated by a Blacksmith NPC.
 *  - `inventoryItemId` targets the row to enhance (per-instance, Slice 47)
 *  - `npcId` names the Blacksmith — server validates kind=blacksmith and
 *    that the NPC is on the player's current map (Slice 41 adjacency rule)
 *  - The row must NOT be equipped — Blacksmith refuses worn items (U1, Slice 48)
 *  - Server charges plus-stones + gold (resolveEnhance includes both) */
const enhanceSchema = z.object({
  inventoryItemId: z.string().min(1),
  npcId: z.string().min(1),
})

/** Slice 44: battle resolution intent. PvE combat itself remains
 *  client-driven (single-player, no incentive to cheat against yourself),
 *  but reward award (exp + gold + drops) is server-authoritative so
 *  inventory/gold mutations never live in the autosave PUT. */
const battleResolveSchema = z.object({
  monsterId: z.string().min(1),
})

const DEFAULT_INVENTORY: Record<string, number> = { 'potion-s': 3 }

/** Map a DB Character (+inventory rows) into the API shape, mirroring the
 *  client's GameState. Slice 47: inventory is now an array of per-instance
 *  rows (id, itemKey, qty, plus). equipWeapon/equipArmor are the FK ids
 *  pointing at the equipped InventoryItem.id; UI filters those ids out of
 *  the bag display. The old `plus: Record<>` field is gone — Plus lives on
 *  each row. See ADR 0003. */
function toApiCharacter(
  c: Character & { inventory: PrismaInventoryItem[] },
): GameState & { id: string; updatedAt: string } {
  const inv: InventoryItem[] = c.inventory.map((it) => ({
    id: it.id,
    itemKey: it.itemKey,
    qty: it.qty,
    plus: it.plus,
  }))
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
    str: c.str,
    int: c.int,
    dex: c.dex,
    agi: c.agi,
    luk: c.luk,
    vit: c.vit,
    unspentPoints: c.unspentPoints,
    gold: c.gold,
    inventory: inv,
    equipWeapon: c.equipWeaponId,
    equipArmor: c.equipArmorId,
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
      inventory: [],
      equipWeapon: null,
      equipArmor: null,
      map: 'village', px: 5, py: 5, steps: 0,
      transcended: false,
      classChanged: false,
    }
    const withRace = applyRaceModifiers(baseState, starterRace.modifiers)
    const derived = deriveStats(withRace)

    // Slice 47: starter potions are stackable so a single InventoryItem row
    // with qty=DEFAULT_INVENTORY[key] is the natural seed. addItem would
    // also work but inline create keeps the character.create call atomic.
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

    // Slice 45: gold/inventory/equip/plus stripped from this write.
    // Those fields now live behind intent endpoints. The remaining slice
    // (position, stats, lv/exp, hp/mp, quest flags) is the "transient
    // session state" that's safe for client to push wholesale.
    const updated = await app.prisma.character.update({
      where: { id: existing.id },
      data: {
        lv: s.lv, exp: s.exp,
        hp: s.hp, maxHp: s.maxHp, mp: s.mp, maxMp: s.maxMp,
        atk: s.atk, def: s.def, spd: s.spd,
        str: s.str, int: s.int, dex: s.dex,
        agi: s.agi, luk: s.luk, vit: s.vit,
        unspentPoints: s.unspentPoints,
        mapId: s.map, px: s.px, py: s.py, steps: s.steps,
        transcended: s.transcended,
        classChanged: s.classChanged,
      },
      include: { inventory: true },
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

    // Slice 45: same restriction as the by-id PUT.
    const updated = await app.prisma.character.update({
      where: { id: existing.id },
      data: {
        lv: s.lv, exp: s.exp,
        hp: s.hp, maxHp: s.maxHp, mp: s.mp, maxMp: s.maxMp,
        atk: s.atk, def: s.def, spd: s.spd,
        str: s.str, int: s.int, dex: s.dex,
        agi: s.agi, luk: s.luk, vit: s.vit,
        unspentPoints: s.unspentPoints,
        mapId: s.map, px: s.px, py: s.py, steps: s.steps,
        transcended: s.transcended,
        classChanged: s.classChanged,
      },
      include: { inventory: true },
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
  // Slice 47: targets an InventoryItem row by id (not itemKey). Per-instance
  // means each weapon/armor has its own row; equip just flips the FK on the
  // Character — the row itself stays put and keeps its Plus. UI hides any
  // row whose id matches Character.equipWeaponId / equipArmorId.
  app.post('/api/character/:id/equip', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = equipSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    }
    const { id } = req.params as { id: string }
    const { inventoryItemId } = parsed.data

    const existing = await app.prisma.character.findUnique({
      where: { id }, include: { inventory: true },
    })
    if (!existing || existing.userId !== req.userId) {
      return reply.code(404).send({ error: 'character not found' })
    }
    const row = existing.inventory.find((it) => it.id === inventoryItemId)
    if (!row) return reply.code(409).send({ error: 'inventory item not owned' })

    const bundle = await app.contentCache.get()
    const item = bundle.items[row.itemKey]
    if (!item) return reply.code(404).send({ error: 'item not found' })
    if (item.type !== 'weapon' && item.type !== 'armor') {
      return reply.code(400).send({ error: 'item is not equippable' })
    }
    const slotField = item.type === 'weapon' ? 'equipWeaponId' : 'equipArmorId'
    const currentlyEquipped = item.type === 'weapon' ? existing.equipWeaponId : existing.equipArmorId

    // Re-equipping the same row is a no-op.
    if (currentlyEquipped === inventoryItemId) {
      return reply.send({ character: toApiCharacter(existing) })
    }

    // Re-derive stats with the new FK in place. The inventory list doesn't
    // change (the equipped row stays in it; UI filters by id).
    const draft: GameState & { id: string } = {
      ...toApiCharacter(existing),
      ...(item.type === 'weapon' ? { equipWeapon: inventoryItemId } : { equipArmor: inventoryItemId }),
    }
    const next = deriveStats(draft, { items: bundle.items })

    const updated = await app.prisma.$transaction(async (tx) => {
      await tx.character.update({
        where: { id: existing.id },
        data: {
          [slotField]: inventoryItemId,
          maxHp: next.maxHp, maxMp: next.maxMp,
          hp: next.hp, mp: next.mp,
          atk: next.atk, def: next.def, spd: next.spd,
        },
      })
      return tx.character.findUniqueOrThrow({
        where: { id: existing.id }, include: { inventory: true },
      })
    })
    return reply.send({ character: toApiCharacter(updated) })
  })

  // ─── POST /api/character/:id/unequip — Slice 39 intent endpoint ───────────
  // Slice 47: simply clear the FK. The InventoryItem row is unchanged and
  // its Plus is preserved (so re-equipping the same row restores +N).
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
    const slotField = slot === 'weapon' ? 'equipWeaponId' : 'equipArmorId'
    const cleared = slot === 'weapon' ? existing.equipWeaponId : existing.equipArmorId
    if (cleared === null) {
      return reply.send({ character: toApiCharacter(existing) }) // no-op
    }
    const bundle = await app.contentCache.get()

    const draft: GameState & { id: string } = {
      ...toApiCharacter(existing),
      ...(slot === 'weapon' ? { equipWeapon: null } : { equipArmor: null }),
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

    // Slice 47: row.id is the stable handle now that (characterId, itemKey)
    // is no longer unique. mat/consume still stack, so there's at most one
    // row per itemKey for a consume — `row` from findFirst-like above is fine.
    const updated = await app.prisma.$transaction(async (tx) => {
      await tx.character.update({
        where: { id: existing.id },
        data: { hp: newHp, mp: newMp },
      })
      if (row.qty <= 1) {
        await tx.inventoryItem.delete({ where: { id: row.id } })
      } else {
        await tx.inventoryItem.update({
          where: { id: row.id }, data: { qty: row.qty - 1 },
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

    // Slice 47: addItem chooses stack-vs-instance based on ItemType.
    const bundle = await app.contentCache.get()
    const updated = await app.prisma.$transaction(async (tx) => {
      await tx.character.update({
        where: { id: existing.id },
        data: { gold: existing.gold - totalCost },
      })
      await addItem(tx, existing.id, itemKey, qty, bundle.items)
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
    // Build a (itemKey → row) map for mat consumption. Mats are always
    // stackable types so there is at most one row per itemKey. Use the row
    // id for decrement now that (characterId, itemKey) is no longer unique.
    const matRows = new Map(existing.inventory.map((it) => [it.itemKey, it]))
    for (const m of recipe.mats) {
      const r = matRows.get(m.itemId)
      if (!r || r.qty < m.qty) {
        return reply.code(409).send({ error: `insufficient mat: ${m.itemId}` })
      }
    }

    const bundle = await app.contentCache.get()
    const updated = await app.prisma.$transaction(async (tx) => {
      await tx.character.update({
        where: { id: existing.id },
        data: { gold: existing.gold - recipe.gold },
      })
      for (const m of recipe.mats) {
        const r = matRows.get(m.itemId)!
        if (r.qty <= m.qty) {
          await tx.inventoryItem.delete({ where: { id: r.id } })
        } else {
          await tx.inventoryItem.update({
            where: { id: r.id }, data: { qty: r.qty - m.qty },
          })
        }
      }
      // Slice 47: craft result is usually a weapon/armor — addItem creates
      // a fresh per-instance row at plus=0.
      await addItem(tx, existing.id, recipeId, 1, bundle.items)
      return tx.character.findUniqueOrThrow({
        where: { id: existing.id }, include: { inventory: true },
      })
    })
    return reply.send({ character: toApiCharacter(updated) })
  })

  // ─── POST /api/character/:id/enhance — Slice 43 intent endpoint ──────────
  // Server re-runs the pure resolveEnhance with its own RNG (Math.random)
  // — the client can't precompute the outcome or replay a failed roll.
  // Returns the resolved outcome ('ok' | 'fail' | 'no-stone'), the
  // stones spent, the new plus level, and the freshly-derived character.
  app.post('/api/character/:id/enhance', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = enhanceSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    }
    const { id } = req.params as { id: string }
    const { inventoryItemId, npcId } = parsed.data

    const existing = await app.prisma.character.findUnique({
      where: { id }, include: { inventory: true },
    })
    if (!existing || existing.userId !== req.userId) {
      return reply.code(404).send({ error: 'character not found' })
    }
    // Slice 48: ceremony — must be at a Blacksmith on the current map.
    const npc = await app.prisma.npc.findUnique({ where: { id: npcId } })
    if (!npc || npc.kind !== 'blacksmith' || npc.mapId !== existing.mapId) {
      return reply.code(404).send({ error: 'blacksmith not reachable from current map' })
    }
    // Slice 47: target row owned by this character.
    const target = existing.inventory.find((it) => it.id === inventoryItemId)
    if (!target) return reply.code(409).send({ error: 'inventory item not owned' })

    const bundle = await app.contentCache.get()
    const item = bundle.items[target.itemKey]
    if (!item) return reply.code(404).send({ error: 'item not found' })
    if (item.type !== 'weapon' && item.type !== 'armor') {
      return reply.code(400).send({ error: 'item is not enhanceable' })
    }
    // Slice 48: Blacksmith refuses equipped items (U1). The player must
    // unequip first — symmetric with the "ขอตี+ ตอนถอด" mental model.
    if (target.id === existing.equipWeaponId || target.id === existing.equipArmorId) {
      return reply.code(409).send({ error: 'item is equipped' })
    }

    const cur = target.plus
    const stoneRow = existing.inventory.find((it) => it.itemKey === 'plus-stone')
    const stones = stoneRow?.qty ?? 0

    const result = resolveEnhance(cur, stones, existing.gold, Math.random)
    if (result.outcome === 'no-stone') {
      return reply.code(409).send({ error: 'no-stone', cost: result.cost, goldCost: result.goldCost })
    }
    if (result.outcome === 'no-gold') {
      return reply.code(409).send({ error: 'no-gold', cost: result.cost, goldCost: result.goldCost })
    }

    // Re-derive stats so atk/def reflect the new plus. Since the target is
    // guaranteed unequipped here, deriveStats won't actually read it — but
    // we still feed it the bumped inventory so the helper is consistent.
    const updatedInventory: InventoryItem[] = existing.inventory.map((it) =>
      it.id === target.id ? { id: it.id, itemKey: it.itemKey, qty: it.qty, plus: result.newPlus } : { id: it.id, itemKey: it.itemKey, qty: it.qty, plus: it.plus },
    )
    const draft: GameState & { id: string } = {
      ...toApiCharacter(existing),
      inventory: updatedInventory,
      gold: existing.gold - result.goldConsumed,
    }
    const next = deriveStats(draft, { items: bundle.items })

    const updated = await app.prisma.$transaction(async (tx) => {
      // Spend stones from the stack row by id.
      const newStoneQty = stones - result.stonesConsumed
      if (stoneRow) {
        if (newStoneQty <= 0) {
          await tx.inventoryItem.delete({ where: { id: stoneRow.id } })
        } else {
          await tx.inventoryItem.update({
            where: { id: stoneRow.id }, data: { qty: newStoneQty },
          })
        }
      }
      // Update the target row's plus.
      await tx.inventoryItem.update({
        where: { id: target.id }, data: { plus: result.newPlus },
      })
      await tx.character.update({
        where: { id: existing.id },
        data: {
          gold: existing.gold - result.goldConsumed,
          maxHp: next.maxHp, maxMp: next.maxMp,
          hp: next.hp, mp: next.mp,
          atk: next.atk, def: next.def, spd: next.spd,
        },
      })
      return tx.character.findUniqueOrThrow({
        where: { id: existing.id }, include: { inventory: true },
      })
    })
    return reply.send({
      character: toApiCharacter(updated),
      outcome: result.outcome,
      cost: result.cost,
      goldCost: result.goldCost,
      stonesConsumed: result.stonesConsumed,
      goldConsumed: result.goldConsumed,
      newPlus: result.newPlus,
    })
  })

  // ─── POST /api/character/:id/battle/resolve — Slice 44 intent endpoint ──
  // Called once per defeated monster from the client's encounter loop.
  // Server rolls exp, gold, drops (with the 10% plus-stone bonus) from
  // the DB monster def — client can't fake a Lv 99 dragon kill on a
  // larva tile. Honors the Slice 29 quest cap (no level-over-threshold
  // until transcend / class-change resolves).
  app.post('/api/character/:id/battle/resolve', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = battleResolveSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid input', issues: parsed.error.issues })
    }
    const { id } = req.params as { id: string }
    const { monsterId } = parsed.data

    const existing = await app.prisma.character.findUnique({
      where: { id }, include: { inventory: true },
    })
    if (!existing || existing.userId !== req.userId) {
      return reply.code(404).send({ error: 'character not found' })
    }
    const bundle = await app.contentCache.get()
    const monster = bundle.monsters[monsterId]
    if (!monster) return reply.code(404).send({ error: 'monster not found' })

    // ─ Reward roll ─
    const expG = monster.exp
    const goldG = monster.gold + Math.floor(Math.random() * 5)
    const dropList: string[] = []
    // Multi-drop shape from DB (admin can add several).
    if (monster.drops) {
      for (const d of monster.drops) {
        if (Math.random() < d.chance) {
          const minQ = d.minQty ?? 1
          const maxQ = d.maxQty ?? 1
          const qty = minQ + Math.floor(Math.random() * (maxQ - minQ + 1))
          for (let i = 0; i < qty; i++) dropList.push(d.item)
        }
      }
    } else if (monster.drop && Math.random() < monster.drop.chance) {
      // Legacy single-drop fallback for monsters seeded without the
      // multi shape.
      dropList.push(monster.drop.item)
    }
    if (Math.random() < 0.1) dropList.push('plus-stone')

    // ─ Apply exp with quest-pending cap ─
    const racePending  = existing.lv >= TRANSCEND_LV   && !existing.transcended
    const classPending = existing.lv >= CLASS_CHANGE_LV && existing.transcended && !existing.classChanged
    let newLv = existing.lv
    let newExp = existing.exp
    let levelsGained = 0
    if (racePending || classPending) {
      const cap = expForLv(existing.lv) - 1
      newExp = Math.min(existing.exp + expG, cap)
    } else {
      const r = applyExp(existing.lv, existing.exp, expG)
      newLv = r.lv
      newExp = r.exp
      levelsGained = r.levelsGained
    }

    // ─ Re-derive stats only on level up (mirrors client behavior) ─
    const draft: GameState & { id: string } = {
      ...toApiCharacter(existing),
      lv: newLv, exp: newExp, gold: existing.gold + goldG,
    }
    const next = levelsGained > 0
      ? (() => {
          const d = deriveStats(draft, { items: bundle.items })
          // Full heal on level-up matches the client store flow.
          return { ...d, hp: d.maxHp, mp: d.maxMp }
        })()
      : draft

    const updated = await app.prisma.$transaction(async (tx) => {
      await tx.character.update({
        where: { id: existing.id },
        data: {
          lv: next.lv, exp: next.exp, gold: next.gold,
          hp: next.hp, mp: next.mp,
          maxHp: next.maxHp, maxMp: next.maxMp,
          atk: next.atk, def: next.def, spd: next.spd,
        },
      })
      // Slice 47: group drops by key and call addItem — stackable types
      // bump qty on the existing row; weapon/armor INSERT one row per drop
      // so each instance carries its own (initially 0) Plus.
      const dropQty: Record<string, number> = {}
      for (const k of dropList) dropQty[k] = (dropQty[k] ?? 0) + 1
      for (const [itemKey, qty] of Object.entries(dropQty)) {
        await addItem(tx, existing.id, itemKey, qty, bundle.items)
      }
      return tx.character.findUniqueOrThrow({
        where: { id: existing.id }, include: { inventory: true },
      })
    })

    return reply.send({
      character: toApiCharacter(updated),
      rewards: { exp: expG, gold: goldG, items: dropList, levelsGained },
    })
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
