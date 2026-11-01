ALTER TABLE "Friendship" ADD COLUMN "pairKey" TEXT;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY LEAST("requesterId", "addresseeId"), GREATEST("requesterId", "addresseeId")
    ORDER BY "updatedAt" DESC, "id" DESC
  ) AS position
  FROM "Friendship"
)
DELETE FROM "Friendship"
USING ranked
WHERE "Friendship"."id" = ranked."id"
  AND ranked.position > 1;

UPDATE "Friendship"
SET "pairKey" = LEAST("requesterId", "addresseeId") || ':' || GREATEST("requesterId", "addresseeId");

ALTER TABLE "Friendship" ALTER COLUMN "pairKey" SET NOT NULL;
CREATE UNIQUE INDEX "Friendship_pairKey_key" ON "Friendship"("pairKey");