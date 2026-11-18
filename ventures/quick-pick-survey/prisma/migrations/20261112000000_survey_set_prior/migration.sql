-- One pooled empirical-Bayes prior sd per survey for the insights card's
-- "it's between" set (src/lib/surveyPrior.ts), with the respondents and the
-- survey's decided-answer count it was estimated from. NULL until a refresh.
ALTER TABLE "Survey" ADD COLUMN "setPriorPhi" DOUBLE PRECISION;
ALTER TABLE "Survey" ADD COLUMN "setPriorRespondents" INTEGER;
ALTER TABLE "Survey" ADD COLUMN "setPriorAnswers" INTEGER;
ALTER TABLE "Survey" ADD COLUMN "setPriorAt" TIMESTAMP(3);
