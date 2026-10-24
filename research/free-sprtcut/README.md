# Can a capped sequential rollout test keep its 5% error guarantee, and what does it cost? (free choice)

Pure Python, no dependencies beyond the sibling project `free-sprtcert` (imported for its exact SPRT pieces). **Free-choice project** (`PROJECTS.md`, "Picking work", step 1; draw 0.044). Why it seemed worth doing: `research/free-sprtcap` showed that adding a rollout cap to Wald's SPRT inflates the error by 34 to 38% at a cap equal to the fixed test's size, and listed "re-tune the boundaries (or the final cut) so the capped test holds 5% exactly" as its next step. A certification run has both a compute budget and an error guarantee; this project prices holding both.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/free-sprtcut/

## Question

For certifying a failure rate (accept at p1, reject at p0, both errors at most 5%) with at most `cap` rollouts: if the two stopping boundaries and the final decision cut are chosen to keep both achieved errors within 5%, how many rollouts does the test use on average, compared with the fixed-size test and with the plain capped Wald test?

## Headline result (exact; see Limitations)

- **Holding the guarantee under a cap is cheap compared with the fixed test.** For p0 = 5%, p1 = 1% (fixed test: 181 rollouts), the re-tuned test's mean rollouts (average of its values at p1 and at p0) is 107 at a cap equal to the fixed size (m = 1), 99 at m = 1.2 to 1.3, 94 at m = 1.5 and 90 at m = 2; its worst-case budget is the cap. Every re-tuned row in `experiments/results.txt` has both achieved errors at or below 0.05 (largest 0.0499).
- **Small caps cost the most mean; the plain capped test looks cheaper there only because it breaks the guarantee.** At m = 1 the plain Wald test with the sign rule averages 90 rollouts but its unacceptable-rate error is 0.068; keeping it at 0.05 raises the mean by about 18 rollouts (20%). The gap closes as the cap grows: it is 12 at m = 1.1 and 0 at m = 1.5 (where the best cut just rejects every undecided run).
- **At large caps the re-tuned test is cheaper than the plain one.** At m = 1.75 to 2 the re-tuned mean is 90.3 to 90.6, against 95.0 to 95.3 for the plain capped test, which still has an error of 0.052 at m = 2, so re-tuning gives a lower mean *and* a held error.
- The other two pairs (10% vs 5%, fixed 298; 20% vs 10%, fixed 135) show the same pattern: at m = 1 the re-tuned means are 168 and 217 (10/5) and 83 and 99 (20/10), against 131/153 and 61/70 for the plain test, and against 298 and 135 for the fixed test. In the 10/5 and 20/10 pairs the tuned mean at the *acceptable* rate is much higher than at the unacceptable one, because the search minimises only their average.

Figure: `experiments/mean_vs_cap.svg` (1% vs 5%). Tables: `experiments/results.txt`.

![Mean rollouts against the cap](experiments/mean_vs_cap.svg)

## Method

`sprtcut.py` computes, by an exact dynamic programme over (trials, failures), the probability of accepting and the expected number of trials for a test that stops when the log likelihood ratio reaches `s_hi` times Wald's accept boundary or `s_lo` times Wald's reject boundary, and otherwise at `cap` trials accepts if failures <= kc. At a fixed n the log likelihood ratio falls monotonically with failures, so "failures <= kc" covers every possible final threshold. For each of the 21 x 21 pairs (s_lo, s_hi) in 0.5 to 2.5 (steps of 0.1) the best kc is the one with both achieved errors within 0.05 and the smallest acceptable-rate error; the winner is the pair with the lowest mean rollouts averaged over p0 and p1. Nothing is sampled, so "achieved at or below 0.05" is exact, not a Monte Carlo estimate. The fixed test is in the family (no early stopping), which the tests check: it reproduces the exact binomial acceptance probabilities.

## Reproduce

```bash
cd research/free-sprtcut
python3 -m unittest discover -s tests -v   # 5 tests, under a second
python3 experiments/run.py > experiments/results.txt   # about 40 seconds
python3 experiments/figure.py
```

## Limitations

- **Rollouts are assumed iid Bernoulli with the same probability as the real system.** As in `free-sprtcert`, this certifies the twin, not the robot; the sim-to-real gap is not modelled.
- **Coarse search.** The boundary grid has 0.1 steps with the two sides scaled independently; a finer or smarter search (or a backward-induction optimal truncated design) would lower the means, so the tuned figures are upper bounds on what re-tuning can achieve, not the optimum.
- **The objective is the average of the means at p1 and p0 only.** The mean at intermediate rates (where the SPRT is slowest) is not optimised or tabulated here; `free-sprtcap` shows the tail there is the long one.
- Three (p0, p1) pairs at alpha = beta = 0.05; no other error levels.
- Achieved errors are at or below 0.05 by construction, so some sit well under (for example 0.041); that slack comes from the discrete failure count.
- No measurement of any real simulator's rollout time or cost.

## Prior work

Wald, A. (1945), "Sequential tests of statistical hypotheses", *Annals of Mathematical Statistics* 16(2); Wald (1947), *Sequential Analysis*, Wiley (truncated sequential tests). Both citations written from memory, not re-checked against the source. Builds directly on `research/free-sprtcap` and `research/free-sprtcert`.

## Next steps

Replace the grid by backward induction for the exactly optimal truncated test and report the gap to this grid; tabulate the mean at the midpoint rate as well; add a twin-to-real bias term to show how the decision shifts.

## Owner steps
None.

## Outside dependencies
Python standard library only.
