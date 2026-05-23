-- Slice 47: per-instance gear inventory.
-- See docs/adr/0003-per-instance-identity-for-gear-inventory.md
--
-- Destructive: drops Character.plus/equipWeapon/equipArmor (string itemKey
-- columns) and replaces equipWeapon/Armor with FKs to InventoryItem.id.
-- Phase 2 MVP, no prod data — accept full reseed via `prisma migrate reset`.

-- DropIndex
DROP INDEX "public"."InventoryItem_characterId_itemKey_key";

-- AlterTable
ALTER TABLE "public"."Character"
  DROP COLUMN "equipArmor",
  DROP COLUMN "equipWeapon",
  DROP COLUMN "plus",
  ADD COLUMN "equipArmorId" TEXT,
  ADD COLUMN "equipWeaponId" TEXT;

-- AlterTable
ALTER TABLE "public"."InventoryItem"
  ADD COLUMN "plus" INTEGER NOT NULL DEFAULT 0,
  ALTER COLUMN "qty" SET DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "Character_equipWeaponId_key" ON "public"."Character"("equipWeaponId");

-- CreateIndex
CREATE UNIQUE INDEX "Character_equipArmorId_key" ON "public"."Character"("equipArmorId");

-- CreateIndex
CREATE INDEX "InventoryItem_characterId_itemKey_idx" ON "public"."InventoryItem"("characterId", "itemKey");

-- AddForeignKey
ALTER TABLE "public"."Character"
  ADD CONSTRAINT "Character_equipWeaponId_fkey"
  FOREIGN KEY ("equipWeaponId") REFERENCES "public"."InventoryItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Character"
  ADD CONSTRAINT "Character_equipArmorId_fkey"
  FOREIGN KEY ("equipArmorId") REFERENCES "public"."InventoryItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
