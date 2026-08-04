ALTER TABLE "UserReport"
  ADD COLUMN "impact" TEXT,
  ADD COLUMN "perspective" "Perspective";

CREATE INDEX "UserReport_impact_createdAt_idx"
  ON "UserReport"("impact", "createdAt");
