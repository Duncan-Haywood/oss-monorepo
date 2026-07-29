CREATE TABLE "CoupleChallenge" (
    "id" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "challengerCoupleId" TEXT NOT NULL,
    "challengedCoupleId" TEXT,
    "deckId" TEXT DEFAULT 'core-values',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoupleChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoupleChallenge_inviteCode_key"
    ON "CoupleChallenge"("inviteCode");

CREATE INDEX "CoupleChallenge_challengerCoupleId_idx"
    ON "CoupleChallenge"("challengerCoupleId");

CREATE INDEX "CoupleChallenge_challengedCoupleId_idx"
    ON "CoupleChallenge"("challengedCoupleId");

ALTER TABLE "CoupleChallenge"
    ADD CONSTRAINT "CoupleChallenge_challengerCoupleId_fkey"
    FOREIGN KEY ("challengerCoupleId") REFERENCES "Couple"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CoupleChallenge"
    ADD CONSTRAINT "CoupleChallenge_challengedCoupleId_fkey"
    FOREIGN KEY ("challengedCoupleId") REFERENCES "Couple"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
