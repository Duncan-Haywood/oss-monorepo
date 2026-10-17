# ambient-exploreonly: does fitting only on the windows an assistant explored at random fix learning from its own accept/dismiss feedback?

Track 2 (ambient AI assistant), follow-up to `ambient-labelmatch` and the chain of estimator fixes after it (`ambient-dr`, `ambient-drclip`, `ambient-crossfit`, `ambient-capcv`, `ambient-drvalid`, `ambient-drablate`, `ambient-drrepeat`). Every one of those tried to repair a biased fit by reweighting or by adding an outcome model. This project asks a simpler question: what if the learner just ignores every window where it spoke for a reason other than the &epsilon; coin? Produced with AI assistance. **Stylised, simulated results only**: every distribution is chosen by me and nothing is a claim about a real user, device or product. **Positive result in the uninformed-prior regime, mixed with an informed prior.**

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/ambient-exploreonly/

## Motivation

`ambient-labelmatch` showed that a random sample of the same size nearly reaches the oracle, so the damage is selection, not label volume. The reweighting and doubly robust follow-ups were still far below that control with the uninformed prior. But the assistant already draws a random sample for free: every window where it spoke *only because the &epsilon; coin came up* (the model said no and no wake phrase was heard) was chosen independently of that window's need. Those windows need no weights. They are few (about &epsilon; of the silent windows), so the open question is whether a small, clean sample beats a large, contaminated one, and what exploration costs while it is gathered.

## Builds on (and does not claim affiliation with)

- `research/ambient-labelmatch`, `research/ambient-fullinfo`, `research/ambient-ips` and `research/ambient-bandit` in this repository: the simulated windows, decision rule, &epsilon;-greedy deployed learner and MAP logistic fit, copied into `src/ambient_exploreonly/core.py` so the project is self-contained. The `biased`, `random_matched` and `full` rows reproduce `ambient-labelmatch` exactly (same seeds, checked in `experiments/results.txt` for &epsilon; = 0.002, 0.005, 0.02).
- Horvitz (1999), "Principles of mixed-initiative user interfaces", CHI '99, 159&ndash;166, <https://doi.org/10.1145/302979.303030>, for the expected-utility speaking rule (idea only; not a reproduction).

No research group from `prompt.md` is built on; there is no lab tag.

## Method

Same world as `ambient-labelmatch`: 360 windows per hour, 3% need, a score feature (d&prime; = 2), a keyword feature, a noisy-OR wake phrase, a benefit of 3 for a hit and a cost of 1 or 2 for a false interruption. The assistant speaks if its model says so or a wake phrase is heard; otherwise with probability &epsilon;. It refits every 10 minutes. A window is **explored** when it was spoken on only because of the coin.

**A. Offline, on the deployed history.** The deployed learner refits on every window where it spoke (as in `ambient-bandit`). At hour 100, five models are fitted on that same history with the same prior: **biased** (all spoken windows); **explore_only** (explored windows, unweighted); **explore_matched** (a uniformly random subset of *all* windows of the same size as the explored set; not deployable, it separates label volume from which windows were chosen); **random_matched** (random subset as large as the biased set); **full** (every window). Scored by utility per hour on 20 fresh 100 h held-out streams with no exploration.

**B. Online.** The learner itself refits on `biased` (all spoken windows) or `explore_only`. Reported: online utility per hour and dismissals per hour over hours 20&ndash;100, and the final weights scored on the held-out streams.

Two priors (uninformed: score weight 0; informed: score weight 1), &epsilon; &isin; {0.002, 0.005, 0.02, 0.05}, 20 seeds. Oracle 12.71.

## Reproduce

```bash
cd research/ambient-exploreonly
PYTHONPATH=src python3 -m pytest -q tests       # 5 tests
PYTHONPATH=src python3 experiments/run.py       # about 10 minutes, writes experiments/results.txt
python3 experiments/figure.py                   # writes experiments/explore_only.svg from results.txt
```

## Results (from `experiments/results.txt`; held-out utility per hour, mean over 20 seeds, std in the file)

**A. Uninformed prior, fits at hour 100** (labels: biased 814 / 932 / 2691 / 6430; explore_only 70 / 177 / 680 / 1555):

| &epsilon; | biased | explore_only | explore_matched | random_matched | full |
|---|---|---|---|---|---|
| 0.002 | 1.59 | 7.53 | 7.72 | 12.15 | 12.72 |
| 0.005 | &minus;0.15 | 9.61 | 3.18 (std 31.6) | 12.18 | 12.72 |
| 0.020 | &minus;13.08 | 11.99 | 12.08 | 12.52 | 12.72 |
| 0.050 | &minus;71.85 | 12.25 | 4.24 (std 36.0) | 12.63 | 12.72 |

**A. Informed prior:**

| &epsilon; | biased | explore_only | explore_matched | random_matched |
|---|---|---|---|---|
| 0.002 | 10.62 | 6.03 | 7.77 | 12.48 |
| 0.005 | 10.84 | 5.60 | 9.49 | 12.49 |
| 0.020 | 11.42 | 8.88 | 11.96 | 12.48 |
| 0.050 | 11.95 | 11.00 | 12.44 | 12.53 |

**B. Online** (uninformed prior; online utility/h over hours 20&ndash;100 | dismissals/h | held-out utility of the final model):

| &epsilon; | biased learner | explore_only learner |
|---|---|---|
| 0.002 | &minus;1.74 \| 5.5 \| 1.59 | 6.23 \| 3.1 \| 7.36 |
| 0.005 | &minus;2.04 \| 5.9 \| &minus;0.15 | 6.49 \| 3.7 \| 9.47 |
| 0.020 | &minus;23.27 \| 24.0 \| &minus;13.08 | 2.30 \| 10.4 \| 11.72 |
| 0.050 | &minus;70.10 \| 63.7 \| &minus;71.85 | &minus;9.98 \| 20.7 \| 12.18 |

With the informed prior the biased learner is better online at &epsilon; &le; 0.005 (9.65 and 8.50 against 5.52 and 7.20); the two are level at &epsilon; = 0.02 (2.67 and 2.38) and at 0.05 (&minus;9.80 and &minus;9.94).

1. **With the uninformed prior, the explore-only fit succeeds where every reweighting or doubly robust fit in the chain failed.** At &epsilon; = 0.02 it scores 11.99 &plusmn; 0.93 against &minus;13.08 for the biased fit, and 12.25 at &epsilon; = 0.05, within 0.4 of the label-matched random control and with a weight distance to the oracle of 1.3 and 0.9. It uses 680 and 1555 labels, a quarter of the biased fit's.
2. **A small clean sample is enough; a big contaminated one is not.** At &epsilon; = 0.002 (70 labels) it already scores 7.53 &plusmn; 2.87, above biased (1.59), though far below random_matched (12.15, 814 labels). The fit is unweighted, so it avoids the 1/&epsilon; weights that made IPS and DR unstable.
3. **Online, it turns a negative-utility assistant into a positive one at low &epsilon;.** With the uninformed prior at &epsilon; = 0.005 the explore-only learner earns 6.49 per hour online against &minus;2.04, with fewer dismissals (3.7 against 5.9 per hour), and its final model scores 9.47 against &minus;0.15.
4. **Exploration is not free, and the best online &epsilon; is small.** The final model keeps improving with &epsilon; (11.72 at 0.02, 12.18 at 0.05), but the online utility falls as the dismissals pile up (2.30 at 0.02, &minus;9.98 at 0.05). The learning-versus-earning trade-off points to exploring hard early and then cutting &epsilon;; I did not test a schedule.
5. **With an informed prior, the biased fit is already good and explore-only is worse at small &epsilon;.** It has 68&ndash;173 labels, and the informed prior leaves little to learn that a mildly biased fit does not already get (biased 10.6&ndash;11.4). The explore-only fit only catches up at &epsilon; = 0.05 (11.00 against 11.95).
6. **Negative / unexplained.** The explore_matched control is erratic at two uninformed cells (3.18 &plusmn; 31.6 and 4.24 &plusmn; 36.0): a random subset of 177 windows holds about five needs, and a few seeds fit badly. The explore-only sample was steadier (std 1.9 and 0.7). I did not isolate why a non-uniform sample is steadier; one reading is that the windows the model skips are less extreme in the score feature, which I have not checked.

## Limitations

- Same stylised world as the rest of the chain: independent windows, instant noise-free accept/dismiss, a model with the true functional form, costs and benefit chosen by me. In such a well-specified model, choosing windows by features does not bias a logistic fit; real classifiers are misspecified and that argument weakens.
- The explored windows exclude wake-phrase windows, which correlate with need given the features (the wake flag is not a model feature). That is a selection on the outcome, so the explore-only intercept can be biased; the fitted intercepts (&minus;4.0 to &minus;5.5 against &minus;6.0 for the oracle) are also shrunk toward the prior. I did not separate the two.
- Online utility ignores the possibility that a user turns the assistant off after a burst of false interruptions; at &epsilon; = 0.05 the dismissal rates (21 to 64 per hour) would plausibly do so.
- One prevalence (3%), one hour (100), one decay-free &epsilon;, 20 seeds, large seed spread at small label counts. No formal tests and no multiple-comparison correction across the cells.

## Next steps

- An exploration schedule (large &epsilon; early, decayed once the model stabilises) and the break-even &epsilon; against the always-on cost of dismissals.
- Combine the explore-only sample with a down-weighted use of the biased windows (a small-labelled-set plus a larger noisy set) and with the clipped fits of `ambient-labelmatch`.
- Test misspecification (a non-logistic need-to-feature relationship) to see whether selection on features stays harmless.
- Real accept/dismiss logs, if the owner opts in to collecting them.

## Outside dependencies

numpy (and pytest for the tests). No model, dataset, service or hardware is used.
