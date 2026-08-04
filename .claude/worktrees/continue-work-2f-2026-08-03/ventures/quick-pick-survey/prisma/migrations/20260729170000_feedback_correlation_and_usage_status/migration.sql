ALTER TABLE "InsightFeedback"
  ADD COLUMN "clientFeedbackId" TEXT,
  ADD COLUMN "sessionKeyHash" TEXT;

ALTER TABLE "UsageEvent"
  ADD COLUMN "statusCode" INTEGER;

CREATE UNIQUE INDEX "InsightFeedback_clientFeedbackId_key"
  ON "InsightFeedback"("clientFeedbackId");

CREATE INDEX "InsightFeedback_sessionKeyHash_createdAt_idx"
  ON "InsightFeedback"("sessionKeyHash", "createdAt");
