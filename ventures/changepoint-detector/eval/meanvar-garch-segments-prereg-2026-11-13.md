# Pre-registration: a capped-persistence GARCH prune for `meanvar` (2026-11-13)

Written before the run it describes. Context: README, "Pruning meanvar cuts with a segment-wise GARCH
likelihood". On 2026-11-13 that script was found to pass changepoint objects, not indexes, into the
segment likelihood, so every total was NaN and its 2026-11-02 table measured nothing. With indexes
(same seeds, 100 per cell), a per-cut penalty of 1.5 ln n gave GARCH null false alarms of 10% / 9%
(n = 100 / 200) but found the sd 1 to 2 break on GARCH noise only 45% / 61% of the time, and on
Gaussian noise at n = 100 only 61%. The penalty was swept on those seeds, so they are not evidence.

**Hypothesis.** High-persistence grid points (a + b above 0.9) are what let a shared GARCH absorb a
lasting variance step. Capping the grid at a + b <= 0.9 keeps the step a cut while the clustered
volatility is still explained.

**Run.** `node eval/meanvar-garch-segments.mjs 200 1.5 0.9 1000003` (fresh seeds: every seed moved by
1,000,003, 200 series per cell). Penalty 1.5 ln n and cap 0.9 are fixed now and not tuned on this run.

**Bar** (all at once; compared with `--bootstrap`, the shipped option, README table):

1. GARCH null false alarms at n = 200 at most 10% (bootstrap 16%);
2. sd 1 to 2 break found exactly once on GARCH noise at n = 200 at least 74% (bootstrap 74%);
3. Gaussian: null false alarms at most 2% at both n, sd break at least 90% at n = 200 and at least
   80% at n = 100 (bootstrap 80%);
4. mean +1.5 shift found exactly once at least the plain rate on every cell.

If it passes, the next step is an option wired into `analyze` with its own test. If it fails, the
README records the negative result and the corrected 2026-11-02 table; nothing ships.
