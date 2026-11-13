# Pre-registration: GARCH cuts searched jointly, with the GARCH terms penalised (2026-11-13)

Written and committed before the run it describes. Context: README, "Pruning meanvar cuts with a segment-wise GARCH
likelihood": pruning plain meanvar's cuts with a shared-GARCH segment likelihood removed the true variance break, and
"candidates searched jointly with the GARCH fit" was the open route.

**Method** (`garchChoose` in `eval/meanvar-garch-binseg.mjs`). Greedy forward search over every cut position on the
segment-wise likelihood (own mean and scale per segment, unit-variance GARCH(1,1) inside, a and b shared and taken from
the same 24-point grid). Run twice: with a = b = 0 (independent noise) and on the GARCH grid. Keep the cut set with the
highest LL - 1.5 ln n per cut - (0.25 ln n if GARCH). Segments at least 10 points.

**What was tuned, in sample** (the seeds of `meanvar-garch-segments.mjs`, shift 0, 100 per cell;
`eval/meanvar-garch-choose-tuning.out.txt`): the per-cut penalty (1 to 2 ln n for the GARCH-only search) and the GARCH
penalty (0.25, 0.5, 1 ln n). Without a GARCH penalty the search lost the Gaussian sd break at n = 100 (61%); at 1 ln n
GARCH false alarms at n = 100 rose to 31%. 0.25 was the best of the three. In sample, against `--bootstrap` on the same
seeds: GARCH n = 200, 5% / 67% / 94% against 20% / 77% / 76% (null any change / sd 1 to 2 exactly one / mean +1.5
exactly one); n = 100, 14% / 56% / 77% against 17% / 51% / 83%; Gaussian n = 100, 3% / 79% / 96% against 2% / 81% / 98%.

**Run.** `node eval/meanvar-garch-compare.mjs 200 2000003 1.5 1.5 0.25 bootstrap,choose` (fresh seeds: every seed
moved by 2,000,003, 200 series per cell). Nothing is tuned on this run.

**Bar** (all at once; `--bootstrap` read on the same fresh seeds):

1. GARCH null false alarms at n = 200 at most 10% and at most half of `--bootstrap`'s;
2. mean +1.5 shift on GARCH noise at least `--bootstrap`'s minus 5 points, at both n;
3. sd 1 to 2 break on GARCH noise at least `--bootstrap`'s minus 12 points at n = 200, minus 5 at n = 100;
4. Gaussian: null at most 4% at both n, sd break at least 75% at n = 100 and 95% at n = 200, mean shift at least 93%.

t3 has no bar: a GARCH model is not meant for heavy tails without clustering, and `--bootstrap` stays the option there.
The t3 rows are reported whatever they show.

If it passes, it ships as an option for clustered volatility beside `--bootstrap`, with a test, and is then run on the
real return series already in the repository (DJIA, DAX, S&P 500) as a description, not as evidence. If it fails, the
README records the negative result and nothing ships.
