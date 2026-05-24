-- Slice 51: per-item primary stat bonuses that ride along with equipped
-- weapon/armor. Nullable (most items won't carry them). Not scaled by Plus.

ALTER TABLE "public"."Item"
  ADD COLUMN "bonusStr" INTEGER,
  ADD COLUMN "bonusInt" INTEGER,
  ADD COLUMN "bonusDex" INTEGER,
  ADD COLUMN "bonusAgi" INTEGER,
  ADD COLUMN "bonusLuk" INTEGER,
  ADD COLUMN "bonusVit" INTEGER;
