import type { Prisma, PrismaClient } from '@prisma/client'
import type { ItemDef } from '@asura/shared'

/** Slice 50: extracted from character.ts so both player intent endpoints
 *  and admin GM-grant endpoints share the same stack-policy rule.
 *
 *  Weapon/armor are per-instance — every unit gets its own InventoryItem
 *  row with qty=1, plus defaults to 0 (or the caller's override). Mat /
 *  consume stack — upsert by (characterId, itemKey) and increment qty.
 *  Unknown itemKey falls back to per-instance (defensive — never expected). */
export type Tx = Prisma.TransactionClient | PrismaClient

export async function addItem(
  tx: Tx,
  characterId: string,
  itemKey: string,
  qty: number,
  items: Record<string, ItemDef>,
  opts: { plus?: number } = {},
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
    const plus = opts.plus ?? 0
    for (let i = 0; i < qty; i++) {
      await tx.inventoryItem.create({
        data: { characterId, itemKey, qty: 1, plus },
      })
    }
  }
}
