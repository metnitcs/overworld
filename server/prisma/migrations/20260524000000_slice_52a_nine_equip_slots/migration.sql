-- Slice 52a: nine equipment slots.
-- Extends ItemType enum + adds 7 new equip*Id FK columns on Character.
-- All new equip slots point to InventoryItem.id with ON DELETE SET NULL
-- so deleting an equipped row auto-clears the slot (same pattern as
-- weapon/armor from Slice 47).

-- 1. Extend ItemType enum (Postgres requires ADD VALUE one at a time).
ALTER TYPE "public"."ItemType" ADD VALUE 'shield';
ALTER TYPE "public"."ItemType" ADD VALUE 'helmet';
ALTER TYPE "public"."ItemType" ADD VALUE 'boots';
ALTER TYPE "public"."ItemType" ADD VALUE 'cloak';
ALTER TYPE "public"."ItemType" ADD VALUE 'necklace';
ALTER TYPE "public"."ItemType" ADD VALUE 'ring';

-- 2. Add 7 new equip*Id FK columns on Character. All nullable.
ALTER TABLE "public"."Character"
  ADD COLUMN "equipShieldId"   TEXT,
  ADD COLUMN "equipHelmetId"   TEXT,
  ADD COLUMN "equipBootsId"    TEXT,
  ADD COLUMN "equipCloakId"    TEXT,
  ADD COLUMN "equipNecklaceId" TEXT,
  ADD COLUMN "equipRing1Id"    TEXT,
  ADD COLUMN "equipRing2Id"    TEXT;

-- 3. Unique indexes — each FK points to at most one InventoryItem row.
CREATE UNIQUE INDEX "Character_equipShieldId_key"   ON "public"."Character"("equipShieldId");
CREATE UNIQUE INDEX "Character_equipHelmetId_key"   ON "public"."Character"("equipHelmetId");
CREATE UNIQUE INDEX "Character_equipBootsId_key"    ON "public"."Character"("equipBootsId");
CREATE UNIQUE INDEX "Character_equipCloakId_key"    ON "public"."Character"("equipCloakId");
CREATE UNIQUE INDEX "Character_equipNecklaceId_key" ON "public"."Character"("equipNecklaceId");
CREATE UNIQUE INDEX "Character_equipRing1Id_key"    ON "public"."Character"("equipRing1Id");
CREATE UNIQUE INDEX "Character_equipRing2Id_key"    ON "public"."Character"("equipRing2Id");

-- 4. FK constraints with ON DELETE SET NULL (matches Slice 47 pattern).
ALTER TABLE "public"."Character"
  ADD CONSTRAINT "Character_equipShieldId_fkey"
  FOREIGN KEY ("equipShieldId") REFERENCES "public"."InventoryItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."Character"
  ADD CONSTRAINT "Character_equipHelmetId_fkey"
  FOREIGN KEY ("equipHelmetId") REFERENCES "public"."InventoryItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."Character"
  ADD CONSTRAINT "Character_equipBootsId_fkey"
  FOREIGN KEY ("equipBootsId") REFERENCES "public"."InventoryItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."Character"
  ADD CONSTRAINT "Character_equipCloakId_fkey"
  FOREIGN KEY ("equipCloakId") REFERENCES "public"."InventoryItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."Character"
  ADD CONSTRAINT "Character_equipNecklaceId_fkey"
  FOREIGN KEY ("equipNecklaceId") REFERENCES "public"."InventoryItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."Character"
  ADD CONSTRAINT "Character_equipRing1Id_fkey"
  FOREIGN KEY ("equipRing1Id") REFERENCES "public"."InventoryItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."Character"
  ADD CONSTRAINT "Character_equipRing2Id_fkey"
  FOREIGN KEY ("equipRing2Id") REFERENCES "public"."InventoryItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

