-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "agi" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "dex" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "int" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "luk" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "str" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "unspentPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vit" INTEGER NOT NULL DEFAULT 10;

-- Slice 23 backfill: every existing character gets the proper unspent pool
-- so a Lv-5 char created before Slice 23 has 20 points to spend now.
UPDATE "Character" SET "unspentPoints" = ("lv" - 1) * 5 WHERE "unspentPoints" = 0;
