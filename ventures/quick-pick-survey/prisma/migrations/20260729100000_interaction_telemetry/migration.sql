ALTER TABLE "Trial"
ADD COLUMN "clientMsToAnswer" INTEGER,
ADD COLUMN "interactionMethod" TEXT;

ALTER TABLE "FinancialTrial"
ADD COLUMN "clientMsToAnswer" INTEGER,
ADD COLUMN "interactionMethod" TEXT;

ALTER TABLE "User"
ADD COLUMN "gender" TEXT,
ADD COLUMN "seeking" TEXT;

ALTER TABLE "Participant"
ADD COLUMN "seeking" TEXT;

CREATE TABLE "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_email_createdAt_idx" ON "PasswordResetToken"("email", "createdAt");
CREATE INDEX "PasswordResetToken_tokenHash_idx" ON "PasswordResetToken"("tokenHash");
