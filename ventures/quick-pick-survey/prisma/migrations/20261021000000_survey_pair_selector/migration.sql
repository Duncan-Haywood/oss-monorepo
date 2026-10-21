-- Per-survey choice of pair selector; NULL follows the PAIR_SELECTOR env var.
ALTER TABLE "Survey" ADD COLUMN "pairSelector" TEXT;
