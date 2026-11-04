# ai-bookkeeper: Ramp and SumUp readers (2026-11-04)

`bank.mjs`: alias `user transaction time` (date), SumUp net-amount rule in `detectColumns`, `sniffBank` label `ramp` (card spend positive, flipped like Discover). Tests in `ramp-sumup.test.mjs`. Headers are from memory; the unknowns are real exports. Still without fixtures: bunq (reads fine, Description wins over Name), Lunar, Zettle.
