-- CreateEnum
CREATE TYPE "MonsterRank" AS ENUM ('normal', 'elite', 'boss');

-- CreateTable
CREATE TABLE "Monster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "rank" "MonsterRank" NOT NULL DEFAULT 'normal',
    "lv" INTEGER NOT NULL,
    "hp" INTEGER NOT NULL,
    "atk" INTEGER NOT NULL,
    "def" INTEGER NOT NULL,
    "spd" INTEGER NOT NULL,
    "exp" INTEGER NOT NULL,
    "gold" INTEGER NOT NULL,

    CONSTRAINT "Monster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonsterDrop" (
    "id" TEXT NOT NULL,
    "monsterId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "chance" DOUBLE PRECISION NOT NULL,
    "minQty" INTEGER NOT NULL DEFAULT 1,
    "maxQty" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "MonsterDrop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonsterDrop_monsterId_idx" ON "MonsterDrop"("monsterId");

-- CreateIndex
CREATE UNIQUE INDEX "MonsterDrop_monsterId_itemId_key" ON "MonsterDrop"("monsterId", "itemId");

-- AddForeignKey
ALTER TABLE "MonsterDrop" ADD CONSTRAINT "MonsterDrop_monsterId_fkey" FOREIGN KEY ("monsterId") REFERENCES "Monster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonsterDrop" ADD CONSTRAINT "MonsterDrop_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
