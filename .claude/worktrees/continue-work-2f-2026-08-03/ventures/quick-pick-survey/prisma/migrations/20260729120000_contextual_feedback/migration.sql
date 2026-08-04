ALTER TABLE "InsightFeedback"
  ADD COLUMN "reason" TEXT,
  ADD COLUMN "answerCount" INTEGER,
  ADD COLUMN "perspective" "Perspective",
  ADD COLUMN "path" TEXT;

CREATE INDEX "InsightFeedback_reason_createdAt_idx"
  ON "InsightFeedback"("reason", "createdAt");
