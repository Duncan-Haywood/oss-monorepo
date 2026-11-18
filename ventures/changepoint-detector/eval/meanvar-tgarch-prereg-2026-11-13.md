# Pre-registration: Student t innovations in the `--garch` search (2026-11-13)

Written and committed before the run it describes. Context: README, "Cuts searched jointly with a GARCH likelihood":
the shipped search (Gaussian innovations) raised a false change on 44-49% of t3 series, because a Gaussian segment
likelihood reads one heavy-tailed move as a change of volatility.

**Method** (`garchCuts` in `engine.mjs` with `tPen`). Two more paths in the model choice: independent Student t noise
and t-GARCH (Bollerslev 1987), the standardised residual a unit-variance t with nu from {4, 8}, sharing a, b and nu
across segments. Each segment's mean and scale come from four EM passes (weights (nu + 1) / (nu - 2 + z^2)). A t path pays
tPen on top of the existing per-cut (1.5 ln n) and GARCH-term (0.25 ln n) penalties.

**What was tuned, in sample** (shift 0, 100 per cell; `eval/meanvar-tgarch-tuning.out.txt`): tPen in {0.25, 0.5, 1} ln n.
0.5 was taken: 0.25 does slightly better on heavy tails (t-GARCH null 17% vs 23% at n = 100) but costs 5 points on the
GARCH-noise sd break at n = 100 (51% vs 56% shipped) where 0.5 costs 2. The grid {4, 8} and the four EM passes were fixed
before tuning and not varied. Known bias: the shipped Gaussian GARCH path is slightly under-converged (two scale passes,
unweighted mean), so a t path at very large nu scores up to ~0.3 higher per segment; tPen at n = 100 is 2.3.

**Run.** `node eval/meanvar-tgarch.mjs 200 3000003 off,0.5` (fresh seeds: every seed moved by 3,000,003; 200 series per
cell; "off" is the shipped search on the same series). Nothing is tuned on this run.

**Bar** (all at once; null any change / sd 1 to 2 found exactly once / mean +1.5 found exactly once):

1. t3 null false alarms at most 10% at both n;
2. t3 mean shift at least 85% at both n; t3 sd break at least the shipped search's minus 5 points;
3. t-GARCH (t5 innovations, clustered) null at most 15% at n = 200 and below the shipped search's at n = 100;
4. Gaussian and GARCH noise: null at most 2 points above the shipped search, sd break at least the shipped search's minus
   5 points, mean shift at least the shipped search's minus 3 points, at both n.

If it passes, the t paths ship as the default inside `--garch` (with `--garch-gaussian` / `garchTails: false` for the
old search), with a test, and the real return series already in the repository are run as descriptions, not evidence.
If it fails, the README records the negative result and nothing ships.
