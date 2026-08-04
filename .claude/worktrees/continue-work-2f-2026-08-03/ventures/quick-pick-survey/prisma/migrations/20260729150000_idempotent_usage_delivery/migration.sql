ALTER TABLE "UsageEvent" ADD COLUMN "clientEventId" TEXT;
ALTER TABLE "UsageEvent" ADD COLUMN "sequence" INTEGER;
ALTER TABLE "UsageEvent" ADD COLUMN "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "UsageEvent"
SET "clientEventId" = "id", "sequence" = 0, "occurredAt" = "createdAt"
WHERE "clientEventId" IS NULL;

ALTER TABLE "UsageEvent" ALTER COLUMN "clientEventId" SET NOT NULL;
ALTER TABLE "UsageEvent" ALTER COLUMN "sequence" SET NOT NULL;

CREATE UNIQUE INDEX "UsageEvent_clientEventId_key" ON "UsageEvent"("clientEventId");
