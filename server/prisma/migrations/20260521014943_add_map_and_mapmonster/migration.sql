-- CreateTable
CREATE TABLE "Map" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minLv" INTEGER NOT NULL,
    "maxLv" INTEGER NOT NULL,
    "w" INTEGER NOT NULL,
    "h" INTEGER NOT NULL,
    "bg" TEXT NOT NULL,
    "pathColor" TEXT,
    "monsterCount" INTEGER NOT NULL DEFAULT 0,
    "layout" JSONB NOT NULL,

    CONSTRAINT "Map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapMonster" (
    "mapId" TEXT NOT NULL,
    "monsterId" TEXT NOT NULL,
    "spawnWeight" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "MapMonster_pkey" PRIMARY KEY ("mapId","monsterId")
);

-- CreateIndex
CREATE INDEX "MapMonster_mapId_idx" ON "MapMonster"("mapId");

-- AddForeignKey
ALTER TABLE "MapMonster" ADD CONSTRAINT "MapMonster_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "Map"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapMonster" ADD CONSTRAINT "MapMonster_monsterId_fkey" FOREIGN KEY ("monsterId") REFERENCES "Monster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
