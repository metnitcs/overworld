-- CreateTable
CREATE TABLE "Warp" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "toMapId" TEXT NOT NULL,
    "tx" INTEGER NOT NULL,
    "ty" INTEGER NOT NULL,
    "label" TEXT,

    CONSTRAINT "Warp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Warp_mapId_idx" ON "Warp"("mapId");

-- CreateIndex
CREATE UNIQUE INDEX "Warp_mapId_x_y_key" ON "Warp"("mapId", "x", "y");

-- AddForeignKey
ALTER TABLE "Warp" ADD CONSTRAINT "Warp_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "Map"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warp" ADD CONSTRAINT "Warp_toMapId_fkey" FOREIGN KEY ("toMapId") REFERENCES "Map"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
