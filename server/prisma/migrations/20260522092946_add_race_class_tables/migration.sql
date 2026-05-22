-- CreateTable
CREATE TABLE "Race" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "desc" TEXT NOT NULL,
    "modifiers" JSONB NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "starter" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Race_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharClass" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "desc" TEXT NOT NULL,
    "growth" JSONB NOT NULL,
    "skill" JSONB NOT NULL,
    "starter" BOOLEAN NOT NULL DEFAULT false,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "requiredRaceId" TEXT,

    CONSTRAINT "CharClass_pkey" PRIMARY KEY ("id")
);
