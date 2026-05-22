-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('mat', 'consume', 'weapon', 'armor');

-- CreateEnum
CREATE TYPE "Rarity" AS ENUM ('common', 'rare', 'epic', 'legendary');

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "type" "ItemType" NOT NULL,
    "rarity" "Rarity" NOT NULL DEFAULT 'common',
    "atk" INTEGER,
    "def" INTEGER,
    "matk" INTEGER,
    "heal" INTEGER,
    "healMp" INTEGER,
    "desc" TEXT NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);
