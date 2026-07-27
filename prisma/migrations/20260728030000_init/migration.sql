-- CreateEnum
CREATE TYPE "SurveyKind" AS ENUM ('ITEMS', 'FINANCIAL', 'CONJOINED');

-- CreateEnum
CREATE TYPE "Perspective" AS ENUM ('SELF', 'PARTNER', 'PARTNER_GUESS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Couple" (
    "id" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "joinerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3),

    CONSTRAINT "Couple_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "subject" TEXT NOT NULL,
    "usefulness" INTEGER,
    "enjoyment" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedInsight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "perspective" TEXT NOT NULL,
    "nAnswers" INTEGER NOT NULL,
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "SurveyKind" NOT NULL DEFAULT 'ITEMS',
    "identitySurveySlug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "dimensions" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipantItemRating" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 1500,
    "rd" DOUBLE PRECISION NOT NULL DEFAULT 350,
    "volatility" DOUBLE PRECISION NOT NULL DEFAULT 0.06,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParticipantItemRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "userId" TEXT,
    "perspective" "Perspective" NOT NULL DEFAULT 'PARTNER',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "email" TEXT,
    "sex" TEXT,
    "age" INTEGER,
    "ethnicity" TEXT,
    "countryOfResidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trial" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "itemAId" TEXT NOT NULL,
    "itemBId" TEXT NOT NULL,
    "shownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT,
    "answeredAt" TIMESTAMP(3),
    "msToAnswer" INTEGER,
    "msSincePrevAnswer" INTEGER,
    "itemARatingBefore" DOUBLE PRECISION,
    "itemBRatingBefore" DOUBLE PRECISION,
    "itemARdBefore" DOUBLE PRECISION,
    "itemBRdBefore" DOUBLE PRECISION,
    "itemARatingAfter" DOUBLE PRECISION,
    "itemBRatingAfter" DOUBLE PRECISION,
    "itemARdAfter" DOUBLE PRECISION,
    "itemBRdAfter" DOUBLE PRECISION,

    CONSTRAINT "Trial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTrial" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "identityItemAId" TEXT,
    "incomeA" DOUBLE PRECISION NOT NULL,
    "netWorthA" DOUBLE PRECISION NOT NULL,
    "futurePotentialA" DOUBLE PRECISION NOT NULL,
    "yearsToRealizeA" DOUBLE PRECISION NOT NULL,
    "weeklyHoursA" DOUBLE PRECISION NOT NULL,
    "identityItemBId" TEXT,
    "incomeB" DOUBLE PRECISION NOT NULL,
    "netWorthB" DOUBLE PRECISION NOT NULL,
    "futurePotentialB" DOUBLE PRECISION NOT NULL,
    "yearsToRealizeB" DOUBLE PRECISION NOT NULL,
    "weeklyHoursB" DOUBLE PRECISION NOT NULL,
    "shownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT,
    "answeredAt" TIMESTAMP(3),
    "msToAnswer" INTEGER,
    "msSincePrevAnswer" INTEGER,

    CONSTRAINT "FinancialTrial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyFit" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "nu" DOUBLE PRECISION NOT NULL,
    "covariance" JSONB NOT NULL,
    "nTrials" INTEGER NOT NULL,
    "logLikelihood" DOUBLE PRECISION NOT NULL,
    "fittedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveyFit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminLoginAttempt" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminLoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Couple_inviteCode_key" ON "Couple"("inviteCode");

-- CreateIndex
CREATE INDEX "Couple_creatorId_idx" ON "Couple"("creatorId");

-- CreateIndex
CREATE INDEX "Couple_joinerId_idx" ON "Couple"("joinerId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- CreateIndex
CREATE INDEX "InsightFeedback_subject_createdAt_idx" ON "InsightFeedback"("subject", "createdAt");

-- CreateIndex
CREATE INDEX "InsightFeedback_userId_idx" ON "InsightFeedback"("userId");

-- CreateIndex
CREATE INDEX "GeneratedInsight_userId_createdAt_idx" ON "GeneratedInsight"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LlmUsage_userId_createdAt_idx" ON "LlmUsage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_email_createdAt_idx" ON "LoginAttempt"("email", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_ip_createdAt_idx" ON "LoginAttempt"("ip", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Survey_slug_key" ON "Survey"("slug");

-- CreateIndex
CREATE INDEX "Item_surveyId_idx" ON "Item"("surveyId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_surveyId_slug_key" ON "Item"("surveyId", "slug");

-- CreateIndex
CREATE INDEX "ParticipantItemRating_participantId_idx" ON "ParticipantItemRating"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "ParticipantItemRating_participantId_itemId_key" ON "ParticipantItemRating"("participantId", "itemId");

-- CreateIndex
CREATE INDEX "Participant_surveyId_idx" ON "Participant"("surveyId");

-- CreateIndex
CREATE INDEX "Participant_userId_idx" ON "Participant"("userId");

-- CreateIndex
CREATE INDEX "Trial_participantId_idx" ON "Trial"("participantId");

-- CreateIndex
CREATE INDEX "Trial_itemAId_idx" ON "Trial"("itemAId");

-- CreateIndex
CREATE INDEX "Trial_itemBId_idx" ON "Trial"("itemBId");

-- CreateIndex
CREATE INDEX "FinancialTrial_surveyId_idx" ON "FinancialTrial"("surveyId");

-- CreateIndex
CREATE INDEX "FinancialTrial_participantId_idx" ON "FinancialTrial"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyFit_participantId_key" ON "SurveyFit"("participantId");

-- CreateIndex
CREATE INDEX "SurveyFit_surveyId_idx" ON "SurveyFit"("surveyId");

-- CreateIndex
CREATE INDEX "AdminLoginAttempt_ip_createdAt_idx" ON "AdminLoginAttempt"("ip", "createdAt");

-- AddForeignKey
ALTER TABLE "Couple" ADD CONSTRAINT "Couple_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Couple" ADD CONSTRAINT "Couple_joinerId_fkey" FOREIGN KEY ("joinerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantItemRating" ADD CONSTRAINT "ParticipantItemRating_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantItemRating" ADD CONSTRAINT "ParticipantItemRating_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trial" ADD CONSTRAINT "Trial_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trial" ADD CONSTRAINT "Trial_itemAId_fkey" FOREIGN KEY ("itemAId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trial" ADD CONSTRAINT "Trial_itemBId_fkey" FOREIGN KEY ("itemBId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTrial" ADD CONSTRAINT "FinancialTrial_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTrial" ADD CONSTRAINT "FinancialTrial_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTrial" ADD CONSTRAINT "FinancialTrial_identityItemAId_fkey" FOREIGN KEY ("identityItemAId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTrial" ADD CONSTRAINT "FinancialTrial_identityItemBId_fkey" FOREIGN KEY ("identityItemBId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyFit" ADD CONSTRAINT "SurveyFit_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyFit" ADD CONSTRAINT "SurveyFit_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

