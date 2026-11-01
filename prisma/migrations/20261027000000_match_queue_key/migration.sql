ALTER TABLE "MatchTicket" ADD COLUMN "queueKey" TEXT;

WITH ranked AS (
	SELECT "id", ROW_NUMBER() OVER (
		PARTITION BY "userId"
		ORDER BY "createdAt" DESC, "id" DESC
	) AS position
	FROM "MatchTicket"
	WHERE "status" = 'QUEUED'
)
UPDATE "MatchTicket"
SET "status" = 'EXPIRED'
FROM ranked
WHERE "MatchTicket"."id" = ranked."id"
	AND ranked.position > 1;

UPDATE "MatchTicket"
SET "queueKey" = "userId"
WHERE "status" = 'QUEUED';

CREATE UNIQUE INDEX "MatchTicket_queueKey_key" ON "MatchTicket"("queueKey");