CREATE TABLE "MahjongGame" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PLAYING',
  "state" JSONB NOT NULL,
  "eventSeq" INTEGER NOT NULL DEFAULT 0,
  "actionSeq" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MahjongGame_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MahjongEvent" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actionSeq" INTEGER NOT NULL,
  "eventSeq" INTEGER NOT NULL,
  "actorSeat" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "tile" INTEGER,
  "tiles" JSONB NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MahjongEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MahjongGame_id_key" ON "MahjongGame"("id");
CREATE INDEX "MahjongGame_ownerId_status_updatedAt_idx" ON "MahjongGame"("ownerId", "status", "updatedAt");
CREATE UNIQUE INDEX "MahjongEvent_gameId_actionSeq_key" ON "MahjongEvent"("gameId", "actionSeq");
CREATE INDEX "MahjongEvent_gameId_eventSeq_idx" ON "MahjongEvent"("gameId", "eventSeq");
CREATE INDEX "MahjongEvent_actorUserId_createdAt_idx" ON "MahjongEvent"("actorUserId", "createdAt");

ALTER TABLE "MahjongGame" ADD CONSTRAINT "MahjongGame_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MahjongEvent" ADD CONSTRAINT "MahjongEvent_gameId_fkey"
  FOREIGN KEY ("gameId") REFERENCES "MahjongGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MahjongEvent" ADD CONSTRAINT "MahjongEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;