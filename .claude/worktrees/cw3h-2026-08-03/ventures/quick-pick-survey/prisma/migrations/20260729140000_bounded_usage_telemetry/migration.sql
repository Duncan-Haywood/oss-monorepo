CREATE TABLE "UsageEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "sessionKeyHash" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "path" TEXT,
  "perspective" "Perspective",
  "domain" TEXT,
  "durationMs" INTEGER,
  "success" BOOLEAN,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "UsageEvent_event_createdAt_idx" ON "UsageEvent"("event", "createdAt");
CREATE INDEX "UsageEvent_sessionKeyHash_createdAt_idx" ON "UsageEvent"("sessionKeyHash", "createdAt");
CREATE INDEX "UsageEvent_userId_createdAt_idx" ON "UsageEvent"("userId", "createdAt");
CREATE INDEX "UsageEvent_createdAt_idx" ON "UsageEvent"("createdAt");
