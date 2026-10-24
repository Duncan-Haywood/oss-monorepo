# Do flexible models predict divorce better than additive GLMs?

**Short answer so far (5 of 11 lenses finished, 2026-10-20): no.** On every lens that completed,
properly tuned gradient boosting (LightGBM, scikit-learn HistGradientBoosting), random forests,
extra trees, an Explainable Boosting Machine (EBM), an elastic-net GLM with splines and pairwise
interactions, and a GLM + boosting stack were scored on the lens's own person/couple-grouped
held-out folds. None beat the lens's current best additive GLM by a margin whose 95% CI excludes
zero while also calibrating well. The learning curves are nearly flat over the last quarter of the
data, and adding more features helps an additive GLM at least as much as it helps boosting.
**Nothing was exported to the app.**

This folder belongs to the [divorce-prediction project](../README.md) (**Live page:**
https://duncan-haywood.github.io/oss-monorepo/research/marriage-divorce-evidence/).

## What was tested

For each lens (`scripts/lenses/<lens>.py`), the loader rebuilds the lens's rows, weights,
outcome and **outer folds** from that lens's own scripts in `../reproducibility/<lens>/`. It uses the
widest feature set the data hold: the lens's inputs plus every block added on the
`claude/marriage-more-predictors` branch (`extended_predictors.py`, read from that branch). The
baseline is the lens's current best GLM, refit by its own pipeline. Then `scripts/flex.py` fits:

| Model | Tuning (nested: inner grouped 80/20 hold-out inside each training fold; the test fold is never seen) |
|---|---|
| LightGBM (Poisson with log-exposure offset, or binary) | random search over learning rate, leaves, depth, min leaf, L2, feature fraction; early stopping |
| scikit-learn HistGradientBoosting | learning rate, leaves, min leaf, L2; iterations read off the inner hold-out |
| Random forest, extra trees | min leaf x max_features |
| Elastic-net GLM (glum): splines + one-hot + all pairwise products of the 6 top-ranked inputs (+ duration x those) | alpha path on the inner hold-out |
| EBM (`interpret`): a GAM with automatically chosen pairwise terms | its own internal validation |
| Stack: GLM and LightGBM blended on the link scale | blend weight on the inner hold-out |
| The lens's own boosting, the baseline GLM on all inputs, and dyadic GLM variants | as in the lens |

Metrics: held-out gain over a training-fold constant (Poisson deviance or log loss), with a
**paired cluster bootstrap 95% CI of the difference from the baseline** (1,000 draws, clusters
= respondents, couples or households); AUC or Harrell's C with a bootstrap CI of the difference;
calibration (observed/expected and calibration slope, where a slope below 1 means overfit);
top-decile lift. Overfitting diagnostics: training-fold gain against held-out gain, and a
**permuted-label null** (outcomes shuffled within folds; a model should not beat a constant on
the real held-out outcomes). Then a **learning curve** (10-100% of each training fold's people)
and a **feature-count curve** (top-k inputs by the training fold's LightGBM gain ranking).

## Results (lenses finished)

`results/summary.md` has the tables; `results/<lens>.json` has every number (aggregates only).

| Lens | Rows / events | Baseline gain % | Best flexible model | Its gain % | Difference (95% CI) | Calibration slope | O/E | AUC / C: baseline -> best (diff, 95% CI) | Wins? |
|---|---|---|---|---|---|---|---|---|---|
| GSS panels (5 x 5-fold) | 4,453 / 203 | 8.56 | random forest | 8.99 | +0.42 [-1.55, 2.25] | 0.96 | 0.95 | 0.726 -> 0.730 (+0.004, [-0.019, 0.034]) | no |
| HCMST (3 x 5-fold) | 8,046 / 527 | 27.00 | stack GLM+LightGBM | 27.65 | +0.65 [-0.11, 1.43] | 1.00 | 0.99 | C 0.878 -> 0.879 (+0.001, [-0.002, 0.006]) | no |
| LA newlyweds* | 2,671 / 145 | 9.62 | elastic-net GLM + pairs | 11.77 | +2.15 [-1.91, 5.45] | 0.96 | 0.95 | C 0.635 -> 0.702 (+0.067, [0.029, 0.099]) | no (gain CI spans 0) |
| SIPP couples* | 33,698 / 312 | 5.77 | EBM | 6.78 | +1.01 [-0.52, 2.95] | 0.96 | 1.01 | 0.695 -> 0.710 (+0.015, [0.012, 0.044]) | no |
| NLSY79 couples* | 40,818 / 726 | 3.40 | stack GLM+LightGBM | 3.53 | +0.13 [-0.10, 0.38] | 0.88 | 1.01 | 0.666 -> 0.665 (-0.001, [-0.004, 0.005]) | no |

\* One outer repeat with reduced tuning (2 LightGBM configurations, 30 forest trees, one EBM bag,
50 bootstrap draws): a full-data, reduced-search run. Treat these rows as preliminary. The
baseline reproduces each lens's published gain (NLSY79 couples 3.40% against 3.4%; SIPP couples
5.77% against 5.77%; GSS 8.56% against 8.6%; HCMST 27.0% against 25.5% over period-only, a different
reference).

Other rows worth knowing (full tables in the JSON):

- **HCMST:** the lens's own fixed boosting (depth 3, 150 trees) scores +1.01 points over the
  additive GLM (95% CI +0.03 to +1.99), calibration slope 1.03 and O/E 0.98. That is the one CI that
  excludes zero. The tuned flexible models do not reproduce it (+0.1 to +0.7), and C moves by
  0.004. It is a marginal, single-lens result, not evidence that flexibility helps.
- **More features, same model:** the baseline GLM given every candidate input is worse held out in
  4 of 5 lenses (GSS -1.19, HCMST -2.93 [-4.29, -1.71], newlyweds -1.24 [-2.10, -0.31],
  SIPP couples -1.11, NLSY79 couples -0.34). Most of the new inputs add noise, not signal.
- **Overfitting:** the trees fit the training folds far better than the test folds. On GSS,
  LightGBM scores 44.5% on training against 7.4% held out, HGB 58.6% against 4.7%, and the forest
  34% against 9%. The additive GLMs score 17% against 8.6%. Calibration slopes of the boosted and
  forest models fall to 0.55-0.81 on the small lenses (newlyweds, SIPP couples), where the GLMs
  stay at 0.88-0.96. In the permuted-label null, every model scores at or below zero (-2.9 to +0.3
  points), so the pipeline does not manufacture skill.
- **Dyadic (actor-partner) specifications:** none beats the lens's own coding. HCMST couple
  summaries (mean age, gap, pair categories) beat separate partner terms by 1.0 points [0.29,
  1.76] and the actor-partner model with gaps and match terms by 1.4 points. In the LA newlyweds,
  APIM is +0.17 [-0.48, 0.75] and couple means and gaps only +0.56 [-0.14, 1.39]. In NLSY79 couples
  the three codings are within 0.1 points of each other and of the baseline.
- **What the flexible models find:** the EBM's strongest pairwise terms are duration x
  cohabitation in HCMST (years together, or since meeting, interacting with living together) and
  the wave period x adverse-childhood and neighbourhood-income terms in the newlyweds. Each is
  small next to the main effects. LightGBM permutation importance ranks the same inputs the GLMs
  weight most: marriage happiness and age in GSS, relationship quality and cohabitation in HCMST.

### Learning curves: would more data help?

Held-out gain (%) with 10 / 25 / 50 / 75 / 100% of each training fold's people:

| Lens | Baseline GLM | Tuned LightGBM |
|---|---|---|
| GSS panels | -0.7 / 0.7 / 6.8 / 8.5 / 8.4 | -9.9 / 0.1 / 7.1 / 8.3 / 8.8 |
| HCMST | 19.6 / 22.3 / 25.0 / 26.7 / 26.7 | 16.7 / 22.7 / 25.0 / 27.0 / 26.9 |
| LA newlyweds | -2.2 / 3.1 / 7.2 / 9.0 / 9.6 | 4.5 / 0.2 / 6.0 / 8.9 / 9.0 |
| SIPP couples | -0.4 / 0.9 / 3.6 / 3.8 / 5.8 | -8.2 / -0.6 / 2.8 / 3.1 / 4.7 |
| NLSY79 couples | -7.0 / 1.3 / 2.6 / 3.1 / 3.4 | 0.7 / 1.0 / 1.5 / 2.3 / 2.8 |

Both kinds of model gain steeply up to about half the data and little after 75% (HCMST and GSS
are flat). Boosting does not pull away as data grow: at 100% it is within about 1 point of the GLM
everywhere. The two lenses still rising at 100% (SIPP couples, with 312 events; the newlyweds, with
145) are event-starved, and there the GLM rises at least as fast. More data looks likely to help
modestly on the small lenses, and to help an additive model as much as a flexible one.

### Feature-count curves: would more features help?

Held-out gain (%) with the top-k inputs (LightGBM / additive ridge GLM):

| Lens | k: LightGBM / GLM |
|---|---|
| GSS panels | 1: 1.9/3.2; 2: 6.4/7.8; 5: 7.1/8.0; 8: 7.6/9.5; 12: 8.6/9.3; 24: 6.5/9.2; all 45: 8.8/9.5 |
| HCMST | 1: 16.2/16.0; 2: 19.3/19.2; 4: 26.8/26.3; 8: 26.9/26.6; 16: 26.9/26.8; all 49: 26.9/25.6 |
| LA newlyweds | 1: 7.1/6.9; 2: 9.9/9.5; 4: 9.5/9.7; 16: 10.0/12.2; all 52: 9.0/10.9 |
| SIPP couples | 1: 1.3/2.0; 4: 1.9/3.6; 8: 3.2/3.8; 16: 4.9/4.2; all 29: 4.7/4.9 |
| NLSY79 couples | 1: 2.2/2.9; 4: 2.1/2.8; 8: 2.5/3.2; 16: 2.7/3.6; all 18: 2.8/3.6 |

Most of the reachable skill comes from the first 2-8 inputs (in HCMST, 4 inputs reach 99% of
the full model). Beyond about 8-16 inputs the curves are flat or fall, and they fall for both kinds
of model. The GLM is at or above LightGBM at almost every k.

## Verdict

- **Do flexible models help?** Not measurably, on the five lenses finished. Gains over the
  additive GLM run from -0.3 to +2.2 points of deviance, and every 95% CI includes zero. The
  flexible models overfit more (larger train/test gaps, calibration slopes further below 1) and
  find only small interactions. The one CI above zero belongs to a lens's own untuned boosting on
  HCMST (+1.0 points), which tuned boosting does not reproduce.
- **Would more data help?** Somewhat, for the smallest lenses (SIPP couples, the LA newlyweds),
  and about equally for GLMs and boosting. The larger lenses have flattened.
- **Would more features help?** Not as more columns. A few strong inputs (relationship quality,
  marriage happiness, age, duration, prior divorce) carry the skill. Adding every candidate input
  makes the baseline GLM worse held out in 4 of 5 lenses.

These are associations in survey data, evaluated held out; nothing here is causal.

## Action items for a later run (not run in this session)

The run stopped early at the owner's request. Not done:

1. **The large person-period lenses:** NSFG 1995-2023 pooled, NLSY79 first marriages, NLSY97,
   Statistics Canada GSS, SIPP retrospective (on a household subsample) and ACS (training-row
   subsample). Their loaders are written and the NSFG one was smoke-tested end to end. This is
   where the repo's earlier boosting edges were seen (NSFG pooled, NLSY79, NLSY97, Canada, SIPP,
   ACS), so it is the most important gap. Queue: `scripts/run_lens.py <lens>` with the settings in
   the "Reproduce" section.
2. **Full-strength reruns** of the starred lenses (LA newlyweds, SIPP couples, NLSY79 couples:
   more tuning, more repeats) and of HCMST's permuted-label, learning-curve and feature-curve stages.
   HCMST's main stage is the full run; those three stages are from the one-repeat reduced run.
3. **Out-of-time splits** (NSFG pre/post-2000, Canada pre/post-1990, SIPP pre/post-1990;
   `stage oot`). They are implemented but belong to the unrun lenses.
4. **Survival-native models** (`scripts/export_survival.py` then `scripts/survival_native.py`
   under scikit-survival): Cox elastic net, random survival forest and gradient-boosted Cox, on
   C-index and integrated Brier score. Written, not run.
5. **Mixture cure model** (NSFG pooled) and **competing risks** (divorce vs widowhood,
   cause-specific hazards, Canada GSS) in `scripts/cure_competing.py`. Written, not run (they need
   the main stage of those lenses first).
6. **TabPFN v2** (`scripts/tabpfn_eval.py`): it installs (tabpfn 2.0.9; later releases need a
   licence key and account, so they were not used), but on this shared 16 GB CPU box it was
   killed for memory even on GSS's 3,500 training rows. It needs more memory, fewer features or
   a GPU.
7. **Monotone constraints** (e.g. on marriage duration) were supported in the code but not
   searched.
8. **Export:** no model qualified, so nothing was exported. If a later run finds a winner, LightGBM
   on one-hot inputs can be converted to the engine's `boosted` kind (log-rate trees). A stack or an
   EBM would need a new kind in `app/engine.js` with parity tests.

## Reproduce

Raw data come from each lens's `download.sh`. Every person-level file stays outside git: the
loaders read `$FLEX_DATA` (scratch) and caches go to `$FLEX_CACHE`. Environment: Python 3.13,
scikit-learn 1.7.2, numpy 2.3.4, pandas 2.3.3, lightgbm 4.7, interpret-core 0.7.8, glum 3.4, numba;
scikit-survival lives in a separate environment (it needs scikit-learn 1.9).

```sh
cd flexible_models/scripts
python run_lens.py gss_panel --lgb-configs 10 --hgb-configs 4 --lc-configs 4 --trees 150 --ebm-bags 8 \
  --models baseline,lightgbm_tuned,hgb_tuned,random_forest_tuned,extra_trees_tuned,enet_spline_pairwise,ebm,stack_glm_lgbm,lens_models
python summarise.py            # results/summary.md and summary.json
```
