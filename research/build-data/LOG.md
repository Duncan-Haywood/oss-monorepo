# build-data log

## Session 79, 2026-11-12: does cascade2's build-time q0.9 transfer cost (session 74) survive complete labels, and does session 78's demolition result hold with SF and Austin held out? (in progress)

Why: session 78 found that complete-case scoring of a right-truncated test year flips the sign of the demolition fold at i2c q0.9, and asked for the same check on session 74's cascade2-versus-type comparison (cascade2 cost +2.19 days of Seattle i2c 2024 transfer q0.9 on complete-case labels) and for other held-out cities.
- Change: `censored_eval.py` names a result file after its class list when it is not session 78's default pair (`out_name`, 1 test), so `--classes cascade2 type cascade2_nodemo` does not overwrite session 78's files.
Predictions (written before any run): `python3 src/censored_eval.py validate DIR --pull-date 2026-11-12 --held H --test-year Y --pseudo-pull Y+2-11-12 --classes cascade2 type cascade2_nodemo`, Seattle for Y = 2020, 2021, 2022; SF and Austin for Y = 2021. "Reference" = all test rows; "CC" = the rows the pseudo-pull would have seen. Paired transfer contrasts, days of mean pinball loss, negative = the first term better.
- (V1) Seattle, every year: reference transfer q0.9 type minus cascade2 has a point estimate >= 0 (on complete labels cascade2 does not cost at the build-time tail). Refuted if negative in any year.
- (V2) Seattle: the CC estimate of that contrast is below the reference in at least 2 of the 3 years (censoring biases the comparison against cascade2, as it did against naming demolition). Refuted otherwise.
- (V3) Seattle, every year: reference transfer type minus cascade2 is > 0 at q0.1 and at q0.5 (cascade2's lower-quantile gain, sessions 74 and 76, is not a censoring artefact). Refuted if either fails in any year.
- (V4) Seattle: the nodemo-minus-cascade2 reference q0.9 contrasts reproduce session 78 (+1.66, +2.49, +2.37) to within 0.1 day if the SF, Austin and Seattle row counts are unchanged.
- (V5) SF held out and Austin held out, 2021: reference transfer q0.9 nodemo minus cascade2 >= 0 (naming demolition does not cost on complete labels in other cities either). Refuted if negative in either city.
Each is refuted if its condition fails.

## Session 78, 2026-11-12: on complete labels, folding demolition costs 1.7 to 2.5 days at build-time q0.9 in every year; complete-case scoring flips that sign, and IPCW cannot reach the tail (U1, U3 refuted; U2, U4, U5 held)

Why: session 77 found that every i2c test-year score is a complete-case (CC) mean over the permits finished before the pull, so recent test years lose their long builds. Its "Next" asked for a censoring-aware evaluation and a rerun of the cascade2/type/nodemo comparison under it.
- New: `src/censored_eval.py`. A test row issued on day s has a window C = pull date minus s and is seen iff y <= C. If build time does not depend on the issue day within the year, P(seen | y) = G(y) = P(C >= y); each seen row is weighted 1/G(y) (inverse probability of censoring weighting, IPCW; Robins & Rotnitzky 1992, Graf et al. 1999 for the Brier score). G comes from the issue days of rows short enough to be seen on any issue day (y <= min C). Weights are floored at G = 0.05; rows longer than the largest window cannot be seen at all. `validate` scores a nearly complete year (2021 against the 2026-11-12 pull, windows >= 1,777 days) on all rows (reference), and CC and IPCW on the rows a pseudo-pull on 2023-11-12 would have seen (windows 681 to 1,045 days, the real 2024 test year's 681 to 1,046), with the same fitted models. `rescore` scores the real test years both ways. `transfer.run` now keeps the issue dates in its per-row output. 6 tests, including an analytic case (y uniform on 0 to 100, windows uniform on 50 to 150: CC mean below 47, IPCW 50).
Predictions (written before any run): `python3.13 src/censored_eval.py validate DIR --pull-date 2026-11-12 --held seattle --test-year 2021 --pseudo-pull 2023-11-12 --classes cascade2 cascade2_nodemo` and `... rescore DIR --pull-date 2026-11-12 --held seattle --test-year 2024 --classes cascade2 cascade2_nodemo`.
- (U1) Validation: the IPCW q0.9 of the seen rows is within 10% of the all-rows q0.9, and the CC q0.9 is more than 15% below it.
- (U2) Validation, q0.9: of the three contrasts cascade2 transfer minus own baseline, cascade2 own-boosted minus own baseline, and transfer nodemo minus cascade2, IPCW's absolute error against the reference is smaller than CC's in at least two.
- (U3) Real 2024: transfer q0.9, nodemo minus cascade2, scored by IPCW, has a 95% interval that includes zero (CC, session 76: -1.98 [-2.70, -1.24]).
- (U4) Real 2024: cascade2 transfer minus own baseline at q0.5 keeps a negative point estimate under IPCW (the programme's finding that SF and Austin transfer beats Seattle's own baseline at the i2c median).
Each is refuted if its condition fails.
- Added after the 2021 validation and before running it (U5): in test years 2020 (pseudo-pull 2022-11-12) and 2022 (pseudo-pull 2024-11-12) too, the reference (all rows) transfer q0.9 nodemo minus cascade2 has a point estimate >= 0, and the CC estimate on the pseudo-pull rows is below the reference. Refuted if either fails in either year.

Outcome. Fresh pull 2026-11-12 15:09 to 15:45 UTC (`results/manifest.json`): SF and Seattle row counts equal session 77's, Austin has 101 more (2,385,068); Chicago is not used for i2c. Runs one after another, `python3.13`, about 4 minutes per validation year and 4 for the rescore. Outputs: `results/censored_eval_validate_seattle_i2c_{2020,2021,2022}_pp{2022,2023,2024}.json`, `results/censored_eval_rescore_seattle_i2c_2024.json`.
- The labels. Seattle i2c test cohorts, q0.9 of build time in days: all rows / complete-case (CC) on the pseudo-pull rows / IPCW on the same rows. 2020: 902 / 558 / 608. 2021: 945 / 574 / 626. 2022: 810 / 597 / 682. The pseudo-pull hides 11 to 12% of rows (9% in 2022).
- Why IPCW does not recover the tail: the weights are right where they can be. By build-time bin, the share of rows seen matches mean G(y) to within 0.1 (2021: 681 to 800 days 0.90 seen vs G 0.88; 800 to 900, 0.55 vs 0.56; 900 to 1,046, 0.16 vs 0.21). But 7.5%, 8.3% and 5.3% of the cohorts take longer than the longest window (about 1,045 days), and no weight can bring back a row nobody can see. The cohort's q0.9 sits inside that region, so a 2024 test year scored from a 2026 pull cannot measure q0.9 by any reweighting.
- Contrasts, days of mean pinball loss [95% week-block interval]; negative = first term better:

| year | contrast | quantile | reference (all rows) | CC | IPCW |
|---|---|---|---|---|---|
| 2020 | transfer nodemo minus cascade2 | q0.9 | **+1.66 [0.20, 3.23]** | -0.89 [-1.85, 0.23] | -0.60 [-1.63, 0.56] |
| 2021 | transfer nodemo minus cascade2 | q0.9 | **+2.49 [1.38, 3.62]** | -0.75 [-1.46, 0.03] | -0.18 [-1.11, 0.86] |
| 2022 | transfer nodemo minus cascade2 | q0.9 | **+2.37 [1.56, 3.28]** | +0.94 [0.19, 1.80] | +1.37 [0.45, 2.50] |
| 2020 | cascade2 transfer minus own baseline | q0.9 | -0.08 [-3.30, 2.99] | -0.98 [-2.58, 0.72] | -0.77 [-3.13, 1.70] |
| 2021 | cascade2 transfer minus own baseline | q0.9 | +2.75 [-1.41, 7.91] | -0.29 [-1.47, 0.98] | -0.56 [-2.35, 1.12] |
| 2022 | cascade2 transfer minus own baseline | q0.9 | +3.35 [0.77, 5.95] | +2.72 [0.94, 4.56] | +5.59 [2.44, 9.53] |
| 2020 | cascade2 own-boosted minus own baseline | q0.9 | -13.03 [-16.08, -10.15] | -3.50 [-4.46, -2.54] | -4.63 [-6.48, -3.04] |
| 2021 | cascade2 own-boosted minus own baseline | q0.9 | -10.00 [-13.31, -6.10] | -4.07 [-5.32, -2.82] | -6.19 [-9.19, -3.86] |
| 2022 | cascade2 own-boosted minus own baseline | q0.9 | -6.58 [-8.90, -4.26] | -0.67 [-1.72, 0.27] | -2.08 [-4.21, -0.18] |
| 2020 / 2021 / 2022 | cascade2 transfer minus own baseline | q0.5 | -8.32 / -5.26 / -5.61 | -6.57 / -3.05 / -3.56 | -7.36 / -4.01 / -3.92 |
| 2024 (real pull) | transfer nodemo minus cascade2 | q0.9 | not observable | -1.98 [-2.70, -1.24] | -1.52 [-2.44, -0.51] |
| 2024 (real pull) | cascade2 transfer minus own baseline | q0.9 | not observable | +1.04 [-0.50, 2.55] | +2.48 [0.26, 5.10] |
| 2024 (real pull) | cascade2 transfer minus own baseline | q0.5 | not observable | -10.13 [-11.96, -8.29] | -10.34 [-12.17, -8.50] |

- (U1) Refuted: the IPCW q0.9 is 33%, 34% and 16% below the all-rows q0.9 (CC: 38%, 39%, 26% below).
- (U2) Held in 2021 (IPCW nearer the reference in 2 of 3 q0.9 contrasts) and in 2020 (3 of 3) and 2022 (2 of 3): 7 of 9 overall. The gains are small; IPCW closes 10 to 40% of the CC error and never reaches the reference.
- (U3) Refuted: under IPCW the 2024 fold gain shrinks from -1.98 to -1.52 days and stays below zero. Given the validation, that number is not evidence for the fold: in every year where all labels are seen, the fold costs 1.7 to 2.5 days at q0.9.
- (U4) Held: the transfer model's median gain over Seattle's own baseline survives IPCW in 2024 (-10.34), and in 2020 to 2022 the reference gain is larger than the CC one. The q0.5 headline was understated, not created, by censoring.
- (U5) Held: the reference nodemo-minus-cascade2 q0.9 difference is positive with an interval above zero in 2020, 2021 and 2022, and CC is below it in each year (it flips the sign in 2020 and 2021).
- What this does to sessions 75 to 77. Session 76's finding that folding demolition helps build-time q0.9 transfer is withdrawn: it held only on a right-truncated test year. On complete labels, naming demolition helps at q0.9 in all three years checked, and costs about 1 day at q0.5 (fold minus cascade2 +0.38 to +1.18). The cascade2-versus-type comparison at i2c q0.9 (session 74) needs the same treatment. The own-city boosted model's q0.9 gain over the baseline is 2 to 10 times larger on complete labels than CC shows, so CC also understates how much local history is worth at the tail.
- Rule for this programme from here: build-time q0.9 is scored only on test years whose shortest window exceeds the cohort's long tail (about 4 years after the test year for Seattle); recent years are reported at q0.1 and q0.5 only, or flagged. IPCW is kept as a partial correction, never as a substitute.
- Limits: one held-out city (Seattle), one class pair, 3 seeds; the 2022 reference is itself truncated at 1,412 days (2020: 2,142; 2021: 1,777); the pseudo-pull truncates only the test labels, not the training years, which in a real pull are also shorter; IPCW weights are fixed in the bootstrap.
Next: rerun the cascade2-versus-type i2c q0.9 comparison (session 74) on test years 2020 to 2022 with the reference score; the same check with SF and Austin held out; a censored-quantile model (for example, training on the incomplete permits as censored rows) so that the tail can be learnt as well as scored.

## Session 77, 2026-11-12: a fold rule chosen from history helps Chicago and hurts Austin, and the demolition tail gap of sessions 75 and 76 is right-censoring of the test year (T1, T4 Austin refuted; T5, T6, T4 Chicago held)

Why: session 76 showed that folding demolition into alteration removes two thirds of cascade2's Seattle i2c 2024 transfer q0.9 cost, but the fold was picked after seeing session 75's per-class split of that very test year. A rule a practitioner can use must decide the fold before the test year exists. Session 76's suggested rule read the ratio interval on the test year; this one does not.
- New: `transfer.py --classes cascade2_tailfold`. `tailfold_map()` compares, per cascade2 class, the target's q0.9 among the sources' training rows (years <= Y-2) with the held-out city's own history (years <= Y-2, the rows its own baseline is fitted on). A class with at least 50 rows on each side whose source/held q0.9 ratio has a 95% bootstrap interval entirely above 1 folds into alteration (into "other" if alteration is itself flagged). The fold map and per-class diagnostics are written to the transfer json. 2 tests (flags only the longer source tail; changing every test-year row leaves the fold unchanged; small classes are never flagged).
Predictions (written before any run with the rule): `python3.13 src/transfer.py DIR --target T --seeds 3 --held H --test-year Y --classes cascade2 cascade2_tailfold` (paired: tailfold minus cascade2).
- (T1) Seattle i2c 2024: the rule flags demolition, from history alone.
- (T2) Seattle i2c 2024, transfer q0.9, tailfold minus cascade2: 95% interval below zero.
- (T3) Seattle i2c 2023: the same difference has a point estimate at or below zero (session 75 found demolition still contributed +0.62 days in 2023, inside an aggregate that spanned zero).
- (T4) Chicago held out and Austin held out, a2i 2024: wherever the rule flags a class, transfer q0.9 tailfold minus cascade2 has a 95% interval whose upper end is below +1% of the own baseline's q0.9 loss (the fold does not cost). Where it flags nothing, the configurations are identical and T4 is not testable for that city.
Each is refuted if its condition fails.
- First result, before anything below was computed: T1 refuted. For Seattle i2c 2024 the rule flags no class. Against Seattle's own history (issue years <= 2022) every class's source/held q0.9 ratio is below 1, demolition included: sources 665 days, Seattle history 952, ratio 0.70 [0.65, 0.74], where session 75 found 1.20 against the 2024 test year (552 days).
- Added prediction (T5), written after T1 and before computing it: the gap between Seattle's history (952) and its 2024 test year (552) is right-truncation, since an i2c test row exists only if the permit was completed before the pull. Censoring the history the same way (keep a history row only if its lag fits the window a permit issued on the same calendar day of 2024 had before the 2026-11-12 pull) gives a Seattle demolition q0.9 within 15% of the 2024 test year's, and the source/held ratio against that censored history has a 95% interval above 1. Refuted if either fails.
- T5 held (`src/truncation_check.py`, `results/truncation_check_seattle_i2c_{2024,2023}.json`). Censored history puts Seattle demolition q0.9 at 580 days against the test year's 552 (5% apart), and the ratio against it is 1.15 [1.11, 1.18]. 2023 also holds: 629 against 612, ratio 1.07 [1.03, 1.12].
- Deviation: the queued 2023 run of `cascade2_tailfold` was stopped. The rule reads the same history and would give an identical configuration (difference 0, so T3 holds trivially). It was replaced with the fold that a censored-history rule picks, which is session 76's `cascade2_nodemo` (demolition is the only class flagged).
- (T6, written before that run) Seattle i2c 2023, transfer q0.9, cascade2_nodemo minus cascade2: point estimate below zero and smaller in size than 2024's -1.98 days. Refuted otherwise.

Outcome. Fresh four-feed pull 2026-11-12 06:40 to 07:05 UTC: Chicago, SF and Austin row counts equal session 76's, Seattle has 22 more rows (194,241; `results/manifest.json`). Runs one after another (`python3.13 src/transfer.py DIR ... --classes cascade2 cascade2_tailfold`, Seattle i2c 2023 with `cascade2_nodemo`), about 15 minutes each. The committed Seattle cascade2 single-configuration files keep their earlier pulls; the Chicago- and Austin-held cascade2 files are new.
- Paired differences, transfer model, days of mean pinball loss [95% week-block interval] (share of own baseline loss); negative = the fold is better:

| held / target / year | fold | n test | q0.1 | q0.5 | q0.9 |
|---|---|---|---|---|---|
| Seattle i2c 2024 | tailfold: none flagged | 4,313 | 0 | 0 | 0 |
| Seattle i2c 2023 | nodemo (censored-history rule's choice) | 4,387 | -0.01 [-0.13, 0.16] | +0.05 [-0.26, 0.38] | **-1.29 [-2.09, -0.45] (-2.3%)** |
| Chicago a2i 2024 | tailfold: 6 classes into "other" | 33,064 | -0.10 [-0.12, -0.09] | -1.08 [-1.24, -0.91] (-8.6%) | **-1.46 [-1.58, -1.34] (-13.2%)** |
| Austin a2i 2024 | tailfold: 4 classes into "other" | 53,011 | 0.00 | +0.53 [0.37, 0.72] (+1.3%) | **+2.96 [1.67, 4.27] (+8.0%)** |

- T1 refuted (above). T2 not testable: with nothing flagged the two configurations are identical. T3 not run as registered (deviation above); T6 held: -1.29 days, two thirds of 2024's -1.98. Demolition rows carry -0.63 of it (49%), new construction -0.39.
- T4 held for Chicago, refuted for Austin. Chicago: the rule flags new construction, alteration, electrical, mechanical, demolition and fire (source tails 1.1 to 157 times Chicago's, which is issued-only with a short history tail) and folds them into "other", nearly removing the class. Transfer improves at every quantile, 13.2% at q0.9. Austin: the rule flags new construction, alteration, demolition and sign; the fold costs 2.96 days at q0.9. The cost sits in classes the rule did not touch: mechanical (+3.03 days of contribution) and plumbing (+2.32), whose source tails are far shorter than Austin's (ratios 0.01 and 0.0), plus new construction (+1.49); electrical gains (-2.97). A merge changes the shared trees for every class, so a per-class ratio does not predict its effect.
- Edge case found: a class whose held-out q0.9 is 0 (Chicago plumbing) has no ratio and is never flagged.
- What this does to sessions 75 and 76. Their i2c reading, that the sources' demolition tail is longer than Seattle's, holds only against the right-censored test year. Against Seattle's history the sources' demolition tail is the shorter one (0.70). So the session 76 fold scores better because the i2c test labels are censored at the pull, not because the sources mislead the model about real Seattle build times. The practical advice in session 76 ("merge any class whose source tail is longer than the target's") is withdrawn as stated: in a2i (little censoring) the same rule helps in Chicago and hurts in Austin.
- Wider consequence: every i2c test-year score in this programme is on permits completed before the pull, so recent test years under-represent long builds (Seattle new construction q0.9: 957 days in history, 654 in 2024). The i2c scores need a censoring-aware evaluation, for example scoring on issue cohorts old enough to have completed, or a censored pinball loss.
- Limits: one rule, one threshold, 3 seeds; the fold target ("other" when alteration is flagged) is a choice; the by-class contributions have no intervals.
Next: score i2c with a censoring-aware evaluation and rerun the cascade2/type/nodemo comparison under it; a fold rule that predicts its effect by refitting on Y-1 (a validation-year paired check) instead of a tail ratio; a second labeller.

## Session 76, 2026-11-12: naming demolition is what costs cascade2 its i2c q0.9 transfer; folding it into alteration removes two thirds of the cost and keeps the gains (S1 to S4 held)

Why: session 75 found that of cascade2's +3.01-day Seattle i2c 2024 transfer q0.9 cost, demolition rows carry +1.69 (56%, 398 rows), and that demolition is the one class whose source completion tail is longer than Seattle's (q0.9 ratio 1.20). It read this post hoc as: naming a class imports the sources' tail for it. Session 75 suggested dropping source demolition rows. This session tests a cleaner version: `--classes cascade2_nodemo` folds demolition into alteration. The training rows stay the same and only the class feature loses demolition, so any change comes from not naming the class. A second session (this one) independently reran session 75's i2c 2024 and a2i 2023 pairs on a 2026-11-12 pull with the same row counts, and got the same numbers to the printed digit (+3.01 [1.65, 4.39]; -5.56 [-6.46, -4.56]; the same per-class split).
- New: `transfer.py --classes cascade2_nodemo`. `by_class` groups a folded configuration's rows by their class before the fold, so the demolition rows stay visible (1 test).
Predictions (written before any run): `python3.13 src/transfer.py DIR --target {i2c,a2i} --seeds 3 --held seattle --test-year 2024 --classes cascade2 cascade2_nodemo type` (paired: nodemo minus cascade2, type minus cascade2).
- (S1) i2c 2024, transfer q0.9, cascade2_nodemo minus cascade2: 95% interval below zero.
- (S2) In that difference, the rows cascade2 calls demolition contribute more than half of the total (same sign, negative).
- (S3) i2c 2024, transfer q0.9, cascade2_nodemo minus type (from the two paired differences): point estimate below +1.5 days, under half of the +3.01 cost.
- (S4) a2i 2024, transfer q0.9: folding demolition keeps cascade2's gain. cascade2_nodemo minus cascade2 has an interval including zero, or above zero by less than 1 day.
Each is refuted if its condition fails.
Outcome. Same 2026-11-12 pull as above (row counts equal session 75's). Both commands ran one after another, about 25 minutes in all (`boosted.fit_predict` uses 4 threads; session 75's parallel-run note holds). Outputs: `results/paired_transfer_seattle_{i2c,a2i}_2024_4city_{cascade2_nodemo,type}_vs_cascade2.json` and `results/transfer_seattle_{i2c,a2i}_2024_4city_cascade2_nodemo.json`. The committed type and cascade2 single-configuration files keep their earlier pulls, as in session 75. The type-minus-cascade2 pairs reproduce session 75 exactly (i2c q0.9 3.01 [1.65, 4.39], sign flipped) and give a2i q0.9 +3.80 [2.75, 4.84] on this pull (session 74: 3.88).
- Paired differences against cascade2, days of mean pinball loss [95% week-block interval] (share of own baseline loss); negative = the other configuration is better:

| target | b minus cascade2 | model | q0.1 | q0.5 | q0.9 |
|---|---|---|---|---|---|
| i2c | nodemo | transfer | -0.02 [-0.09, 0.05] | +0.15 [-0.08, 0.37] | **-1.98 [-2.70, -1.24] (-4.2%)** |
| i2c | nodemo | own-city boosted | -0.08 [-0.14, -0.03] | -0.44 [-0.81, -0.07] | +0.07 [-0.15, 0.28] |
| i2c | type | transfer | +0.74 [0.53, 0.96] | +0.91 [0.26, 1.56] | -3.01 [-4.39, -1.65] |
| a2i | nodemo | transfer | 0.00 [0.00, 0.00] | +0.12 [0.05, 0.19] (+0.3%) | -0.07 [-0.47, 0.35] |
| a2i | nodemo | own-city boosted | +0.04 [-0.00, 0.08] | -0.05 [-0.13, 0.03] | -0.15 [-0.33, 0.01] |
| a2i | type | transfer | +0.01 [0.00, 0.01] | +0.52 [0.29, 0.78] | +3.80 [2.75, 4.84] |

- (S1) Held: not naming demolition cuts the i2c transfer q0.9 loss by 1.98 days [1.24, 2.70].
- (S2) Held: the 398 rows cascade2 calls demolition contribute -1.74 of the -1.98 (88%; mean -18.8 days per row). "Other" adds -0.26 and alteration -0.18; new construction goes the other way (+0.20).
- (S3) Held: cascade2_nodemo minus type at i2c q0.9 is -1.98 + 3.01 = +1.03 days, a third of cascade2's +3.01 cost. That is a difference of two paired estimates, with no interval of its own.
- (S4) Held: at a2i q0.9 folding demolition changes nothing (-0.07, interval spans zero), so cascade2_nodemo keeps cascade2's 3.9-day gain over type. Its only cost is a2i transfer q0.5, +0.12 days (0.3% of baseline loss).
- So the session 75 reading survives a direct test. The class feature lets the transferred model give demolition the sources' longer completion tail (q0.9 665 against Seattle's 552 days), and taking the name away removes most of that. Against type, cascade2_nodemo keeps every i2c lower-quantile gain (q0.1 -0.76, q0.5 -0.76 days) and every a2i gain. For a practitioner borrowing a model across cities: merge any class whose source tail is longer than the target's before transfer, or check per-class tails first (`src/tail_check.py`).
- Limits: one held-out city, one test year (2024; session 75 found the i2c cost absent in 2023), 3 seeds. The fold was chosen after seeing session 75's split, so this tests that reading, not a rule picked in advance. A general rule (fold every class whose source/target q0.9 ratio interval is above 1) needs another city and year to check.
Next: the general fold rule on Chicago- and Austin-held-out runs (a2i) and on 2022/2023 i2c; cascade2_nodemo in the paper's transfer table; a second labeller.

## Session 75, 2026-11-11: where the cascade2 i2c q0.9 penalty sits, and test year 2023 for the paired run (R1, R2 refuted; Q4 held; the i2c q0.9 cost does not repeat in 2023)

Why: session 74 found that cascade2 makes Seattle i2c transfer worse at q0.9 (+2.19 days [0.90, 3.51]) and read it, untested, as the sources (SF, Austin) giving new construction a completion tail Seattle's new-construction permits do not share; and Q4 (test year 2023) was not run. The Socrata hosts answered at 23:08 UTC; fresh four-feed pull started then.
- New: `transfer.paired()` writes `by_class`, each cascade2 class's row count, mean b-minus-a difference and contribution to the overall difference (contributions add up to it; tested). New `src/tail_check.py`: per cascade2 class, q0.5 and q0.9 of the target among the sources' training rows and the held-out test year's rows, with a bootstrap interval on the q0.9 ratio (3 tests).
Predictions (written before any of these runs):
- (R1) Within new construction, the sources' i2c q0.9 (SF and Austin, years <= 2022) exceeds Seattle's 2024 new-construction q0.9: ratio's 95% interval above 1. Refuted otherwise.
- (R2) In the 2024 i2c paired rerun, Seattle's new-construction rows carry more than half of the transfer q0.9 penalty (contribution > 1.10 of the 2.19 days) and their own mean difference is positive. Refuted otherwise.
- (R3) The rerun reproduces session 74's aggregate paired numbers exactly (same pull counts, fixed seeds).
- (Q4, session 73) Test year 2023: a2i transfer q0.9 cascade2 minus type has a 95% interval below zero.

Outcome. Fresh four-feed pull 2026-11-11 23:08 to 23:29 UTC. Unlike session 74, the feeds had changed: every count is up slightly (Chicago 852,814, SF 1,298,215, Austin 2,384,967, Seattle 194,219 rows; `results/manifest.json`). Runs: `python3.13 src/tail_check.py DIR --target i2c --test-year {2024,2023}`; `python3.13 src/transfer.py DIR --target {i2c,a2i} --seeds 3 --held seattle --test-year {2024,2023} --classes type cascade2`, run one after another. The committed type-only `transfer_seattle_*_{2023,2024}_4city.json` files and the 2024 cascade2 file stay as they were (session 64/65/71 pulls). The paired files for 2024 i2c and 2023 a2i/i2c and the new 2023 cascade2 files come from this pull. The 2024 a2i paired file is session 74's, not rerun.
- R1 refuted, the other way round. Within new construction the sources' 2024 i2c q0.9 is 484 days against Seattle's 654: ratio 0.74 [0.72, 0.77] (2023: 471 vs 826, 0.57 [0.55, 0.61]). Seattle's tail is the longer one in new construction, alteration (0.77, 0.69) and "other" (0.89, 0.65). Only demolition has the sources' tail longer: 665 vs 552 days, 1.20 [1.16, 1.24] (2023: 1.10 [1.01, 1.21]). Seattle's median completion time is about twice the sources' in every large class (new construction 410 vs 170 days in 2024).
- R2 refuted. 2024 i2c transfer q0.9, cascade2 minus type: +3.01 days [1.65, 4.39] (+6.4% of baseline loss), new pull. New construction (880 rows) contributes +0.42 days (mean +2.1 per row), 14% of it. Demolition (398 rows) contributes +1.69 (56%, mean +18.3 per row), "other" +0.59 and alteration +0.33.
- R3 not testable as stated: the feeds changed, so the rerun cannot reproduce session 74 exactly. Same 4,313 test rows; the q0.9 penalty moved from +2.19 to +3.01 days, still above zero; q0.1 -0.74 and q0.5 -0.91 (session 74: -0.70, -0.85).
- Q4 held. 2023 a2i transfer q0.9, cascade2 minus type: -5.56 days [-6.46, -4.56] (-13.7% of baseline loss; 5,106 test rows). Alteration (-4.4 days) and new construction (-2.9) carry the gain; "other" goes the other way (+2.1). Own-city boosted gains at every quantile (-0.22, -0.73, -0.86).
- Not predicted: the i2c q0.9 cost does not repeat in 2023. The difference is -1.61 days [-3.37, +0.14], interval spanning zero. Demolition still contributes +0.62 there, against -2.75 from alteration. q0.1 -0.70 [-1.05, -0.37] repeats. So the build-time upper-tail cost of the class appears in one of two test years.
- Post-hoc reading, not a test: naming a class imports the sources' tail for that class. That costs at q0.9 only where the sources' tail is longer than the target's, which is demolition, and helps where it is shorter. That fits the sign pattern of the contributions in both years; the 2024 demolition contribution is the only large positive one. A pre-registered test would drop demolition from the source rows (or reweight it) and predict that the 2024 penalty falls below 1 day.
- Process: the first attempt ran the three jobs in parallel. `boosted.fit_predict` hardcodes `num_threads=4`, so `OMP_NUM_THREADS` did nothing and 12 OpenMP threads competed for 4 cores. The jobs did not finish the type half in 100 minutes. Run alone, each took 5 to 8 minutes. This probably explains session 74's "half speed" too.
- Limits: two test years, one held-out city, 3 seeds. The by-class contributions have no intervals. Recent Seattle cohorts are right-truncated (2024 permits still open at the pull have no completion date), so Seattle's tails are understated and the ratios below 1 are conservative.
Next: the pre-registered demolition-drop run above; 2022 for the paired pair; Chicago and Austin held out; a second labeller.

## Session 74, 2026-11-11: the paired cascade2-versus-type bootstrap (session 73's Q1 to Q3 run; two held, one refuted narrowly; Q4 not run)

Why: session 71 compared each class configuration with Seattle's own baseline, never with each other; session 73 wrote the paired code and four predictions. The Socrata hosts answered this session (Chicago 200 at 01:06 UTC). Four-feed pull 01:07 to 01:22 UTC; every row count equals the 2026-11-10 pull (`results/manifest.json`, only the dates move), so the feeds had not changed since session 71.
- Run: `python3.13 src/transfer.py DIR --target {a2i,i2c} --seeds 3 --held seattle --test-year 2024 --classes type cascade2` (`OMP_NUM_THREADS=2`, the two targets in parallel). Output: `results/paired_transfer_seattle_{a2i,i2c}_2024_4city_cascade2_vs_type.json`. Both single-configuration outputs reproduce: the cascade2 files are byte-identical to session 71's, and the type rerun gives session 71's same-pull numbers (a2i +0.0/+0.7/+27.4%, i2c -8.4/-10.4/-3.5%), so the committed session 64 type files stay as they are. The paired means equal the differences of the unpaired relative losses (a2i q0.9: 15.9 - 27.4 = -11.5 points; i2c q0.9: 1.2 - (-3.5) = +4.7), a check on the code.
- cascade2 minus type, mean pinball loss in days (negative = cascade2 better), 95% week-block interval, and the difference as a share of Seattle's own per-type baseline loss (5,541 a2i and 4,313 i2c test rows, 3 seeds):

| target | model | q0.1 | q0.5 | q0.9 |
|---|---|---|---|---|
| a2i | transfer | -0.006 [-0.009, -0.003] (-0.1%) | -0.54 [-0.80, -0.31] (-1.2%) | -3.88 [-4.92, -2.84] (-11.5%) |
| a2i | own-city boosted | -0.43 [-0.57, -0.29] (-4.1%) | -0.72 [-1.13, -0.29] (-1.5%) | -0.92 [-1.33, -0.48] (-2.7%) |
| i2c | transfer | -0.70 [-0.93, -0.49] (-2.5%) | -0.85 [-1.58, -0.09] (-1.0%) | +2.19 [0.90, 3.51] (+4.7%) |
| i2c | own-city boosted | -0.92 [-1.35, -0.52] (-3.3%) | -2.06 [-2.74, -1.37] (-2.3%) | -0.73 [-0.94, -0.54] (-1.6%) |

- Q1 held: a2i transfer q0.9 interval below zero (-3.9 days, 11.5 points of baseline loss). The cleaner class removes about two fifths of the upper-tail transfer penalty, now with an interval on the difference itself.
- Q2 refuted, narrowly: the i2c transfer q0.5 interval [-1.58, -0.09] excludes zero. The effect is small (1.0% of baseline loss), and session 71's unpaired comparison (-10.4% to -11.4%) could not see it.
- Q3 held: a2i own-city boosted q0.1 below zero (-0.43 days).
- Q4 (the same run for test year 2023) not run. A worker restart at 02:23 UTC killed both runs about 40 minutes into their cascade2 halves, and after the restart the machine ran at about half speed (the type half took 90 minutes instead of 40). The 2023 pair would have cost about three more hours, so it waits for the next session with the feeds.
- Not predicted: cascade2 makes i2c transfer worse at q0.9 (+2.2 days, +4.7%, interval above zero). In session 71 both configurations spanned zero against the baseline (-3.5% and +1.2%), so this was invisible there. The work type helps the transfer model at the median and below, and in the upper tail of permit issue time, but costs it in the upper tail of build time. A reading, not tested: the sources (SF and Austin only for i2c) give new construction a long completion tail that Seattle's new-construction permits do not share, so naming the class imports the sources' tail. The own-city model gains in all six cells, so the class carries signal inside Seattle.
- Limits: one test year, one held-out city, 3 seeds. The interval covers week-to-week sampling of test rows, not seed variance or labeller error in the rules. The relative column divides by the type run's own-baseline loss (the baseline does not use the class).
Next: Q4 (2023) and the same pair for 2022; Chicago and Austin held out; test the i2c q0.9 reading by comparing source and Seattle completion-time quantiles within new construction; session 72's source-reweighting run; a second labeller.

## Session 73, 2026-11-10: a paired bootstrap between class configurations, and Cohen's kappa for the description rules (feeds unreachable; prediction written)

Why: sessions 71 and 72 left "a paired bootstrap of cascade2 against type-only" (session 71 compared each class configuration with the baseline, never with each other). Every Socrata host answered 403 to CONNECT through this session's egress proxy at 22:27 UTC (as in sessions 68, 70 and 72), so no feed could be pulled and no transfer number is new. Ran in parallel with session 72, whose `desc_confusion.py` already gives per-class precision and recall; this session's duplicate per-class tables were dropped at merge.
- `src/transfer.py --classes` now takes several configurations (`--classes type cascade2`). They share the test rows (only the class feature differs), so the first is compared with each later one row by row: `paired()` writes `results/paired_transfer_<city>_<target>_<year>[_4city]_<b>_vs_<a>.json` with the mean pinball difference b minus a (days), its 95% week-block interval and the change relative to the own baseline's loss, for the transfer and own-city boosted models. It refuses two runs whose test rows or own-baseline losses differ. Single-configuration runs write exactly what they wrote before. Two tests in `tests/test_transfer.py` (identical runs give a zero difference; on synthetic feeds where the work type sets the lag, knowing it gives a q0.5 interval below zero; different test rows are refused).
- `python3 src/desc_eval.py kappa` prints Cohen's kappa from the committed (label, v1, v2) codes (`tests/test_desc_eval.py` checks it on textbook cases): held out (2022), v2 0.790 in Chicago and 0.901 in Seattle (v1 0.469 and 0.579); dev (2023), v2 0.895 and 0.925 (v1 0.423 and 0.563).
Prediction for the first paired run (written before any paired number exists; `python3 src/transfer.py DIR --target {a2i,i2c} --seeds 3 --held seattle --test-year 2024 --classes type cascade2`, same pull procedure as session 71):
- (Q1) Seattle a2i transfer at q0.9: cascade2 minus type is negative with a 95% week-block interval below zero (session 71's unpaired numbers: +27.4% to +15.9% of baseline loss).
- (Q2) Seattle i2c transfer at q0.5: the cascade2 minus type interval includes zero (unpaired: -10.4% to -11.4%).
- (Q3) Seattle a2i own-city boosted at q0.1: cascade2 minus type below zero (unpaired: -5.5% to -9.6%).
- (Q4) The same run for test year 2023 gives Q1 again (a2i q0.9 interval below zero).
Each part is refuted if its interval condition fails.
- Limits: no new data; kappa has one labeller and 150 held-out rows per city.
Next: the paired run above (Q1 to Q4) when the feeds answer, then Chicago and Austin held out and session 72's source-reweighting run; a fresh labelled year (2021) to score any v3 rules, since 2022 has now been read; a second labeller; full-model width bootstrap.

## Session 72, 2026-11-10: where the description rules err, and why that error cannot move the Seattle overlap (feeds unreachable; offline from committed codes)

Why: session 71 scored the description rules on accuracy only and quoted the Seattle class overlap (0.501, a2i 2024) from the rules' predictions, which are wrong on 1 held-out Seattle row in 20 and 3 Chicago rows in 20. Every Socrata host (Chicago, SF, Austin, Seattle) answered 403 to CONNECT at 22:23 and again at 22:26 UTC, so the next transfer runs (Seattle 2022 and 2023 with the three class configurations) wait; this step uses only committed files.
- New `src/desc_confusion.py` (stdlib; `results/desc_confusion.json`, `.md`; 6 tests). Per-class confusion, precision and recall with Wilson intervals from the (label, v1, v2) codes in `results/desc_rules_eval.json`, and a misclassification-corrected Seattle test mix: the type-only run's demolition share is the structured part, the rest (0.907 of a2i test rows) is corrected with the held-out Seattle P(label | prediction) (posterior adjusted classify-and-count), bootstrapped over the 150 labelled rows.
- Predictions, written in the script before it first ran: (Q1) held-out v2 Seattle new-construction recall at least 0.80 and alteration precision at least 0.85 in both cities; (Q2) the corrected a2i overlap without "other" within 0.05 of 0.501, 95% interval inside [0.40, 0.60]. Both held: Q1 recall 0.93 [0.81, 0.98], alteration precision 0.86 (Chicago) and 0.98 (Seattle); Q2 0.501 corrected, interval [0.501, 0.501].
- The degenerate interval is the finding: the overlap is source-limited. Seattle's alteration (0.63), new construction (0.21 as run, 0.23 corrected) and demolition (0.09) shares all exceed the sources' (0.40, 0.08, 0.01), so every min() takes the source share, and no Seattle-side change in the rules moves the overlap. What caps it is the trades: electrical, plumbing and mechanical are 45% of the a2i sources' training rows and 0.3% of Seattle's test rows. Seattle's permits for single trades are separate trade permits not in this feed's description part (an inference from the shares, not checked against Seattle's permit documentation).
- Post hoc, source side: Chicago is an a2i source and is also classed from descriptions. Shifting the source mix by Chicago's held-out label-minus-prediction shares, weighted by at most 0.21 (Chicago's a2i rows over the 4,060,329-row pool), gives 0.508 [0.500, 0.518]. So rule error on either side moves the overlap by under 0.02.
- Where v2 errs (held out): in Chicago, electrical to "other" (5 of 150), alteration to plumbing (4) and to electrical (3); alteration recall 0.74 [0.57, 0.85] is the weakest large class. Seattle has 7 errors in 150, spread over alteration, new construction and "other". v1's held-out Chicago electrical recall was 0.50 and Seattle new-construction recall 0.38; those two account for most of session 71's v1-to-v2 gain.
- Limits: one labeller; the correction assumes the 2022 labelled rows stand for the 2024 description part; the Chicago share is an upper bound; the bootstrap covers sampling of labelled rows, not labeller error.
Next (unchanged, needs the feeds): Seattle 2022 and 2023 with type / cascade / cascade2; Chicago and Austin held out; a paired bootstrap of cascade2 against type-only; a second labeller. New: since the overlap is source-limited, a transfer run that reweights the source rows to Seattle's class mix (or drops the trade classes) tests whether class mismatch or duration mismatch drives the q0.9 gap.

## Session 71, 2026-11-10: the description rules measured against hand labels (v1 60% / 78% held out, revised v2 85% / 95%), and the first transfer run with a work-type class

Why: session 70 wrote description keyword rules (`classmap.DESC_RULES`) without classifying a single real description, and noted that its P1 measures coverage, not correctness. The Socrata hosts answered this session (Chicago, SF, Seattle 200 at 21:08 UTC; Austin timed out on the first probe).
- New `src/desc_eval.py` (stdlib). `sample` draws applications whose permit_type and work_class both map to "other" (the rows the description must rescue) from one year in Chicago and Seattle, and keeps the text outside git; `score` scores the rules against hand labels and writes `results/desc_rules_eval.json` with each row's (label, v1, v2) codes so the numbers recompute from git alone. Labels: `results/desc_labels_2023.txt`, `results/desc_labels_2022.txt` (codes only; the protocol is in the script's docstring).
- Labeller: the agent running this session, from the text alone, without the rules' output; one labeller, so no inter-rater agreement. A mixed job takes its principal job; administrative rows, elevators, scaffolds, telecom equipment and plain "monthly maintenance" are "other".
- Dev sample (2023, 200 per city): v1 agrees with the labels on 56.0% of Chicago rows and 77.0% of Seattle rows. Main errors: "erect" sends solar arrays, fences and scaffolds to new construction (15 Chicago rows were solar alone); fire-alarm permits that mention a tenant build-out go to alteration; electrical service, panel, fixture and camera work has no rule (22 Chicago electrical rows fall to "other"); Seattle's "Construct west two-family dwelling" has no "new" (25 of 52 new-construction rows fall to "other"); seismic retrofits have no rule; contractor-change rows are classed by the trade they name.
- `classmap.DESC_RULES_V2` answers each of those patterns (listed in the code). On the dev sample it scores 92.5% and 96.5%, which is optimistic by construction.
- Held-out sample (2022, 150 per city, a different seed and offsets), labelled after v2 was written and before either rule set was run on it:

| city | n | v1 accuracy | v2 accuracy (95% Wilson) | rows only v1 right / only v2 right | exact McNemar p |
|---|---|---|---|---|---|
| Chicago | 150 | 60.0% | 85.3% [78.8, 90.1] | 2 / 40 | 4.1e-10 |
| Seattle | 150 | 78.0% | 95.3% [90.7, 97.7] | 1 / 27 | 2.2e-07 |

- So session 70's rules were wrong on two rows in five in Chicago; the session 70 predictions P1 to P4 are still scored on them below (they were pre-registered on v1), and the revised rules get their own run.
- The loader now writes `desc_class_v2` beside `desc_class`; `transfer.py --classes cascade2` uses it, and `other_vocab.py` reports both.
Prediction for the v2 run (written before any transfer run with either rule set; same test year, seeds and thresholds as session 70's P1 to P4): (P1') the v2 cascade gives a class other than "other" to at least half of the permit-type "other" rows in Chicago and in Seattle; (P2') Seattle a2i overlap with its source mix on the training years, without "other", is at least 0.30; (P3') Seattle a2i transfer is still worse than the own-city baseline at q0.9 (CI above zero); (P4') Seattle i2c transfer at q0.5 moves less than 3 points from the type-only run.
- Limits (labels): one labeller (the agent); samples are the first rows Socrata returns for the year at the chosen offsets, shuffled, not a uniform draw over the year; only Chicago and Seattle are checked (SF and Austin are mostly classed by their structured fields).

Outcome, fresh four-feed pull 2026-11-10 21:17 to 21:33 UTC (row counts as session 69; `results/manifest.json` unchanged), `python3.13 src/transfer.py DIR --target {a2i,i2c} --seeds 3 --held seattle --test-year 2024 --classes {cascade,cascade2,type}`. Relative change of mean pinball loss against Seattle's own per-type baseline, 95% week-block bootstrap of the difference in days (`results/transfer_seattle_{a2i,i2c}_2024_4city_{cascade,cascade2}.json`; test rows 5,541 a2i and 4,313 i2c; 3 seeds). "type" is the same-pull rerun of the session 64 configuration; its a2i numbers reproduce session 64 exactly, its i2c numbers differ by up to 1.6 points (the Seattle feed changed since), so the committed session 64 files are left as they were and the rerun is quoted here only.

| target | classes | q0.1 | q0.5 | q0.9 | 80% coverage (baseline 0.890 / 0.882) | class overlap with sources, without "other" |
|---|---|---|---|---|---|---|
| a2i | type (rerun) | +0.0% (CI spans 0) | +0.7% (spans 0) | +27.4% [7.7, 10.6 d] | 0.644 | 0.006 |
| a2i | cascade (v1) | -0.0% [-0.01, -0.00 d] | +2.2% [0.6, 1.4 d] worse | +41.7% [12.1, 15.9 d] | 0.703 | 0.512 |
| a2i | cascade2 (v2) | -0.1% [-0.01, -0.00 d] | -0.5% (spans 0) | +15.9% [3.8, 6.8 d] | 0.755 | 0.501 |
| i2c | type (rerun) | -8.4% [-2.9, -1.8 d] | -10.4% [-11.2, -7.3 d] | -3.5% (spans 0) | 0.723 | 0.002 |
| i2c | cascade (v1) | -10.1% [-3.3, -2.4 d] | -11.2% [-11.6, -8.0 d] | +1.2% (spans 0) | 0.816 | 0.449 |
| i2c | cascade2 (v2) | -10.9% [-3.5, -2.6 d] | -11.4% [-11.9, -8.2 d] | +1.2% (spans 0) | 0.797 | 0.448 |

- Session 70 predictions (v1 rules), all four held: P1 the cascade classes 71.8% of Chicago's and 78.2% of Seattle's permit-type "other" rows (`results/other_vocab.md`); P2 Seattle a2i overlap without "other" is 0.512 (from 0.006); P3 a2i q0.9 transfer still worse (+41.7%, CI above zero); P4 i2c q0.5 moves 0.5 points from the committed type-only run (-10.7% to -11.2%; 0.8 from the same-pull rerun).
- v2 predictions, all four held: P1' 72.4% and 92.4%; P2' 0.501; P3' +15.9%, CI above zero; P4' -11.4% (0.7 points from -10.7%, 1.0 from the rerun).
- Not predicted: the work type matters for the upper tail. With the noisy v1 class the a2i q0.9 penalty grows (+27.4% to +41.7%) and q0.5 turns significantly worse; with the v2 class it falls to +15.9% and coverage rises from 0.644 to 0.755. So session 70's reading of P3 ("the upper-tail gap is a duration-distribution mismatch, not a class problem") is only partly right: P3 held, but about two fifths of the q0.9 gap (27.4 to 15.9 points) goes with a cleaner class. Same-pull own-city boosted models gain too (a2i q0.1 -5.5% to -9.6%, i2c q0.9 -3.6% to -5.2%).
- i2c q0.9 does not improve: -3.5% (type) to +1.2% (both cascades), all spanning zero.
- Limits: one test year, 3 seeds, Seattle only; no interval on the difference between class configurations (each is compared with the baseline, not with each other); the v2 rules were written against 2023 descriptions, the early-stopping year here, never against the 2024 test rows.
Next: the same three class configurations for Seattle 2022 and 2023 and with Chicago and Austin held out; a paired bootstrap of v2 against type-only transfer; a second labeller for the 2022 sample; full-model width bootstrap.

## Session 70, 2026-11-10: the loader now keeps a work-type class from the description (feeds unreachable again; rerun prediction written)

Why: session 69 found Chicago's and Seattle's structured fields do not name the kind of work, so a retuned class map needs the description, which the loader kept only as a length. Every Socrata host answered 403 to CONNECT through this session's egress proxy at 20:10 UTC (as in session 68), so this session builds and tests the code path and writes the prediction; it reports no new number.
- New `src/classmap.py` (stdlib): the session 10 map `RULES` moved here unchanged (every committed result reproduces; `transfer.py` and `other_vocab.py` import it), plus `DESC_RULES` for free text and `cascade(permit_type, work_class, desc_class)`, the first non-"other" class in that order. The description rules put whole-job phrases first (demolish/wreck; erect, "construct new", "new single family ..."), structural alteration words next, single trades after, generic repair words last, because a description lists trades inside bigger jobs and "new" alone ("install new water heater") is not new construction. They were written from documented field meanings and common permit phrasing, before any real description was classified with them; 16 description phrases in `tests/test_classmap.py` pin the intended behaviour, not its accuracy.
- `src/permits.py` writes a `desc_class` column at pull time and still stores no description text (it can name people and addresses; only the class is needed).
- `src/transfer.py --classes cascade` builds the class from the cascade and writes `*_cascade.json`; the default `type` is the old behaviour. `src/other_vocab.py` now also reports, per city, the share of permit-type "other" rows the cascade rescues and to which classes.
Prediction for the first run with data (2024 test year, `--classes cascade`, 3 seeds; written before any description was classified):
- (P1) The cascade gives a class other than "other" to at least half of the permit-type "other" rows in Chicago and in Seattle (`other_vocab.md`). Refuted below 50% in either city.
- (P2) Seattle's a2i overlap with its source mix on the training years, without "other", rises from 0.006 (session 69, 2022) to at least 0.30. Refuted below 0.30.
- (P3) Seattle a2i transfer is still worse than Seattle's own per-type baseline at q0.9 (95% week-block CI above zero): the upper-tail gap is a duration-distribution mismatch, not a class problem. Refuted if the CI includes or is below zero.
- (P4) Seattle i2c transfer at q0.5 changes by less than 3 points of relative pinball loss from the type-only run (-10.7% in 2024): the generic fields carry what transfer gains. Refuted if it moves 3 points or more either way.
- Limits: the description rules are unvalidated; P1 measures coverage, not correctness. A hand-labelled sample needs the text, which the loader deliberately drops, so validation needs a one-off local sample kept outside git.
Next: pull with the new loader, run `other_vocab.py` and `transfer.py --classes cascade` against P1 to P4; hand-label about 200 descriptions per city (kept outside git) to measure the description rules' accuracy; full-model width bootstrap.

## Session 69, 2026-11-10: Seattle transfer in a third test year, 2022 (session 68's prediction run: it held), and why the class map cannot be retuned on permit type

Why: session 68 wrote a prediction for the 2022 transfer test but could not pull the feeds. They answered again at 18:08 UTC; fresh four-feed pull 2026-11-10 (Chicago 852,615, SF 1,298,152, Austin 2,384,746, Seattle 194,184 rows; `results/manifest.json`). `python3.12 src/transfer.py DIR --target {a2i,i2c} --seeds 3 --held seattle --test-year 2022` (source and own train to year <= 2020, early stopping on 2021, test 2022; code unchanged).
Prediction (session 68, written before this run): (P1) Seattle i2c transfer beats the baseline at q0.1 and q0.5, CIs below zero; (P2) Seattle a2i transfer worse at q0.9, CI above zero; (P3) both transfer 80% coverages below 0.75.

Outcome (2022, relative change of mean pinball loss against Seattle's own per-type baseline, 95% week-block bootstrap of the difference in days; `results/transfer_seattle_{a2i,i2c}_2022_4city.json`; test rows 6,139 a2i and 4,776 i2c; 3 seeds):
| target (sources) | q0.1 | q0.5 | q0.9 | 80% coverage (baseline) |
|---|---|---|---|---|
| a2i (Chicago, SF, Austin) | -0.1% [-0.02, -0.00 d] | +0.1% (CI spans 0) | +35.8% [16.3, 20.1 d] worse | 0.547 (0.821) |
| i2c (SF, Austin) | -11.4% [-4.7, -3.9 d] | -4.2% [-6.4, -3.7 d] | +14.1% [7.1, 12.4 d] worse | 0.672 (0.814) |
- All three parts held: P1 (both CIs below zero), P2 (+35.8%), P3 (0.547 and 0.672).
- Not predicted: i2c q0.9 is worse again (+14.1%), as in 2023 (+11.2%). Over three test years the i2c upper quantile is worse in two and better only in 2024 (-5.1%), so the 2024 all-quantile win was the exception, not the 2023 flip. Stable across 2022 to 2024: i2c q0.1 and q0.5 better (-6.7 to -11.4%, -4.2 to -10.7%), a2i q0.9 worse (+27 to +36%), every transfer interval under-covers (0.547 to 0.720).
- An own-city model on the same harmonised features beats the baseline at every quantile again (a2i -3.9, -20.3, -17.5%; i2c -12.8, -14.4, -8.2%), coverage 0.782 and 0.821.
- First direct measure of class overlap on the training years (`class_share_source_train`, added in session 68): Seattle 2022 test is 90% "other" and 10% "demolition"; the a2i sources' training years are 26% "other" and 0.6% "demolition", the i2c sources' 20% and 0%. Overlap is 0.27 (a2i) and 0.20 (i2c), and 0.006 and 0.00 without "other", so session 68's test-year proxy (0.32 / 0.15, 0.01 / 0.00) was close.

Second piece, session 68's "list the top permit types per city that map to 'other'": new `src/other_vocab.py` (stdlib; reads `RULES` out of `transfer.py` with `ast`) on the same pull, rows applied 2015 on; `results/other_vocab.md`, `.json`.
- Each feed has only 4 to 9 raw permit types. The catch-all is large because of what the field means, not because the keywords miss: Chicago's permit types are review tracks ("express permit program" 40.5% of rows, "easy permit process" 22.9%, elevator 3.1%), and Seattle's is "building" for 90.1% of rows.
- `work_class` rescues only Austin: its "building permit" rows (22.3%) carry new / repair / remodel / demolition, which the same keyword map would class for 25.4% of Austin's rows. Chicago's work class repeats the review track and Seattle's is residential / non-residential, so neither feed holds the kind of work in a structured field.
- So "retune the class map on each feed's vocabulary" (to do 6) cannot work for Chicago or Seattle with the fields we keep: it needs the description text (the loader stores only its length) or a different field. Paper 4.4a and to do 6 updated.
- Limits: three test years, 3 seeds, i2c has two source cities, class map not retuned; vocabulary counts are from one pull and rows with no application date are left out (Seattle 84,986 of 194,184 rows remain from 2015 on).
Next: keep a hashed or keyword-flag form of the description in the loader so a work-type class can be built for Chicago and Seattle, then rerun H4; a Seattle-free Austin retune (work_class) as the first test; full-model width bootstrap.

## Session 68, 2026-11-10: harmonised classes barely overlap between cities (2022 transfer prediction written, not run: feeds unreachable)

Why: sessions 65 to 67 left "third transfer test year (2022)". With `--test-year 2022` the split is source and own train to year <= 2020, early-stopping year 2021, test 2022 (`src/transfer.py`, unchanged).
Prediction (written before the run, from the 2023 and 2024 rows): (P1) Seattle i2c transfer beats Seattle's own per-type baseline at q0.1 and q0.5 with 95% week-block CIs below zero; (P2) Seattle a2i transfer is worse than the baseline at q0.9 (CI above zero); (P3) both transfer intervals under-cover (80% coverage below 0.75). No prediction for i2c q0.9, which flipped sign between 2024 and 2023. Refuted part by part if the stated CI or coverage condition fails.

Not run: every Socrata host (data.cityofchicago.org, data.sf.gov, data.austintexas.gov, data.seattle.gov) answered 403 to CONNECT through this session's egress proxy (17:18 UTC), so no feed could be pulled; the prediction above stands, unrun, for the next session with data access.
Instead, a diagnostic from committed files only: `src/class_overlap.py` reads the `class_share_test` of every `results/transfer_*.json` and measures how much the harmonised class (the one categorical feature transfer shares across cities) overlaps between a held-out city and its row-weighted source mix (source shares from the same test year, a proxy for the training years). `results/class_overlap_2024.md`:
| target | held out | top class (share) | 'other' | overlap | without 'other' |
|---|---|---|---|---|---|
| a2i | austin | electrical (0.31) | 0.22 | 0.22 | 0.00 |
| a2i | chicago | other (0.69) | 0.69 | 0.34 | 0.19 |
| a2i | seattle | other (0.91) | 0.91 | 0.32 | 0.01 |
| a2i | sf | alteration (0.97) | 0.00 | 0.10 | 0.10 |
| i2c | austin | electrical (0.32) | 0.21 | 0.00 | 0.00 |
| i2c | seattle | other (0.91) | 0.91 | 0.15 | 0.00 |
| i2c | sf | alteration (0.98) | 0.00 | 0.00 | 0.00 |
- The keyword map sends each city into its own classes: overlap without the catch-all is 0.00 or 0.01 in five of seven cells, at most 0.19 (Chicago). i2c Austin and SF share no class at all.
- So H4 (sessions 10, 64, 65) tested whether log cost, description length and calendar transfer, not permit type. That narrows what the paper can say (new section 4.4a; limitations and to-do updated). It does not change any reported number.
- `src/transfer.py` now also writes `class_share_source_train`, so the next run measures overlap on the training years directly.
- Limits: test-year shares stand in for training-year shares; the raw permit-type vocabularies are not in git, so I could not say which strings fall to "other" (that needs a pull).
Next: run the session 68 prediction when the feeds are reachable; retune the class map on each feed's real vocabulary (start by listing the top permit types per city that map to "other"), then rerun H4; full-model width bootstrap.

## Session 67, 2026-11-10: Seattle folded into the paper's title and abstract (no new compute)

Why: session 66 left "fold Seattle into the abstract". The title now says four-city; the abstract keeps findings (1) to (5) as three-city statements and adds a paragraph for Seattle (H1 19 of 21 cells, table narrower than baseline, mixed transfer in 2023 and 2024), every number copied from section 4.8.
Next: third transfer test year (2022); full-model width bootstrap; retune the class map.

## Session 66, 2026-11-10: paper section 4.8 for the fourth city (no new compute)

Why: sessions 61 to 65 added Seattle to the programme but `paper/paper.md` still said "three-city" with no fourth city. Added section 4.8 (H1, coverage and ship rule, width bootstrap, H4 transfer in 2024 and 2023) with every number copied from sessions 61 to 65 and `results/*seattle*`, and updated the limitations and to-do items. The title and abstract still describe the three original cities on purpose; folding Seattle into them is left for the final rewrite.
Next: third transfer test year (2022, needs the source train cut to year <= 2020); full-model width bootstrap; retune the class map; fold Seattle into the abstract.

## Session 65, 2026-11-10: Seattle H4 transfer on a second test year, 2023 (prediction written before the run)

Why: session 64 left "does the Seattle i2c transfer gain survive a second test year (2023)". Fresh four-feed pull 2026-11-10 (same row counts as session 64). `python3.13 src/transfer.py DIR --target {a2i,i2c} --seeds 3 --held seattle --test-year 2023`.
Prediction (before the run): Seattle i2c transfer beats Seattle's own per-type baseline at q0.5 in 2023 with a 95% week-block CI below zero (as in 2024); Seattle a2i transfer is worse than baseline at q0.9. Refuted if the i2c q0.5 CI includes zero or is above it, or a2i q0.9 is not worse.

Outcome (2023, relative change of mean pinball loss vs Seattle's own per-type baseline, 95% week-block bootstrap; `results/transfer_seattle_{a2i,i2c}_2023_4city.json`; test rows 5,106 a2i, 4,387 i2c; 3 seeds):
| target (sources) | q0.1 | q0.5 | q0.9 | 80% coverage (baseline) |
|---|---|---|---|---|
| a2i (Chicago, SF, Austin) | -0.1% (CI spans 0) | +0.5% (CI spans 0) | +27.1% (worse) | 0.613 (0.868) |
| i2c (SF, Austin) | -6.7% | -7.3% | +11.2% (worse) | 0.681 (0.827) |
- Prediction held on both parts: i2c q0.5 CI is below zero, a2i q0.9 is worse. The a2i row reproduces 2024 almost exactly.
- The i2c gain does not fully survive the second year: it holds at q0.1 and q0.5 (2024: -8.6%, -10.7%) but q0.9 flips to worse (+11.2%; 2024: -5.1%). So "transfer beats Seattle's own baseline at every quantile" was a 2024 result only; the stable part is the lower and middle quantiles.
- Transfer intervals under-cover in both years (0.613 and 0.681 in 2023). An own-city model on the same features beats the baseline at all three quantiles in both targets (i2c -8.9, -12.5, -3.4%; a2i -4.0, -18.8, -15.3%) with coverage 0.829 and 0.814.
- Limits: two test years, 3 seeds, two source cities for i2c, class map not retuned, the q0.9 flip is not explained (untested guess: Seattle's 2023 upper tail differs from the SF and Austin tails).
Next: unchanged milestones; a third test year (2022) would need the source train cut to year <= 2020.

## Session 64, 2026-11-10: Seattle in H4 transfer (no prediction written first)

Why: sessions 62 and 63 left "Seattle in H4 transfer". `src/transfer.py` now lists Seattle in `CITIES`, and writes `*_4city.json` so the three-city files stay as they were. Fresh four-feed pull 2026-11-10 (Chicago 852,615, SF 1,298,097, Austin 2,384,452, Seattle 194,184 rows), `python3 src/transfer.py DIR --target {a2i,i2c} --seeds 3 --held seattle`, results `results/transfer_seattle_{a2i,i2c}_2024_4city.json`.
Disclosure: I wrote no prediction before the run, so this is descriptive. The earlier H4 prior (session 10) was that transfer is worse than the own baseline.
Outcome (2024, relative change of mean pinball loss, transfer minus Seattle's own per-type baseline, 95% week-block bootstrap):
| target (sources) | q0.1 | q0.5 | q0.9 | 80% coverage (baseline 0.890 / 0.882) |
|---|---|---|---|---|
| a2i (Chicago, SF, Austin) | 0.0% (tie) | +0.7% (CI spans 0) | +27.4% (worse) | 0.644 |
| i2c (SF, Austin) | -8.6% | -10.7% | -5.1% (all CIs below 0) | 0.720 |
- Seattle a2i matches the Austin a2i pattern from session 10 (a tie at low quantiles because most predictions are zero, worse at q0.9) and its transfer interval under-covers (0.644).
- Seattle i2c is the first cell in the programme where transfer beats the held-out city's own baseline at all three quantiles; H4 as worded (transfer no better) is refuted there. An own-city model on the same harmonised features does better still (-11.3, -14.4, -3.6%), and the transfer interval still under-covers (0.720), so it is a better point forecast, not a calibrated one.
- Limits: one test year, 3 seeds, i2c has two source cities, Seattle's baseline is trained on a smaller history (194k rows), the harmonised class map was not retuned.
Next: bootstrap the full-model width; test whether the Seattle i2c transfer gain survives a second test year (2023).

## Session 63, 2026-11-10: Seattle week-block bootstrap of the width gap (no prediction written first)

Why: session 62 left the Seattle width gap as a point estimate. Fresh pull 2026-11-10 (194,184 rows, unchanged), `python3 src/width_boot.py DIR --test-year 2024 --only seattle:a2i seattle:i2c` (the script now tags its output file when `--only` is given, so `results/width_boot_2024.json` is not overwritten; Seattle goes to `results/width_boot_2024_seattle.json`).
Disclosure: I did not write a prediction before the run; this is a descriptive interval, not a hypothesis test.
Outcome (dequantised nonempty CQR, mean 80% width in days; difference = table minus baseline, 95% week-block bootstrap, 2000 draws):
| set | baseline cov / width | table cov / width | diff [95% CI] |
|---|---|---|---|
| Seattle a2i | 0.887 / 256.7 | 0.833 / 249.3 | -7.4 [-13.3, -1.1] |
| Seattle i2c | 0.851 / 660.5 | 0.820 / 642.2 | -18.3 [-23.4, -12.9] |
- Unlike the other three cities (baseline narrower in four of five sets), the three-key table is narrower than the per-type baseline in both Seattle targets, both intervals exclude zero; the a2i gap (3% of width) is small. Point values reproduce session 62's coverages and widths to the logged digits.
- Limits: one test year, the bootstrap does not redraw the calibration quantile, width of the full model (the narrowest in session 62) not bootstrapped, post hoc.
Next: Seattle in H4 transfer; bootstrap the full-model width.

## Session 62, 2026-11-10: Seattle nonempty CQR and per-type table (prediction written before the run)

Why: session 61 left the nonempty-CQR arm and the table models unrun for Seattle. Fresh pull 2026-11-10 (194,184 rows, same as session 61). `python3 src/prior_table3_cov.py DIR --test-year 2024 --seeds 2 --cities seattle` (new `--cities` flag; writes `results/prior_table3_cov_2024_seattle.json` so the five-set file is not overwritten).
Prediction (before the run): `dequantised_nonempty` coverage of the per-type baseline and the table lies within 77 to 83% in both Seattle targets, and the ship rule of session 59 picks the per-type baseline for both (as in four of the five earlier sets). Refuted if a cell is outside 77 to 83% or the table is narrower in either target.

Outcome (2024, nonempty dequantised interval, coverage / mean 80% width in days; `results/prior_table3_cov_2024_seattle.json`):
| target | baseline | table | full |
|---|---|---|---|
| a2i | 0.887 / 256.7 | 0.833 / 249.3 | 0.845 / 232.3 |
| i2c | 0.851 / 660.5 | 0.820 / 642.2 | 0.821 / 606.8 |
- Prediction refuted on both parts. Coverage: three of six cells are outside 77 to 83% (baseline 0.887 and 0.851, table a2i 0.833, full a2i 0.845), all over-coverage, the safe direction. Ship rule (`src/ship_decision.py`, unchanged): the full model is narrowest in both targets (232.3 and 606.8 days, 7 to 9% under the baseline), so Seattle is the first city where the full model ships, not the per-type baseline.
- The `dequantised` arm reproduces session 61's 0.770 for full a2i (table 0.757, baseline 0.792) and the nonempty arm repairs it to 0.845, same mechanism as session 58.
- Limits: one test year, 2 seeds, no width bootstrap for Seattle (the 7 to 9% gap is a point estimate), ship rule post hoc.
Next: week-block bootstrap of the Seattle width gap (`src/width_boot.py`), then Seattle in H4 transfer.

## Session 61, 2026-11-09: fourth city, Seattle (licence checked; H1 and H2 rerun, no prediction written first)

Why: "a fourth city after a licence check" had been open since session 60. Seattle `76t5-zqzr` metadata says Public Domain (`datasheets/seattle.md`). Pulled 2026-11-09 (194,184 rows). `python3 src/boosted.py DIR --city seattle --target T --test-year 2024 --seeds 3`, then `src/conformal_run.py`; results `results/boosted_seattle_*_2024.json`, `results/conformal_dq_seattle_*_2024.json`.
- H1 holds: boosted beats the per-type baseline at q0.1/0.5/0.9 in both targets, every 95% week-block interval below zero (a2i q0.5 46.5 to 35.8 days; i2c q0.5 88.3 to 72.5; smallest gain i2c q0.9, 47.1 to 46.0).
- Coverage (nominal 80%): boosted raw 0.850 (a2i), 0.833 (i2c); conformal 0.852, 0.815; dequantised 0.770 (a2i, qhat_dq -0.59, the zero-inflation collapse of session 55) and 0.813.
- Limits: one test year; `baselines.py` (needs xgboost, install timed out) and CatBoost not run; nonempty-CQR arm and the table models not run for Seattle; `prior_table3.py` FILES lists Seattle but was not run.
Next: nonempty CQR and the per-type table for Seattle, then add it to H4 transfer.

## Session 60, 2026-11-09: milestone 7i, week-block bootstrap of interval width (per-type baseline vs three-key table)

Why: session 59 left "width intervals by bootstrap over weeks" open; its ship rule compared point widths. Fresh pull 2026-11-09 (all three hosts reachable), `python3 src/width_boot.py DIR --test-year 2024`, results in `results/width_boot_2024.json`, 2 unit tests.
Prediction (written before the run): the baseline-vs-table width difference has a 95% interval excluding zero in every set, and the sign matches session 59's ship choice (baseline narrower in four sets, table in Austin i2c).
Outcome (mean 80% width in days, dequantised nonempty CQR; difference = table minus baseline, 95% week-block bootstrap, 2000 draws):
| set | baseline cov / width | table cov / width | diff [95% CI] |
|---|---|---|---|
| Chicago a2i | 0.885 / 55.3 | 0.825 / 117.9 | +62.6 [55.3, 70.6] |
| SF a2i | 0.826 / 32.6 | 0.834 / 42.2 | +9.6 [9.0, 10.2] |
| SF i2c | 0.844 / 373.5 | 0.837 / 398.8 | +25.2 [23.1, 27.6] |
| Austin a2i | 0.823 / 156.1 | 0.825 / 160.6 | +4.6 [0.2, 9.3] |
| Austin i2c | 0.839 / 324.1 | 0.836 / 289.6 | -34.5 [-36.9, -32.1] |
- Prediction confirmed: all five intervals exclude zero and signs match session 59. Austin a2i is marginal (lower end 0.2 days on a width of 156), so "baseline narrower" there is barely distinguishable from a tie.
- The point values reproduce session 58/59's coverages and widths to the logged digits, which checks the new script against the old run.
- Limits: one test year, the bootstrap resamples weeks of one calibration fit (the calibration quantile is not re-drawn), post hoc ship rule unchanged.
Next: a fourth city after a licence check; the full-model width interval.

## Session 59, 2026-11-09: milestone 7h, which interval to ship per city (post hoc rule, no new data)

Why: sessions 54 to 58 left "decide the shipped prior per city" open. No feeds were pulled; this reads `results/prior_table3_cov_2024.json`.
Disclosure: the rule was written after seeing the numbers, so this is a decision, not a hypothesis test. Rule (`src/ship_decision.py`, 4 unit tests): among per-type baseline, three-key table and full model, all with the dequantised nonempty interval, ship the narrowest with 2024 coverage >= 0.77; widths within 1% tie toward the more readable model.
- Outcome: per-type baseline in Chicago a2i (cov 0.885, width 55.3 d), SF a2i (0.826, 32.6), SF i2c (0.844, 373.5), Austin a2i (0.823, 156.1); table in Austin i2c (0.836, 289.6, tied with the full model at 289.5). The readable per-type table already published (section 4.7) is the interval to ship in four of five sets; the boosted gain is in pinball loss, not a tighter calibrated interval.
- Paper: new 4.7e; 4.7d moved before section 5 (it sat after section 7); stale "not run on the feeds" sentences in 4.7c and the to-do list updated.
- Limits: one test year, 2 seeds, no width bootstrap, over-coverage 0.82 to 0.89 means safe not tight.
Next: width intervals by bootstrap over weeks for the per-type baseline vs table in Austin i2c; a fourth city after a licence check.


## Session 58, 2026-11-09: milestone 7g, rerun of the coverage run with `cqr_interval_nonempty` (prediction from session 56: refuted in part)

Why: session 56 wired the fix in and left the rerun for a network that reaches the feeds. This time all three hosts answered. A first pull died on an HTTP 503 after four retries; `permits.fetch` now retries 8 times with backoff capped at 60 s. Fresh pull 2026-11-09 (manifest refreshed: Chicago 852,598, SF 1,298,097, Austin 2,384,446 rows), `python3 src/prior_table3_cov.py DIR --test-year 2024 --seeds 2`, results in `results/prior_table3_cov_2024.json` (now with the third arm).
Prediction (session 56, written before the run): `dequantised_nonempty` within 3 points of 80% in at least 4 of 5 sets, and no cell more than 1 point below its raw-interval coverage.

### Outcome (coverage, 2024 test year; raw / dequantised / dequantised_nonempty)
- The fix does what session 55 diagnosed. The collapsed cells recover: full model Chicago a2i 0.862 / 0.558 / **0.861**; full SF a2i 0.891 / 0.343 / **0.890**; table Austin a2i 0.839 / 0.765 / **0.825**; full Austin a2i 0.813 / 0.783 / **0.805**. The other 11 cells are identical to the dequantised arm.
- **Part 1 refuted.** Within 77 to 83%: table 2 of 5 sets (Chicago a2i 0.825, Austin a2i 0.825; the other three are 0.834 to 0.837), full model 3 of 5 (SF i2c 0.829, Austin a2i 0.805, Austin i2c 0.808; Chicago and SF a2i over-cover at 0.861 and 0.890). Neither reaches 4. The misses are over-coverage, the safe direction.
- **Part 2 refuted narrowly.** The worst cell is table Austin a2i, 1.4 points under its raw 0.839 (0.825); the other three collapsing cells are within 0.9 points of raw. Nothing is near the earlier 30 to 55 point losses.
- Reading: `cqr_interval_nonempty` makes the dequantised interval safe to use (no cell below 0.80 by more than 0.5 points, versus 0.343 before), so session 19's jitter is no longer excluded from claims. It does not tighten Chicago or SF a2i, whose full-model intervals stay conservative. For the shipped prior the table median plus the per-type baseline interval for Chicago (session 54's reading) stands.
- Limits: one test year, 2 seeds, no bootstrap on coverage (n_test large, binomial error under 0.5 points), prediction's "sets" read per model since it did not say which.
Next: decide the shipped prior per city from these coverages and put the choice in `paper/` section 4.7.

## Session 57, 2026-11-09: paper catch-up for milestones 7c to 7g (no data run: feed hosts refused by the proxy; no pandas)

Why: the paper stopped at 4.7b while sessions 51 to 56 had results in the log only. Probe: `curl` to the Chicago, SF and Austin hosts returned code 000 again, so **no number in `results/` changed and nothing new is claimed**.
Done: `paper/paper.md` section 4.7c reports H7 (refuted), H9 (marked post hoc, as the log says) and H10 (refuted) and the session 55 dequantisation diagnosis, with the figures checked against `results/prior_table3_cov_2024.json`; section 7 item 5 updated. The session 56 `dequantised_nonempty` arm is described as unrun.
Next: unchanged from session 56: `python3 src/prior_table3_cov.py DIR --test-year 2024 --seeds 2` where the feeds are reachable, against the prediction written there.

## Session 56, 2026-11-08: milestone 7g (part), nonempty interval wired into the coverage run (no data run: feed hosts refused by the proxy)

Why: session 55 built `cqr_interval_nonempty` but left the rerun of `prior_table3_cov.py` for a session with the feeds. This session's probe was refused (CONNECT 403 on all four data hosts; no pandas/lightgbm installed either), so **no number in `results/` changed and no coverage figure for the fix is claimed**.
Done: `src/prior_table3_cov.py` `interval_stats` now reports a third arm, `dequantised_nonempty` (same jittered scores, `cqr_interval_nonempty`), beside `plain` and `dequantised`. `py_compile` passes; the 14 conformal tests pass (the function is unit tested, session 55); the script itself was not run, as it needs pandas and the feeds.
Prediction for the rerun (written before it runs): `dequantised_nonempty` coverage is within 3 points of 80% in at least 4 of 5 sets, and no cell falls more than 1 point below its raw-interval coverage. Refuted if the 4 collapsing cells (Chicago and SF a2i full model, Austin a2i table and full model) stay more than 3 points under raw.
Next: `python3 src/prior_table3_cov.py DIR --test-year 2024 --seeds 2` on a network that reaches the feeds.

## Session 55, 2026-11-08: milestone 7g, why the dequantised interval collapsed in coverage (diagnosis from saved results; no new data run)

Why: session 54 left "investigate the dequantisation collapse" open. No predictions were written first; this is a post hoc reading of `results/prior_table3_cov_2024.json` (`src/dequant_diag.py`, output `results/dequant_diag.txt`) plus a mechanism I checked by hand on toy rows.
- **Pattern:** the dequantised variant loses coverage against the raw interval in exactly the 4 of 15 model cells where its qhat is negative (-0.09 to -0.33 days: full model Chicago a2i 0.862 raw to 0.558, full SF a2i 0.891 to 0.343, table Austin a2i 0.839 to 0.765, full Austin a2i 0.813 to 0.783). In the 11 cells with qhat >= 0 coverage never fell (minimum change +0.000).
- **Mechanism (hypothesis, consistent with the table, not yet confirmed on the feeds):** with qhat < 0 `cqr_interval` raises the lower end to -qhat and lowers the upper end by |qhat|. A same-day row has lo = hi = 0 and y = 0, so the interval becomes [0.14, -0.14] and covers nothing; jitter makes qhat a small non-zero negative number where plain CQR pinned it at exactly 0. Chicago and SF a2i are the zero-inflated cells, which fits.
- Change: `conformal.cqr_interval_nonempty` leaves a lower end already at the floor alone when narrowing and keeps hi >= lo; two unit tests (the toy row above is covered by the new function and missed by the old one; for qhat >= 0 the two agree). All 14 conformal tests pass.
- Not done: re-running milestone 7f with the new interval needs the permit feeds, pandas and lightgbm, none of which this session had. Until that is run, no coverage figure for the fix is claimed.
- Next: rerun `prior_table3_cov.py` with `cqr_interval_nonempty` for the dequantised arm; then decide the shipped prior per city.

## Session 54, 2026-11-08: milestone 7f, do conformalised table intervals hold 80% coverage? (H10, planned before running)

Why: session 53's three-key table (type x work class x cost bucket) keeps most of the boosted pinball gain at q0.1/q0.5/q0.9, but its intervals were never checked, and a readable prior is only shippable if its 80% interval means 80%. `src/prior_table3_cov.py` builds the table on train rows only (<= 2022), takes CQR scores of its [q10, q90] interval on the calibration year (2023), widens by the conformal quantile (session 19's dequantised variant is reported beside the plain one), and scores coverage and mean width on test year 2024. Same recipe on the per-type baseline and on the full LightGBM model (2 seeds; its early stopping sees the calibration year, as in session 8). Fresh pulls.
**H10 (before running):** the conformalised table interval covers within 3 points of 80% in at least 4 of the 5 city/target sets, and its mean width is no more than 1.25x the conformalised full model's in at least 3 of 5. **Refuted if** coverage is outside the band in 2 or more sets. Prior from H2 (session 8): Chicago and SF a2i probably over-cover because same-day ties pin the quantile at 0, so I expect the plain variant to fail there and the dequantised one to pass.

### Outcome (`results/prior_table3_cov_2024.json`; test year 2024; feeds pulled 2026-11-08; 2 seeds)
Conformalised 80% interval, coverage / mean width in days, plain CQR (Chicago a2i / SF a2i / SF i2c / Austin a2i / Austin i2c):
- table (type x work class x cost bucket): 0.832 / 0.834 / 0.842 / 0.839 / 0.842; widths 118.0 / 41.5 / 399.9 / 160.9 / 290.2
- per-type baseline: 0.885 / 0.826 / 0.857 / 0.823 / 0.845; widths 54.9 / 31.6 / 374.4 / 155.3 / 325.1
- full LightGBM: 0.862 / 0.891 / 0.833 / 0.813 / 0.811; widths 67.0 / 61.7 / 404.2 / 170.4 / 290.3
- Dequantised variant, table: 0.825 / 0.834 / 0.837 / 0.765 / 0.836.
- **H10 refuted on coverage.** The 77 to 83% band holds in 0 of 5 sets with plain CQR (all over-cover by 3.2 to 4.2 points) and in 1 of 5 dequantised. The width half held: the table is within 1.25x the full model's width in 4 of 5 sets (ratios 1.76 Chicago, 0.67 SF a2i, 0.99, 0.94, 1.00). Over-coverage is the safe direction, but it means the interval is not tight.
- **Prior failed.** I expected dequantisation to fix the ties; for the table it did not (0.837 SF i2c, 0.765 Austin a2i). For the full model the dequantised variant collapsed in Chicago and SF a2i (0.558, 0.343 against 0.862, 0.891 plain), so session 19's jitter is unsafe there and is not used for any claim here. I did not investigate why.
- Reading: the table is a usable prior at the median and its interval is conservative, but Chicago a2i's table interval is 1.76x as wide as the full model's (118 vs 67 days) and 2.1x the baseline's, so for Chicago the per-type baseline interval is the better shipped interval.
- Limits: one test year, 2 seeds, one bucket scheme, no bootstrap on coverage (n_test is large, so the binomial error is under 0.5 points), table built on train only (<= 2022), not train + calibration as in session 53's pinball shares.
- Next: decide the shipped prior per city (table median, baseline interval for Chicago) and investigate the dequantisation collapse.

## Session 53, 2026-11-08: milestone 7e, an empirical type x work class x cost-bucket table (H9)

Why: session 52's ladder said type + work class + cost carries most of the boosted gain, but as refit models on a continuous cost. This builds the readable version, an empirical quantile table (`src/prior_table3.py`, tests in `tests/test_prior_table3.py`) on train + calibration rows, cells under 30 rows backing off to type x work class, then type, then the city. Same harness split, test year 2024, 2 seeds for the full model, fresh pulls (manifest refreshed).
**H9, disclosure:** I did not write the hypothesis into this log before running. The reading below applies session 52's H8 threshold after the fact: the table keeps at least 50% of the full model's mean pinball gain over the per-type baseline in at least 3 of 5 sets. Treat the verdict as post hoc.

### Outcome (`results/prior_table3_2024.json`)
Mean share of the full model's gain kept (Chicago a2i / SF a2i / SF i2c / Austin a2i / Austin i2c):
- type x cost bucket: 0.24 / 0.59 / 0.35 / 0.17 / 0.11
- type x work class: 0.27 / 0.02 / 0.00 / 0.41 / 0.76
- type x work class x cost bucket: **0.80 / 0.59 / 0.35 / 0.67 / 0.87**
- The three-key table reaches 50% in 4 of 5 sets (threshold met). It is the first readable table here to keep most of the gain in Chicago and Austin.
- SF has no work class field (the feed maps it to none), so its three-key table equals the type x bucket table: same share, 0.59 and 0.35. SF i2c stays below 50%.
- Austin a2i q0.1 and q0.5 keep 0.45 and 0.68 and q0.9 0.88; Austin i2c 0.75 to 0.96.
- Caveats: Chicago's 0.80 is q0.5 only (the full model has no gain over the baseline at q0.1 and q0.9, so those shares are undefined, as in session 51). Austin's three-key table has about 195 cells, so it is a lookup, not a short chart. One test year, 2 seeds, one bucket scheme, no intervals on the shares. Coverage of intervals from the table was not checked.
- Next: test the table's interval coverage on 2024 (conformalise it), and decide whether a Chicago and Austin table can ship to `ventures/`.

## Session 52, 2026-11-08: milestone 7d, which table dimensions carry the boosted gain? (H8, planned before running)

Why: session 51 (H7, key-only refit) also failed, and its next step was to add another key; this ladder answers which. Session 50 refuted the flattening of the boosted model to a type x cost-bucket table (H6) and left "flatten differently" open. A quantile model on type and cost bucket alone is just the empirical lookup (already tried), so the useful question is which extra dimension a readable table needs. `src/prior_ladder.py` refits the same LightGBM quantile models on nested feature subsets (type; +cost; +work class; +description length; +area; all seven) and reports the share of the full model's mean pinball gain over the per-type baseline that each subset keeps (mean over q10/q50/q90; harness split, test year 2024, 2 seeds, fresh pulls).
**H8 (before running):** type + cost + work class (a three-dimension table) keeps at least 50% of the full model's gain in at least 3 of the 5 city/target sets; type alone keeps under 25% in at least 3 of 5. **Refuted if** type + cost + work class keeps at least 50% in 2 or fewer sets. Secondary prediction: description length is the single step that adds the most share in Austin a2i (session 50's note that gain comes from description length).

### Outcome (`results/prior_ladder_2024.json`; test year 2024; feeds pulled 2026-11-08; 2 seeds)
Share of the full model's mean pinball gain over the per-type baseline kept by each subset (Chicago a2i / SF a2i / SF i2c / Austin a2i / Austin i2c):
- type only: 0.00 / 0.16 / -0.28 / 0.01 / 0.02
- + log cost: 0.23 / 0.59 / 0.87 / 0.20 / 0.11
- + work class: 0.69 / 0.59 / 0.87 / 0.62 / 0.85
- + description length: 0.94 / 0.99 / 0.98 / 0.93 / 0.89
- + area: 0.97 / 1.03 / 1.08 / 1.02 / 1.00 (month and weekday add nothing visible; all = 1 by definition)
- **H8 held.** Type + cost + work class keeps at least 50% in 5 of 5 sets (needed 3); type alone keeps under 25% in 5 of 5 (needed 3).
- **Secondary prediction failed.** In Austin a2i the largest single step is work class (+0.42), not description length (+0.31).
- Reading: session 50's table lacked work class, which carries most of the gain; description length then adds 0.04 to 0.37. A readable table should be type x work class x cost bucket. Caveat: these are refit models on a continuous log cost, not tables; whether a table of those three dimensions keeps the share is untested, and cells get thin (min 30 rows).
- Limits: one test year, 2 seeds, one feature order (greedy, not a Shapley split, so step sizes depend on the order), no intervals on the shares.
- Next: build the type x work class x cost-bucket empirical table (with the shrinkage of session 50's fallbacks) and test H9 against the share these models keep.

## Session 51, 2026-11-08: milestone 7c, quantile model refit on permit type x cost bucket only (H7, planned before running)

Why: session 50 (H6) flattened the full boosted model by cell medians and kept almost none of the gain. This refits a LightGBM quantile model whose only inputs are the two table keys (`src/prior_refit.py`), so each cell's value is the model's own prediction and no flattening step is left to blame. Harness split, test year 2024, 2 seeds, fresh pulls. Austin's host was unreachable from this session (curl code 000), so only three of the five sets can run: Chicago a2i, SF a2i, SF i2c.
**H7 (before running):** the key-only refit keeps at least 50% of the full boosted model's mean pinball gain over the per-type baseline (mean over q10/q50/q90) in at least 2 of the 3 testable sets. **Refuted if** it keeps under 50% in 2 or more. Secondary prediction: it beats the empirical type x bucket lookup in at least 2 of 3 sets.
### Outcome (`results/prior_refit_eval_2024.json`; test year 2024; feeds pulled 2026-11-08; Chicago and SF only)
- **H7 refuted.** Share of the full boosted model's mean pinball gain kept by the key-only refit: Chicago a2i 0.16, SF a2i 0.63, SF i2c 0.42. One of three sets reaches 50%; two fail (refuted at 2 or more). Chicago's figure averages q0.5 only: the full boosted model is worse than the baseline at q0.1 and q0.9 there (2.70 vs 2.69; 11.72 vs 11.08), so the mean-of-shares there is not a clean number.
- **Secondary prediction held, by a hair.** Mean pinball over the three quantiles, refit vs empirical lookup: Chicago 10.44 vs 10.46, SF a2i 8.99 vs 9.12, SF i2c 34.96 vs 35.03. The refit is ahead in 3 of 3 but by under 1.5%; that is no evidence of smoothing beyond noise (one split, 2 seeds).
- Reading: removing the flattening step (session 50's suspect) did not rescue the table. SF a2i keeps most of the gain at q0.5 and q0.9 (0.78, 0.82); SF i2c keeps 0.34 to 0.56. Whatever the full model gets beyond type and cost (description length, area, month) is not in a two-key table. In Chicago a2i q0.9 the type x bucket table is worse than the per-type baseline (16.2 vs 11.1), as the empirical lookup was in session 50, so cost buckets hurt there.
- Decision: still no boosted table published; the empirical per-type prior stays the shipped artefact. Neither table-flattening route (median of predictions, key-only refit) works, so the remaining option is shipping the model with a small evaluator, or adding the next most useful key (area or month) to the table.
- Limits: Austin not run (host unreachable from this session); one test year; 2 seeds; one bucket scheme; no bootstrap intervals.
- Next: add one more key (SF and Chicago area, or application month) and see how the share grows, or the JS evaluator route.

## Session 50, 2026-11-08: milestone 7b, a model-based permit-duration prior as a readable table (H6, planned before running)

Why: paper section 7 item 5 and sessions 48 to 49 list "a model-based (boosted quantile) version for `ventures/`" as the one open deliverable. A model file is not something a calculator can ship; a table is. So the question is how much of the boosted gain survives when the model is flattened to a permit-type x cost-bucket lookup.
Design (`src/prior_boosted.py`, tests in `tests/test_prior_boosted.py`): cost buckets unknown, <1k, 1k-10k, 10k-100k, 100k-1M, >=1M dollars; each cell value is the median of the 2-seed boosted q10/q50/q90 predictions over the calibration-year permits in the cell (cells under 30 rows fall back to the type, then the city). Harness split, test year 2024 (train <= 2022, calibration 2023), five city/target sets, fresh pulls. Compared with the harness per-type baseline, an empirical type x bucket lookup on the same train + calibration rows, and the full boosted model. A second split (test year 2025, partial year) supplies the table that is published (calibration 2024) and a second out-of-time check.
**H6 (before running):** the boosted-grid lookup keeps at least 50% of the full boosted model's pinball gain over the per-type baseline (mean over q10/q50/q90) in at least 4 of the 5 city/target sets. **Refuted if** it keeps under 50% in 2 or more sets. Secondary prediction: the grid beats the empirical type x bucket lookup in at least 3 of 5 sets (smoothing helps where cells are thin).

### Outcome (`results/prior_boosted_eval_2024.json`; test year 2024; feeds pulled 2026-11-08)
- **H6 refuted.** Share of the full boosted model's mean pinball gain kept by the boosted-grid lookup: Chicago a2i 0.04, SF a2i 0.83, SF i2c -0.03, Austin a2i -0.03, Austin i2c -0.10. Only 1 of 5 sets reaches 50% (needed 4; refuted at 2 or more failing).
- **Secondary prediction failed.** The boosted grid beats the empirical type x cost-bucket lookup in 2 of 5 sets (Chicago, SF a2i), not 3.
- Why, as far as the numbers show: the median over a cell of the model's q90 predictions is not the cell's q90 (Austin a2i q0.9: grid 42.6 against baseline 37.1 and full model 23.6), and most of the boosted gain at q0.5 comes from description length, area and month, which a type x cost table drops. The empirical lookup is also not safe: Chicago q0.9 is 16.4 against 11.1 for the baseline.
- Decision: the boosted table is **not published**; a prior that keeps none of the gain would mislead a calculator. The empirical per-type prior (4.7) stays the shipped artefact. `src/prior_boosted.py` and the eval file stay as the negative result.
- Limits: one flattening rule (median of predictions), one bucket scheme, 2 seeds, test year 2024 only; the 2025 check was not run because nothing was to be published.
- Next: flatten differently (refit a quantile model on type and cost bucket only, or ship the LightGBM model with a lookup of its inputs), or publish the model file with a small JS evaluator.

## Session 49b, 2026-11-07: independent refit of the same cells (replication note; not landed as results)

A second run refit the 2022 and 2023 paired cells at the same time as session 49 above (3 seeds, same code, feeds pulled the same day) and kept its numbers out of `results/` once the first landed. Its bootstrap-Holm counts: 2022 uncorrected 10, Holm 9; 2023 uncorrected 12, Holm 8; pooled 45 cells uncorrected 32, Holm 23, BH 31. Session 49 above has pooled 33, 22, 31. So two refits of identical code on identical data differ by one cell in several counts: the cell counts carry about one cell of refit noise, and any claim resting on a single borderline cell (SF a2i q0.5) is not stable. My prediction (pooled Holm 24 to 26) failed by one. Lesson: re-run the programme `CLAIM CHECK` before a long job.

## Session 49, 2026-11-07: milestone 27 (part), bootstrap p-values for 2022 and 2023 and the pooled 45-cell Holm (planned before running)

Why: session 47 saved bootstrap p for 2024 only; the pooled 45-cell Holm of session 46 still rests on the normal approximation.
Plan: rerun `paired_neural_boosted.py` for 2022 and 2023 (3 seeds, ten city/target runs, fresh pulls; now carrying `p_boot`), then `paired_boot_table.py` for each year and `all`.
**Prediction (before running):** pooled over 45 cells, bootstrap Holm keeps within +-3 of the normal-approximation count of 24 (BH within +-3 of 29); the cells lost in session 46 (SF a2i q0.5 2024 etc.) stay lost or borderline.

**Outcome: prediction held.** Pooled over 45 cells: uncorrected 33, Holm(boot) 22, BH(boot) 31 (normal approximation on the same files: 33, 24, 29), within the +-3 band. Per year (`results/paired_boot_p_<year>.txt`): 2022 10 uncorrected, Holm 8; 2023 13 uncorrected, Holm 9; 2024 10 and 10. SF a2i q0.5 2024 loses significance under pooled Holm (p_boot 0.006). One run-environment lesson: running several runs at once on 4 cores took over 40 CPU-minutes without finishing; one at a time takes 1 to 3 minutes each.
Caveat: the refit on fresh pulls changed the 2022 and 2023 splits (2022 now 5 worse / 5 better / 5 tie; 2023 now 7 / 6 / 2, against 6/5/4 and 6/5/4 before), so single-cell significance is not stable under refit; the earlier session summaries describe earlier fits.
Limits: percentile-bootstrap sign p; cells share data; one untuned MLP.
Next: publish boosted quantile tables for `ventures/`.

## Session 48, 2026-11-07: paper catch-up (no data run: all three feed hosts refused by the proxy, CONNECT 403)

Why: session 47 added bootstrap p-values for 2024 but left the paper without them. No hypothesis (a writing step); no number in `results/` changed.
Done: paper 4.6a now reports the 2024 bootstrap-p multiplicity result (10 of 15 under uncorrected, Holm and BH, same cells as the normal approximation; SF a2i q0.5 closest at p 0.006) and the floor of 0.001. Fixed a stale "multiplicity covers 2024 only" limit.
Next: rerun 2022 and 2023 with `p_boot` when a network reaches the feeds, then pool the 45 cells on bootstrap p; publish boosted quantile tables for `ventures/`.

## Session 47, 2026-11-07: milestone 27 (part), bootstrap p-values saved for the 2024 paired cells (planned before running)

Why: sessions 43 and 46 corrected for multiplicity with a normal approximation to each interval. This replaces it for 2024 with p computed from the week-block bootstrap draws themselves.
**Prediction (before running):** Holm on the bootstrap p keeps the same 10 of 15 cells as the normal approximation; the cell nearest the line stays SF a2i q0.5.
Done: `boot_pvalue` in `src/paired_neural_boosted.py` (same seed and resampling as the stored interval; p = 2 min(tail) with +1 smoothing, so resolution is 0.001 at 2000 draws), test `tests/test_paired_boot.py`, `src/paired_boot_table.py`, `results/paired_boot_p_2024.txt`. Fresh pulls today; `paired_*_2024.json` re-run (3 seeds, same code), now carrying `p_boot`.
Outcome: **prediction held.** Uncorrected 10, Holm 10, BH 10 of 15, identical cells to the normal approximation. SF a2i q0.5 has p_boot 0.006 (normal 0.0023), the closest to the line; SF a2i q0.1 stays non-significant (0.085). The normal approximation's tiny values (1e-58) were not literal; the bootstrap floors at 0.001. Point estimates match session 42's (e.g. SF a2i q0.9 +5.74% vs +5.77%) within refit noise.
Limits: 2024 only (2022 and 2023 not rerun); percentile-bootstrap sign p, not studentised; floor 0.001 limits Holm resolution only if more than 50 cells are pooled; draws themselves are not stored, only p.
Next: rerun 2022 and 2023 with p_boot and replace the pooled 45-cell Holm; publish boosted quantile tables for `ventures/`.

## Session 46, 2026-11-07: milestone 27 (part), Holm/BH on 2022 and 2023 and on all 45 paired cells (committed results only, no pull)

Why: session 45 left 2022 and 2023 with uncorrected intervals. No hypothesis was logged before computing (the script change was small and I ran it straight away); stated here so the record is honest, not as a pre-registration. The expectation I held was that correction would remove a few cells in the weaker years.
Done: `src/paired_multiplicity.py` takes a year or `all` (2024 output unchanged byte for byte), new tests, `results/paired_multiplicity_{2022,2023,all}.txt`, paper 4.6a. Same normal approximation to each stored interval as session 43.
Outcome: 2022 uncorrected 11, Holm 9, BH 11 of 15. 2023 uncorrected 11, Holm 8, BH 8 of 15. Pooled over 45 cells: uncorrected 32, Holm 24, BH 29. So 2024 was the cleanest year (all 10 survive); in 2022 and 2023 two to three of the "significant" cells are lost under Holm. Lost under pooled Holm: SF a2i q0.5 2024 (+1.11%), SF i2c q0.9 2022, SF a2i q0.1 and q0.9 2022, Austin 2023 a2i q0.9 and i2c q0.1, Chicago 2023 a2i q0.1 and q0.9 (several survive BH).
Limits: approximate p (normal approximation, draws not saved); pooling treats 45 cells as one family although they share data across quantiles and years; the counts are therefore descriptive.
Next: save bootstrap draws so p comes from the bootstrap; publish boosted quantile tables for `ventures/`.

## Session 45, 2026-11-07: milestone 27 (part), per-permit paired bootstrap on neural minus boosted for test year 2022 (planned before running)

Why: sessions 42 and 44 ran the paired test for 2024 and 2023; 2022 was the open year. Feeds reachable (Chicago 852,489 rows, SF 1,298,001, Austin 2,384,199, pulled today).
Plan: `src/paired_neural_boosted.py --test-year 2022`, 3 seeds, five city/target pairs, same code; new `src/summarise_paired.py` (+ test) writes the summary file (it reproduces the 2023 summary byte for byte).
**Prediction (before reading any 2022 cell):** 2022 follows the 2023 and 2024 pattern at the edges but favours neural more, since session 38 had neural ahead in 9 of 15 cells in 2022 (mean -0.42%): neural significantly better in at least 4 of 15 cells and significantly worse in at most 5; SF i2c worse at all three quantiles for the third year running; Chicago a2i q0.9 significantly better for neural for the third year running.

### Outcome (`results/paired_summary_2022.txt`; 15 cells)
- **Prediction half-failed.** Neural significantly better in 5 of 15 (predicted at least 4: held), significantly worse in 6 (predicted at most 5: failed), indistinguishable in 4. SF i2c is worse at all three quantiles (+0.43, +0.89, +0.81%): held. Chicago a2i q0.9 is better by point estimate (-0.96%) but its interval (-2.44 to +0.77) includes 0: failed.
- Three-year view: SF i2c is worse at all three quantiles in 2022, 2023 and 2024 (9 of 9 cells), the only stable loss. Significantly worse / better counts by year: 2022 6/5, 2023 6/5, 2024 8/2. Chicago q0.9 is better by point estimate in all three years but significant in two. Austin i2c flips sign by quantile in 2022 (q0.1 +2.31%, q0.9 -5.57%).
- Limits: 15 uncorrected intervals (multiplicity check exists only for 2024); one untuned MLP; week-block bootstrap treats weeks as exchangeable; `results/manifest.json` refreshed by today's pull, so boosted numbers differ slightly from older committed runs.
- Next: Holm/BH for 2022 and 2023 once draws are saved; publish boosted quantile tables for `ventures/`.

## Session 44, 2026-11-06: milestone 27 (part), per-permit paired bootstrap on neural minus boosted for test year 2023 (planned before running)

Why: session 42 ran the paired test for 2024 only (neural significantly worse in 8 of 15 cells, better in 2). Cell-level numbers for 2023 (session 38) showed neural within a few percent either side. Feeds are reachable again, so 2023 can be tested per permit.
Plan: `src/paired_neural_boosted.py --test-year 2023`, 3 seeds, five city/target pairs, same code as session 42, fresh pulls.
**Prediction (before running):** the 2024 pattern is not stable: neural is significantly worse in at least 2 but at most 6 of 15 cells, SF i2c is again worse at all three quantiles (session 38 had +0.7 to +2.0% there), and Chicago q0.9 is again significantly better for neural.

### Outcome (`results/paired_summary_2023.txt`; 2023, 15 cells, feeds pulled today: Chicago 852,489 rows, SF 1,298,001, Austin 2,384,199)
- **Prediction held.** Neural significantly worse in 6 of 15 (inside the 2 to 6 band, at its edge), significantly better in 5, indistinguishable in 4. SF i2c is worse at all three quantiles (+1.87, +2.03, +1.67%); Chicago a2i q0.9 is significantly better for neural (-1.27%).
- Cross-year: only SF i2c (worse) and Chicago q0.9 (better) repeat from 2024. The 2024 SF a2i q0.9 (+5.77%) and Austin a2i q0.1 (+2.73%) deficits do not persist in 2023 (+1.06% and +0.02%, intervals include 0). Austin a2i q0.5 and q0.9 favour neural in 2023 (-1.86, -3.85%) but not in 2024. So most neural-versus-boosted differences are year-specific.
- Limits: 15 uncorrected intervals; one untuned MLP; Austin a2i q0.9 interval is wide (-8.5 to -1.0) so its size is uncertain; 2022 not rerun; the week-block bootstrap assumes exchangeable weeks.
- Next: 2022 for the same test; publish boosted quantile tables for `ventures/`.

## Session 43, 2026-11-06: milestone 27 (part), multiplicity correction on the paired cells (committed results only; all three feed hosts refused again, CONNECT 403)

Hypothesis (written before computing): after Holm correction at 0.05 over the 15 paired cells, at most 6 of session 42's 8 "significantly worse" cells survive, because several intervals sit near 0 (SF a2i q0.1 and q0.5, Austin i2c q0.5).
Done: `src/paired_multiplicity.py` (+ tests with hand counts for Holm and BH), `results/paired_multiplicity_2024.txt`, paper 4.6a. Approximate p from a normal approximation to each stored interval, since bootstrap draws were not saved.
Outcome: **hypothesis refuted.** Holm and BH both keep all 10 cells whose interval excludes 0 (8 worse, 2 better). The nearest to the line is SF a2i q0.5 (p about 0.006). The near-zero cells I expected to fail (SF a2i q0.1, p about 0.08; Austin i2c q0.5) were already non-significant, not borderline-significant.
Limits: p-values are approximate (normal approximation, small p's like 1e-58 are not literal); 2024 only; does not address dependence between weeks or between quantile levels of one city.
Next: rerun the paired bootstrap for 2022 and 2023 on a network that reaches the feeds, saving the draws so p-values come from the bootstrap itself.

## Session 42, 2026-11-06: milestone 27 (part), per-permit paired bootstrap on neural minus boosted (planned before running)

Why: session 40 found a 2024 neural deficit (mean +1.14%, sign p 0.035) from cell-level numbers only; cells share data, so that p is descriptive. The feeds are reachable again (Chicago, SF, Austin all HTTP 200 this session), so the per-permit paired test is possible.
Plan: `src/paired_neural_boosted.py` refits boosted (3 seeds) and the MLP (3 seeds) on the same split, keeps per-row seed-averaged pinball loss, and bootstraps the paired difference by test week, for the five city/target pairs in test year 2024, then 2023 if time allows.
**Prediction (before running):** the paired intervals for neural minus boosted include 0 in at least 10 of 15 cells (2024), but the point estimate is positive (neural worse) in at least 10 of 15; no cell has neural significantly better.

### Outcome (`results/paired_summary_2024.txt`; 2024 only, 15 cells, feeds pulled today)
- **Prediction mostly failed.** Intervals include 0 in only 5 of 15 cells (predicted at least 10); the point estimate has neural worse in 11 of 15 (predicted at least 10: held); neural is significantly better in 2 cells (Chicago q0.5 -0.46%, q0.9 -3.30%), where I predicted none.
- Neural is significantly worse in 8 cells, mostly SF (q0.9 +5.77%, SF i2c all three quantiles +1.3 to +2.1%) and Austin a2i q0.1 (+2.73%) and i2c q0.9 (+1.36%). So "tie" from the cell-level view hides city-specific differences: the net near-zero mean comes from Chicago's gain offsetting SF and Austin losses.
- Limits: 2024 only; one untuned MLP and a boosted model with fixed settings; 3 seeds each averaged per row; week-block bootstrap treats weeks as exchangeable; 15 intervals with no multiplicity correction, so a few of the 8 could be chance; the feeds were re-pulled (counts in `results/manifest.json`), so boosted numbers differ slightly from earlier committed ones.
- Next: the same for 2022 and 2023; publish boosted quantile tables for `ventures/`.

## Session 41, 2026-11-06: paper housekeeping (no data run: all three feed hosts refused by the proxy)

Probed data.cityofchicago.org, data.sf.gov, data.sfgov.org and data.austintexas.gov: every one returned CONNECT 403, so no pull and **no number changed**.
Done: section 4.7 moved after 4.5 so the results sections run in order; to-do item 4 was stale (H1 already runs over 2022 to 2024) and now names the open item, the per-permit paired bootstrap on neural minus boosted, which needs saved predictions and fresh pulls.
Next: that bootstrap on a network that reaches the feeds; boosted quantile tables for `ventures/`.

## Session 40, 2026-11-06: milestone 27 (part), sign test and bootstrap on the neural-versus-boosted cells

Hypothesis (before running): the mean difference over 45 cells has a 95% bootstrap interval containing 0, and the 2024 deficit (neural ahead in 3 of 15) is not separable from chance at p < 0.05.
Done: `src/neural_sign_test.py`, `tests/test_neural_sign_test.py`, `results/neural_sign_test.txt` (committed results only, no pull).
Outcome: all years mean +0.22% (95% bootstrap -0.30 to +0.75; sign p 0.23), so the overall tie holds. 2022 mean -0.42%, 2023 -0.06% (both intervals contain 0). **Second half of the hypothesis failed:** 2024 mean +1.14% (interval +0.21 to +2.13), neural ahead in 3 of 15, sign p 0.035. Neural is slightly but consistently worse in 2024.
Limits: cells share data across quantiles and years, so they are not independent and the p-values are descriptive; four looks, no multiplicity correction (0.035 would not survive one); this is not the per-permit paired bootstrap, which needs the saved predictions.
Next: per-permit paired bootstrap (needs numpy and fresh pulls); publish boosted tables for `ventures/`.

## Session 39, 2026-11-06: milestone 27 (part), three-year neural comparison written up from committed results

Hypothesis (before the aggregation): across all 45 cells (5 pairs x 3 quantiles x 2022-2024) the neural net is within 3% of boosted in at least 42, and the mean relative difference is within +/-1%.
Done: no new pull (no data run needed). `src/summarise_neural.py` + `tests/test_summarise_neural.py`, `results/neural_vs_boosted_table.md`, paper section 4.6a, limitations line updated.
Outcome: 43 of 45 within 3%, neural ahead in 18, mean +0.22%. Hypothesis holds. Per year within 3%: 14, 15, 14 of 15; neural ahead: 9, 6, 3 of 15 (2022 to 2024), a decline that is not tested and may be noise.
Limits: aggregation only, no bootstrap interval on the difference; one untuned architecture.
Next: publish boosted quantile tables for `ventures/`; a paired bootstrap on neural minus boosted.

## Session 38, 2026-11-06: milestone 27 (part), neural baseline over test years 2022 and 2023

Hypothesis (stated in the session 33 next-step, written into the log only after the run): the small embedding MLP stays within 3% of the boosted pinball in every cell in 2022 and 2023, as in 14 of 15 cells in 2024, and is not better than boosted.
Done: fresh pulls of all three feeds (Chicago 852,332, SF 1,297,940, Austin 2,383,942 rows; `results/manifest.json` refreshed), `src/neural.py` unchanged, 3 seeds, all five city/target pairs, Y = 2022 and 2023: `results/neural_*_2022.json`, `results/neural_*_2023.json`.
Outcome (neural pinball relative to boosted, % at q0.1/0.5/0.9; negative = neural better): 2022 Chicago a2i +0.4/+1.5/-1.0; SF a2i -1.3/-0.1/-0.9; SF i2c +0.7/+0.7/+0.2; Austin a2i -0.1/-2.9/-1.2; Austin i2c +2.7/-0.9/-4.3. 2023 Chicago a2i -0.3/+0.6/-1.3; SF a2i -2.1/+0.3/+1.2; SF i2c +1.2/+1.3/+2.0; Austin a2i +0.2/-2.0/-2.9; Austin i2c +1.4/+0.1/-0.8.
- Within 3%: 14 of 15 in 2022 (miss: Austin i2c q0.9, neural 4.3% better) and 15 of 15 in 2023. Over three years, 43 of 45 cells. The "within 3%" half holds.
- The "not better" half fails: neural is ahead in 15 of 30 cells here, mostly by under 3%. Read as a tie with boosted, not a loss; no claim that either family wins.
- Raw 80% coverage stays poor for the neural net where the target has many zeros (Chicago a2i 0.24 and 0.29, SF a2i 0.30 and 0.31; softplus outputs cannot hit y = 0) and 0.67 to 0.76 elsewhere.
Limits: one untuned architecture, 3 seeds, no bootstrap interval on the neural-versus-boosted difference, the within-3% band is a convention.
Next: publish boosted quantile tables for `ventures/`; paper section on the three-year neural comparison.

## Session 37, 2026-11-06: milestone 3 (part), H1 over test years 2022 and 2023

Hypothesis (written before the run): the boosted quantile model beats the per-city, per-type empirical-quantile baseline on pinball loss in at least 11 of the 15 city/target/quantile cells in each of test years 2022 and 2023, as it did in 13 of 15 in 2024 (Chicago a2i at q0.1 and q0.9 being the cells most likely to fail).
Done: fresh pulls of all three feeds (hosts reachable; Chicago 852,332 rows, SF 1,297,940, Austin 2,383,942), `src/boosted.py` with the harness split (train <= Y-2, calibrate Y-1, test Y), 3 seeds, for all five city/target pairs and Y = 2022, 2023: `results/boosted_*_2022.json`, `results/boosted_*_2023.json`.
Outcome: 15 of 15 cells in 2022, 14 of 15 in 2023 (the miss: Chicago a2i q0.1, +0.1%, a tie). Hypothesis holds. Pinball change against the baseline (negative = better) at q0.1/0.5/0.9: Chicago a2i 2022 -0.0/-10.0/-8.6, 2023 +0.1/-11.2/-5.9; SF a2i 2022 -2.4/-14.8/-30.8, 2023 -2.8/-13.8/-22.5; SF i2c 2022 -7.2/-13.6/-15.5, 2023 -6.4/-12.7/-13.0; Austin a2i 2022 -3.1/-20.3/-36.4, 2023 -3.5/-20.6/-32.8; Austin i2c 2022 -11.2/-20.0/-25.7, 2023 -9.2/-20.0/-26.1. The 2024 miss at Chicago a2i q0.9 (+6.5%) is the only q0.9 loss in three years, so it looks year-specific, not structural.
- Caveat: raw 80% interval coverage is 0.67 to 0.83 in 2022 and 0.73 to 0.83 in 2023 (Austin i2c lowest), under-covering where 2024 over-covered in Chicago and SF; the quantile models are not calibrated, which is what the conformal sections address.
Limits: 3 seeds (2024 files use their earlier seed count); one model family; Chicago is issued-only (survivorship); the gain over the baseline is on pinball, not on any decision.
Next: publish boosted quantile tables for `ventures/`; repeat the neural baseline over 2022 and 2023.

## Session 36, 2026-11-06: milestone 7 (part), prior written up in the paper

Data hosts (Chicago, SF, Austin) were refused by the proxy this session, so no new pull. Done from committed results only: `src/summarise_prior.py` writes `results/permit_prior_table.md` from `results/permit_prior.json`; paper section 4.7 reports the table, the per-type spread (per-type a2i medians 0 to 24 days Chicago, 0 to 533 SF, 15 to 182 Austin) and the two sessions' pre-registered hypotheses; to-do item 5 updated (Austin is in).
Limits: no new measurement; descriptive quantiles only.
Next: publish boosted quantile tables; multiple test years for H1 (needs the data hosts).

## Session 35, 2026-11-06: milestone 7 (part), Austin added to the permit-duration prior

Hypothesis (written before the pull): over 2022 to 2024 Austin's application-to-issue same-day share is below 20% (session 5 found 6% in 2024) and its issue-to-completion median is above 60 days (session 5: 2024 baseline median about 55 to 57 days, so this one could fail).
Plan: fresh Austin pull (host reachable this session), rerun `src/prior.py` over the three feeds' CSVs, extend `results/permit_prior.json`.
Done: fresh Austin pull (8 minutes, 221 MB CSV outside git), `src/prior.py` on Austin alone over 2022 to 2024, its two entries merged into `results/permit_prior.json` (Chicago and SF entries from session 34 unchanged).
Outcome: Austin a2i n=172,780, same-day 4.8%, q10/q50/q90 = 1/25/320 days (5 types, nothing folded); Austin i2c n=163,246, same-day 0.45%, 7/111/467 days (5 types). Both hypotheses hold (same-day 4.8% < 20%; i2c median 111 > 60).
Limits: descriptive empirical quantiles, no model; Austin's a2i q90 of 320 days is long-tailed and includes applications that were slow to be issued after review; Austin rows without an issue date are excluded from a2i; i2c window keyed on issue year.
Next: publish boosted quantile tables; multiple test years for H1.

## Session 34, 2026-11-06: milestone 7 (part), permit-duration prior data file

Hypothesis (before the run): over 2022 to 2024 the pooled median application-to-issue lag is 0 or 1 day in Chicago and SF and the SF issue-to-completion median is above 90 days.
Done: `src/prior.py` + `tests/test_prior.py` (hand-counted type-7 quantiles, small types folded, window filter); fresh Chicago and SF pulls; `results/permit_prior.json`. Austin's host was unreachable this session, so Austin is not in the file.
Outcome: Chicago a2i n=106,195, same-day 48%, q10/q50/q90 = 0/1/68 days (9 types); SF a2i n=69,869, same-day 52%, 0/0/95 (7 types, 10 rows in small types folded); SF i2c n=55,307, same-day 0.1%, 14/119/481 (6 types, 32 small-type rows). Hypothesis holds.
Limits: descriptive empirical quantiles, no model; Chicago is issued-only (survivorship); i2c window keyed on issue year; no Austin; the model-based prior (boosted) is not published yet.
Next: add Austin when reachable; publish the boosted quantile tables; multiple test years for H1.

## Session 33, 2026-11-05: milestone 27, neural quantile baseline on all five city/target pairs

Hypothesis: a small embedding MLP is within 3% of the boosted models' pinball at each level, and not better. (Held before the first run but not written in the log until after; Austin's two cells were run after seeing the other three, so the Austin part is not blind.)
Done: `src/neural.py` (imports `boosted.py`'s frame, features, bootstrap; torch CPU), `tests/test_neural.py` (monotone, non-negative, learns a planted type gap), fresh pulls of all three feeds, 3 seeds, test year 2024, `results/neural_*_2024.json`.
Outcome (neural pinball relative to committed boosted; positive = worse): Chicago a2i +0.6/0.0/-3.0%; SF a2i +0.9/+1.2/+5.9%; SF i2c +1.8/+2.6/+2.9%; Austin a2i +2.5/+0.1/+1.6%; Austin i2c -0.2/+0.3/-0.1% (q0.1/0.5/0.9). Within 3% in 14 of 15 cells (Chicago q0.9 is -2.97%); the one miss is SF a2i q0.9 (+5.9%). Neural is ahead only at Chicago q0.9, where boosted is itself worse than the baseline; the rest are ties or small losses, so the hypothesis holds except SF a2i q0.9.
- Caveats: raw neural 80% interval coverage is 0.30 (SF a2i) and 0.53 (Chicago a2i) because softplus outputs are strictly positive and miss every y = 0; same-day Brier slightly worse than boosted.
Limits: one architecture, untuned, 3 seeds, one test year.
Next: tune once (width, lr, same-day loss weight) or move to multiple test years for H1.

## Session 32, 2026-11-05: milestone 26, SF i2c with the H2g backtest rules (planned before running)

Plan: the session 27/29/31 grid and backtest on SF issue-to-completion (i2c), test years 2021 to 2024, one job at a time, 1 seed, then `python3 src/conformal_tau_backtest.py sf --i2c`. Pre-registered (as session 31): coverage in 77 to 83% in at least 2 of 3 test years (2022 to 2024) and width at least 15% below the fixed (0.1, 0.9) pair in at least 2 of 3. Prior 40%: SF i2c has almost no exact zeros, like Austin i2c, which failed both halves.
Done: fresh SF pull (1,297,940 rows per the live count; Chicago and Austin hosts were refused by the proxy this session, so only SF could run), `results/conformal_tau_drift_sf_i2c_{2021..2024}.json`, `results/conformal_tau_backtest_sf_i2c.txt`.
Outcome (1 seed, intervals over weeks only):
| year | chosen pair | test coverage [CI] | width (days) | narrower than (0.1, 0.9) |
|---|---|---|---|---|
| 2022 | (0.2, 0.75) | 0.818 [0.810, 0.826] | 370.3 | 12% |
| 2023 | (0.2, 0.75) | 0.830 [0.822, 0.837] | 343.0 | 17% |
| 2024 | (0.2, 0.65) | 0.857 [0.846, 0.867] | 293.6 | 28% |
- **Both halves of H2g hold as counted separately for SF i2c** (coverage inside 77 to 83% in 2 of 3 years; width 15% or more narrower in 2 of 3), unlike Austin i2c. Read strictly "in the same years", only 2023 passes both: 2022 is not narrow enough (12%) and 2024 over-covers (0.857), so the joint result is 1 of 3. I report the separate counts as the pre-registered rule and flag the joint one as the stricter reading.
- The width gain is real but the years that gain most (2024) are the ones that over-cover, i.e. the guard picks a narrow pair whose backtest-year coverage did not carry to the test year. Widths stay near 300 to 370 days at 80%: SF build time is only weakly predictable at the quantile level.
- Limits: 1 seed, 3 cells, SF only (Chicago has no i2c), the narrower-pair claim rests on the 2022 to 2024 backtest years only.
Next: paper section 4.2c gets SF i2c and the joint-versus-separate caveat; then the neural baseline.

## Session 31, 2026-11-05: milestone 25, Austin i2c with the H2g backtest rules (planned before running)

Plan: the same grid and backtest as sessions 27 and 29 on Austin i2c (issue to completion), test years 2021 to 2024, one job at a time, 1 seed, then `python3 src/conformal_tau_backtest.py austin --i2c` (the script now takes `--i2c`). Pre-registered: coverage in 77 to 83% in at least 2 of 3 test years (2022 to 2024) and width at least 15% below (0.1, 0.9) in at least 2 of 3. Prior 35%: i2c has few exact zeros, so a narrow pair should buy less than in Chicago, and the Austin a2i width half failed on the same logic.

Done: fresh Austin pull (2,383,942 rows; 2,185,057 completed; 3,533 negative build times dropped), `conformal_tau_drift_run.py --city austin --target i2c` for 2021 to 2024, one job at a time, 1 seed, `results/conformal_tau_drift_austin_i2c_{2021..2024}.json`; `results/conformal_tau_backtest_austin_i2c.txt`.
Outcome (1 seed):
| year | chosen pair | test coverage [CI] | width (days) | vs (0.1, 0.9) |
|---|---|---|---|---|
| 2022 | (0.1, 0.9) fallback | 0.786 [0.777, 0.795] | 307.8 | 0% |
| 2023 | (0.2, 0.75) | 0.842 [0.835, 0.849] | 283.6 | -6% |
| 2024 | (0.2, 0.65) | 0.835 [0.828, 0.842] | 237.6 | -18% |
- **H2g is refuted for Austin i2c on both halves**: coverage inside 77 to 83% in 1 of 3 years (2022), width 15% or more below the fixed pair in 1 of 3 (2024). The 2023 and 2024 picks over-cover by 3 to 4 points.
- Backtest-year coverage under the fixed pair ran 0.731, 0.786, 0.837, 0.819 for 2021 to 2024: 10 points of drift, as for Austin a2i. Widths are 240 to 310 days at 80%, so i2c is barely predictable at the quantile level and a narrower pair buys little.
- Summary over the three cities and both a2i/i2c cells now run: the width gain of a narrow pair is large only where the target is zero-inflated (Chicago, SF a2i); Austin a2i and i2c are not.
- Limits: 1 seed, 3 cells, loader still counts every Austin row as issued, 3,533 negative build times dropped; SF i2c not run under H2g.
Next: SF i2c under H2g, or the neural baseline.

## Session 30, 2026-11-05: paper section 4.2c gets Austin a2i (a writing step; no experiment, no result changed)

Re-ran `python3 src/conformal_tau_backtest.py austin` (reproduces session 29: inside 77 to 83% in 2 of 3, narrower by 15% in 1 of 3) and added the Austin paragraph and limits to `paper/paper.md` 4.2c; to-do item 2 now names only Austin i2c. Post: `docs/posts/2026-11-05-permit-intervals-austin-narrow-pairs.md`.
Next: Austin i2c with the H2g rules (one job at a time), or the neural baseline.

## Session 29, 2026-11-05: milestone 24, Austin a2i with the H2g backtest rules (one job at a time, 1 seed)

Plan (session 28, pre-registered): coverage in 77 to 83% in at least 2 of 3 test years (2022 to 2024) and width at least 15% below (0.1, 0.9) in the same years. Prior 40%.
Done: fresh Austin pull (2,383,621 rows, about 9 minutes), then `conformal_tau_drift_run.py` for 2021 to 2024, one job at a time, 1 seed, about 5 minutes each (session 28's four parallel jobs had oversubscribed 4 cores). `results/conformal_tau_drift_austin_a2i_{2021..2024}.json`; `python3 src/conformal_tau_backtest.py austin`.
Outcome (1 seed, so intervals are over weeks only):
| year | chosen pair | test coverage [CI] | width (days) | vs (0.1, 0.9) |
|---|---|---|---|---|
| 2022 | (0.1, 0.9) fallback | 0.781 [0.767, 0.794] | 170.1 | 0% |
| 2023 | (0.2, 0.8) | 0.862 [0.849, 0.874] | 164.2 | -3% |
| 2024 | (0.2, 0.75) | 0.828 [0.819, 0.836] | 118.6 | -30% |
- **H2g is refuted for Austin on its width half**: coverage is inside 77 to 83% in 2 of 3 years (2022, 2024), but width is 15% or more below the fixed pair in only 1 of 3. Austin's a2i tail is long (about 170 days at 80%) and only 6% of permits are same-day, so a narrower quantile pair buys little: the width gain seen in Chicago and SF (44 to 71%) does not carry over.
- 2021 (backtest year only): the chosen pair covered 0.728 and the fixed pair 0.749, so the 2021 under-coverage made 2022 fall back. Austin's test coverage under the fixed pair ran 0.749, 0.781, 0.858, 0.854 for 2021 to 2024, i.e. drift of 10 points across years, consistent with the Chicago finding that year-to-year shift, not method, limits calibration.
- Limits: 1 seed (earlier cities used 3), 3 cells, the loader still counts every Austin row as issued (session 5 item, unchanged), 860 negative issue lags dropped. Austin i2c not run.
Next: paper section 4.2c with the three-city H2g table and the stated Chicago/Austin limit; Austin i2c.

## Session 28, 2026-11-05: milestone 24 attempt, Austin a2i with the H2g backtest rules; not finished (compute), no result changed

Plan (before running): the same grid and backtest as session 27 on Austin a2i for test years 2021 to 2024, then `conformal_tau_backtest.py austin`. Pre-registered: coverage in 77 to 83% in at least 2 of 3 test years (2022 to 2024) and width at least 15% below (0.1, 0.9). Prior 40%: Austin's same-day share is only 6%, so its a2i target is far less zero-inflated than Chicago's or SF's and the pair choice matters less.
Done: fresh Austin pull (2,383,621 rows; 2,184,800 completed; 1,190,329 with cost; 860 negative issue lags; the loader's `issued` column still counts every row, the known item from session 5). `src/conformal_tau_backtest.py` now takes city names (`python3 src/conformal_tau_backtest.py austin`; default unchanged, still prints 3 of 6 inside, 6 of 6 narrower for Chicago and SF).
Outcome: **no Austin result.** Four parallel `conformal_tau_drift_run.py` jobs (3 seeds) ran 2 hours with no output; a restart with 1 seed ran 78 minutes more on 4 cores (each job sets `num_threads=4`, so 4 jobs oversubscribed 4 cores) and wrote nothing. Both were stopped. Each job fits 9 quantile models and one classifier on 1.5M+ training rows at 300 rounds. `results/` is unchanged.
Next: run one test year at a time (no oversubscription), or set `n_max` lower and `min_data_in_leaf` higher for Austin and say so in the table; start 2023 and 2024 first, since 2024 needs 2023 for the backtest.

## Session 27, 2026-11-05: milestone 23, H2g: choose the tau pair with a one-year backtest (planned before running)

Session 25's calibration-only rules failed on Chicago because the shortfall is year-to-year. `src/conformal_tau_backtest.py` adds a backtest: a pair is eligible for test year Y only if its calibration coverage in Y is at least 0.78 AND its realised test coverage in Y-1 (same procedure one year earlier, from the session 25 grids; 2021 newly run for both cities, `results/conformal_tau_drift_{chicago,sf}_a2i_2021.json`) was at least 0.77. The narrowest eligible pair by calibration width wins; none eligible falls back to (0.1, 0.9). Cells: Chicago and SF a2i, test years 2022 to 2024.
- **H2g (pre-registered):** coverage in 77 to 83% in at least 5 of 6 cells and width at least 15% below (0.1, 0.9) in at least 5 of 6. Refuted if 4 or fewer cells are inside. Prior 30%: one year's miss is a weak predictor of the next.

Outcome (3 seeds for the 2021 runs, fresh pulls; the other years reuse session 25 grids; `results/conformal_tau_backtest.txt`):
| city, year | chosen pair | test coverage [CI] | width (days) | vs (0.1, 0.9) |
|---|---|---|---|---|
| Chicago 2022 | (0.05, 0.65) | 0.817 [0.809, 0.825] | 17.6 | -67% |
| Chicago 2023 | (0.05, 0.65) | 0.729 [0.709, 0.747] | 16.2 | -71% |
| Chicago 2024 | (0.05, 0.85) | 0.786 [0.775, 0.797] | 37.8 | -44% |
| SF 2022 | (0.2, 0.65) | 0.847 [0.836, 0.857] | 61.8 | -26% |
| SF 2023 | (0.2, 0.65) | 0.842 [0.837, 0.848] | 39.4 | -39% |
| SF 2024 | (0.2, 0.65) | 0.828 [0.816, 0.837] | 27.2 | -57% |
- **H2g is refuted** on its coverage half: 3 of 6 cells inside 77 to 83% (the width half held, 6 of 6). The backtest fixed Chicago 2024 (0.786 at 44% narrower, versus 0.748 and 0.762 for the earlier rules) but not Chicago 2023, which stays at 0.729 because 2022 (the backtest year) had been 0.817. SF is 0.84 to 0.85 in two years, which is over-coverage by 2 to 5 points, not a failure.
- Reading: one year's coverage does not predict the next in Chicago (0.775 in 2021, 0.817, 0.729, 0.786 for the same narrow pair family); a Chicago user needing 80% should still keep (0.1, 0.9) or accept about +-5 points. In SF a narrow pair is safe in all four years run.
- Limits: 6 cells, a hand-set 0.77 and 0.78, backtest uses outcomes that are not all known at the start of Y (slow permits issued late in Y-1), so it flatters the rule slightly; Austin and i2c not run. An operational note: the pull took about 15 minutes for all three cities.
Next: accept a stated Chicago limit in the paper (section 4.2c), then Austin a2i with the same rules.

## Session 26, 2026-11-05: paper section 4.2b (a writing step; no experiment, no result changed)

All four data hosts returned 403 at the proxy and lightgbm is not installed, so nothing was run. Added section 4.2b to `paper/paper.md` with session 25's H2f table (numbers copied from the entry below) and updated the to-do. Next: year-ahead calibration check when a host is reachable.

## Session 25, 2026-11-04: milestone 22, H2f: a drift-guarded tau-pair rule, tested on test years 2022 to 2024 (planned before running)

Session 23's calibration-width rule picked Chicago a2i's tightest pair and under-covered 2024 (0.748). `src/conformal_tau_drift_run.py` adds a guard: the calibration weeks (even weeks of Y-1) are split into the first and second half of the year, and a pair is eligible only if its coverage (with the pooled CQR qhat) is at least 0.78 in BOTH halves; the narrowest eligible pair is chosen (calibration rows only). Compared with the session 23 rule and the fixed (0.1, 0.9) pair on Chicago and SF a2i, test years 2022, 2023, 2024, 3 seeds, same split and LightGBM settings.
- **H2f (pre-registered):** the drift-guarded rule lands test coverage in 77 to 83% in at least 5 of the 6 city-year cells, and its mean width is at least 15% below (0.1, 0.9)'s in at least 5 of 6. The session 23 rule lands inside in at most 4 of 6. Refuted if the guarded rule is inside in 4 or fewer, or if it is not narrower by 15% in 5 of 6. Prior 35%: half-year coverage is a noisy drift signal and Chicago's same-day mass moved within 2024 itself.

Outcome (3 seeds, fresh pulls: Chicago 852,143, SF 1,297,870 rows; `results/conformal_tau_drift_{chicago,sf}_a2i_{2022,2023,2024}.json`, full grids). Test coverage / mean width in days, chosen pair in brackets:
| city, year | guarded rule | session 23 rule | fixed (0.1, 0.9) |
|---|---|---|---|
| Chicago 2022 | 0.817 / 17.6 (0.05, 0.65) | same pair | 0.853 / 52.7 |
| Chicago 2023 | 0.729 / 16.2 (0.05, 0.65) | same pair | 0.838 / 56.4 |
| Chicago 2024 | 0.762 / 31.0 (0.2, 0.8) | 0.748 / 24.5 (0.05, 0.65) | 0.867 / 67.9 |
| SF 2022 | 0.861 / 84.0 (0.1, 0.9) | 0.847 / 61.8 (0.2, 0.65) | 0.861 / 84.0 |
| SF 2023 | 0.842 / 39.4 (0.2, 0.65) | same pair | 0.850 / 64.8 |
| SF 2024 | 0.828 / 27.2 (0.2, 0.65) | same pair | 0.900 / 63.4 |
- **H2f is refuted.** The guarded rule is inside 77 to 83% in 2 of 6 cells (Chicago 2022, SF 2024), the session 23 rule also in 2 of 6, so the guard did not help. Width was at least 15% below the fixed pair in 5 of 6 (SF 2022 is the exception: the guard fell back to (0.1, 0.9)), so the width half held.
- The guard changed the pick in only 2 of 6 cells (Chicago 2024, SF 2022). Chicago 2023 under-covers by 5 points (0.729) with a calibration coverage of 0.81 in both halves, so the two-halves check sees no drift that the test year then has: the shortfall is year-to-year, not within-year. Narrowing the Chicago interval to 16 to 31 days under-covers in 2 of 3 years; only the wide fixed pair is safe there (0.84 to 0.87, over-covering).
- Reading: tightening the quantile pair gives 2 to 4 times narrower intervals in SF at nominal-ish coverage (0.83 to 0.84 in 2023 and 2024), but for Chicago no rule using the calibration year alone chooses safely; a Chicago user should keep (0.1, 0.9).
- Limits: three test years in two cities, 3 seeds, a coarse grid, a hand-set 0.78 threshold; the guarded rule is one of many possible drift checks. Operational note: running four LightGBM jobs in parallel on four cores stalled for 2.5 CPU-hours each; one job at a time takes about 20 s per seed.
Next: a year-ahead (Y-2 versus Y-1) calibration check, or accept a stated Chicago limit in the paper.


## Session 24, 2026-11-04: paper section 4.2a (a writing step; no experiment, no result changed)

The three data hosts returned 403 at the proxy again (probed Chicago, SF, Austin), so nothing was pulled. Added section 4.2a to `paper/paper.md`: the four over-coverage repairs (H2b to H2e) in one table, why the first three fail (same-day point mass at score 0, qhat 0) and the H2e partial success (SF in band, Chicago not), with the limits (one test year; Austin and i2c not run for H2d and H2e). Abstract finding 3, limitations, practitioner advice and to-do updated. Every number is copied from entries above and `results/conformal_*_2024.json`.
Next: the drift-aware tau-pair rule over test years 2022 to 2024 (session 23's Next), when a data host is reachable.

## Session 23, 2026-11-04: milestone 21, H2e: choose the quantile-level pair by conformal calibration (planned before running)

Session 22 showed no calibration window can narrow the Chicago and SF a2i intervals (qhat is 0 because the same-day mass sits on the score), and located the lever in the quantile model's tau pair. `src/conformal_tau_run.py`: grid tau_lo in {0.05, 0.1, 0.2} x tau_hi in {0.65, 0.7, 0.75, 0.8, 0.85, 0.9}; for each pair CQR qhat on the even weeks of Y-1, intervals rounded outward, the pair chosen by smallest mean width on the CALIBRATION rows among pairs with calibration coverage >= 0.78 (the test year is never used to choose). Same split, features, LightGBM settings and 3 seeds as session 22; Chicago and SF a2i, test year 2024.
- **H2e (pre-registered):** the chosen pair gives 2024 coverage within 77 to 83% on both cities and a mean width at least 15% below the (0.1, 0.9) pair's (Chicago 67.9, SF 63.4 days). Refuted if either city stays outside 77 to 83%, or the width gain is under 15%. Prior 40%: a lower tau_hi shrinks the width, but the drift in same-day mass (Chicago 52% to 30%) can push 2024 coverage below 77% for a tighter pair, which would be an honest cost of narrowing.

Outcome (3 seeds, fresh pulls: Chicago 852,022 and SF 1,297,807 rows; `results/conformal_tau_{chicago,sf}_a2i_2024.json`, full 18-pair grid in each):
| city | chosen pair (calibration width) | 2024 coverage | 2024 mean width | (0.1, 0.9) reference |
|---|---|---|---|---|
| Chicago a2i | (0.05, 0.65), qhat 11.98 | 0.748 | 24.5 days | 0.867, 67.9 days |
| SF a2i | (0.2, 0.65), qhat 13.03 | 0.828 | 27.2 days | 0.901, 63.3 days |
- **H2e is refuted on Chicago, confirmed on SF.** SF lands inside 77 to 83% with a 57% narrower interval (27.2 versus 63.3 days). Chicago's calibration-width rule picks the tightest pair and under-covers 2024 (0.748, outside 77 to 83%): calibration coverage was 0.808, so the 6-point loss is the drift between the calibration year and 2024, now acting in the other direction because the conformal shift qhat is no longer 0 and cannot absorb it.
- Every pair with tau_hi <= 0.8 has qhat of 3 to 12 days (the conformal step now works because the raw interval under-covers, unlike at tau_hi 0.9) and test coverage 0.745 to 0.76 in Chicago. In the grid, Chicago (0.2, 0.85) is the only pair inside the band (0.805, width 39.1, 42% narrower), but the pre-registered rule did not choose it, so it is reported as a post-hoc observation, not a result. In SF all pairs up to tau_hi 0.85 stay in 0.825 to 0.844.
- Consequence: narrowing is available (width roughly halves) and safe on SF, but on Chicago the drift in same-day mass costs about 6 points of coverage for the tightest pairs; a pair choice that also checks stability across calibration years (or a drift-aware margin) is the next lever.
- Limits: one test year, three seeds, two cities, no bootstrap interval reported in this summary (they are in the json); Austin and i2c not run; the tau grid is coarse.
Next: pick the pair by a rule that penalises drift (choose on calibration year Y-2 versus Y-1 disagreement) and test it on test years 2022 to 2024 to see whether the Chicago failure repeats.

## Session 22, 2026-11-04: milestone 20, H2d: rolling and adaptive conformal calibration on the test year (planned before running)

Session 21 showed Mondrian grouping cannot narrow the Chicago and SF a2i intervals because the over-coverage (0.867, 0.901) is drift between the calibration year (even weeks of 2023) and 2024. The lever left is a calibration set closer in time. `src/conformal_rolling_run.py`: for each 2024 week starting at t0 the pool is every row (static calibration + 2024) whose outcome was already known before t0 (start + y < t0, so no peeking at unissued permits), kept to the last W days for W = 60, 120, 365 or all known; under 200 known rows falls back to the static qhat. Also a weekly-batch adaptive conformal (Gibbs and Candes 2021, gamma 0.02). Same models, split and 3 seeds as session 8; intervals rounded outward.
- **H2d (pre-registered):** rolling calibration with W = 120 brings 2024 coverage into 77 to 83% on both Chicago a2i and SF a2i (static: 0.867, 0.901), and the interval gets narrower than the static one. Refuted if either city stays outside 77 to 83% for W = 120. My expectation: Chicago lands near 0.83 to 0.85 (drift is partly seasonal, the pool is still biased toward fast permits because slow permits are not yet known, so rolling coverage may even fall below 80%; that selection effect is the main way this can fail).

Outcome (3 seeds, test year 2024, fresh pulls of Chicago 852,022 and SF rows; `results/conformal_rolling_{chicago,sf}_a2i_2024.json`):
| pair | raw | static | rolling W=60 / 120 / 365 / all | adaptive (gamma 0.02) | mean width (days) |
|---|---|---|---|---|---|
| Chicago a2i | 0.867 | 0.867 | 0.867 / 0.867 / 0.867 / 0.867 | 0.867 | 67.93 in every column |
| SF a2i | 0.901 | 0.901 | 0.901 in all four | 0.901 | 63.40 in every column |
- **H2d is refuted, and degenerately so:** the weekly qhat is exactly 0 in every week, for every window and for the adaptive level (Chicago's alpha_t climbs from 0.20 to 0.27 over 2024 and still lands on 0). Rolling calibration is a no-op here. Austin and the i2c targets were not rerun (a2i over-coverage was the question).
- **Why (checked on the raw feeds):** the share of same-day permits (y = 0) is a point mass of the score distribution. In Chicago it fell from 0.520 (2023, n = 34,784) to 0.304 (2024, n = 33,063); in SF it was 0.515 and 0.554. A same-day permit has lower end 0, so its CQR score is exactly 0, and while that tie mass exceeds the 20% needed the 80th-percentile score sits on it. Widening or narrowing by a conformal shift of 0 days is all the score space offers; coverage above 80% comes from the base interval (63 to 68 days wide) containing the long tail, not from calibration. Session 19's dequantised shift of -0.07 days agrees.
- **A finding worth keeping:** Chicago's drift is real and large (same-day mass 52% to 30%), SF's is not, yet both over-cover and both are immovable by conformal shifting. So drift in the zero-mass is not what keeps the intervals wide; the quantile model's upper tail (tau 0.9) is. The calibration lever for a2i is the tau pair itself (train tau 0.8/0.2 style tighter quantiles, or conformalise on a different score such as the interval's log-width), not any calibration window.
- Limits: one test year, three seeds, two cities; the no-peeking pool uses start + y < t0 only, which is what a live system would know; MIN_N 200 fallback never mattered (qhat is 0 either way).
Next: choose the tau pair by conformal calibration (tau 0.05/0.65 grid on the even weeks of Y-1), a two-parameter family scored by width at 80% coverage.

## Session 21, 2026-11-03: milestone 19 run, H2c (Mondrian CQR by P(same day) band) refuted on 4 of 4 finished pairs

Data hosts reachable this time; all three feeds re-pulled (Chicago 852,022; SF 1,297,807; Austin 2,383,407 rows). `src/conformal_mondrian_run.py` (same split, models and 3 seeds as session 8; classifier bands at 0.33/0.67; intervals rounded outward), results in `results/conformal_mondrian_*_2024.json`. Pre-registered in session 20: within 77 to 83% in at least 4 of 5 pairs.
| pair | Mondrian, rounded | pooled CQR, rounded | qhat by band (low/mid/high P(same day)) |
|---|---|---|---|
| Chicago a2i | 0.867 [0.859, 0.874] | 0.867 | 0, 0, 0 |
| SF a2i | 0.901 | 0.901 | 0, 0, 0 |
| SF i2c | 0.840 | 0.840 | 4.92 (one populated band; 6 rows elsewhere) |
| Austin a2i | 0.855 | 0.852 | 0.01, 0, 7.64 (the 7.64 band holds 1,985 rows) |
| Austin i2c | not finished | | run stopped after 20+ minutes; moot, see below |
- **H2c is refuted:** none of the four finished pairs is inside 77 to 83%, so even a hit on Austin i2c cannot reach 4 of 5. I stopped that run rather than wait; it is not reported.
- **Why:** on Chicago and SF a2i every band's qhat is exactly 0, i.e. the model's raw 80% interval already covers at least 80% of calibration rows in every band, so grouping has nothing to narrow. The over-coverage on the 2024 test year (0.867, 0.901) therefore comes from drift between the calibration year and 2024 (session 19: Chicago KS 0.247), not from a group the pooled qhat hides. Austin a2i's top band does get qhat 7.64 but its 1,985 rows are too few to move the total (0.852 to 0.855).
- Within-band coverage on Chicago (0.851, 0.902, 0.863) and SF a2i (0.870, 0.894, 0.906) is above 80% in every band, which is the same story.
- Consequence: conformal calibration on a lagged year cannot narrow these a2i intervals; the remaining lever is a calibration set closer in time to the test year (adaptive or rolling conformal), listed as session 19's Next. Limits: one test year; marginal coverage per band reported without bootstrap intervals except the headline.
Next: rolling-window or adaptive conformal over the test year for Chicago and SF a2i.

## Session 20, 2026-11-03: milestone 19 instrument, Mondrian (group-conditional) CQR for the two-part conformal; not run on real data

The three data hosts returned HTTP 403 at the proxy CONNECT step again (probe: `curl` to `data.sf.gov`, "CONNECT tunnel failed, response 403"), so no pull was possible and **no number in `results/` changed**; nothing here is a result about permits.
Done: `src/conformal.py` gains `mondrian_cqr` (one qhat per group of a classifier's P(same day), pooled fallback below 30 calibration rows or for an unseen group) and `bands`; four tests in `tests/test_conformal.py` (hand qhat per group, fallback, and a seeded synthetic zero-inflated check that grouped intervals, rounded outward as session 19 advises, do not under-cover; synthetic data tests the code only). 12 conformal tests pass; `test_baselines` needs numpy/pandas, absent here.
Pre-registered for the next run with network access: H2c, Mondrian CQR with 3 bands of a LightGBM same-day classifier (edges 0.33, 0.67), calibrated on the even weeks of Y-1 as in session 8, brings 2024 coverage within 77 to 83% in at least 4 of 5 pairs when intervals are rounded outward. Prior 35%: session 19 showed over-coverage on Chicago and SF a2i comes from drift and the interval itself, which grouping may not fix. Refuted if fewer than 4.
Next: `src/conformal_run.py` wiring (classifier fit, bands, coverage by band) and the real run.

## Session 19, 2026-11-03: milestone 18, dequantised CQR (session 8's "two-part conformal" fix), planned before the run

Hypothesis (H2b, written before any run): session 8 found that on a2i the CQR scores tie at 0 (same-day permits, y = 0, lower end clipped at 0), so qhat cannot go negative and conformal cannot narrow an over-covering interval (Chicago 0.860, SF 0.891 on 2024). Adding independent uniform jitter U[0,1) to the integer-day target y when computing calibration scores (dequantisation, breaking ties the way randomised conformal p-values do) lets qhat go negative. Prediction: dequantised CQR brings 2024 coverage within 77 to 83% in at least 4 of 5 city/target pairs (session 8 plain CQR: 2 of 5). Refuted if fewer than 4. Prior 40%: narrowing may be capped by the clipped lower end.
Plan: `conformal.cqr_scores_dequantised` (stdlib, seeded jitter), same split, models and seeds as session 8, coverage always evaluated on the true integer y. Report coverage and width against plain CQR.

Outcome (run today on fresh pulls of all three feeds, test year 2024, 3 seeds; `results/conformal_dq_*_2024.json`; coverage of the 80% interval on true integer days):
| pair | raw | plain CQR | dequantised | dequantised, rounded outward | KS cal vs test |
|---|---|---|---|---|---|
| Chicago a2i | 0.860 | 0.860 | 0.556 | 0.866 | 0.247 |
| SF a2i | 0.894 | 0.894 | 0.344 | 0.901 | 0.020 |
| SF i2c | 0.787 | 0.834 | 0.830 | 0.838 | 0.052 |
| Austin a2i | 0.817 | 0.819 | 0.781 | 0.847 | 0.057 |
| Austin i2c | 0.769 | 0.811 | 0.808 | 0.817 | 0.029 |
- **H2b is refuted.** Dequantised CQR is within 77 to 83% in 3 of 5 pairs (Austin a2i, Austin i2c, SF i2c at 0.830, the edge), plain CQR in 2 of 5 (Austin a2i, i2c), so the prediction of at least 4 fails. The two-column "rounded outward" variant (floor the lower end, ceil the upper end, a post-hoc fix I added after seeing the first Chicago run, so exploratory) is within the band in only 1 of 5.
- **Session 8's mechanism is mostly wrong.** Jitter does let qhat go negative on a2i, but only by 0.08 to 0.26 days, because the 80th percentile of the scores is set by the non-same-day permits, not by the tied mass. Plain CQR's qhat of exactly 0 was therefore not what held Chicago (0.860) and SF a2i (0.894) above 80%. Their over-coverage comes from the interval itself plus drift (Chicago KS 0.247), and narrowing by tenths of a day cannot fix it.
- **A real pitfall:** unrounded dequantised intervals can be empty or too narrow on integer targets (SF a2i interval upper end 0 minus 0.15 excludes every same-day permit): coverage 0.344. Anyone applying continuous conformal tools to integer-day durations should round outward.
- The i2c targets, where raw intervals under-cover, are where conformal helps (0.787 to 0.83 in SF, 0.769 to 0.81 in Austin) and dequantising makes no practical difference there.
- Limits: one test year; marginal coverage; the real fix for over-coverage in a2i needs a model that predicts the same-day mass directly (a two-part conformal), not a tie-break. `results/manifest.json` updated to today's pull.
Next: two-part conformal (classifier for same-day, conformalise the tail only); adaptive conformal over the test year for Chicago's drift.

## Session 18, 2026-11-03: paper section 4.1 brought up to milestones 14 to 17 (no new compute)

The three data hosts returned HTTP 403 at the proxy CONNECT step again, so no pull was possible and no number in `results/` changed. Done: `paper/paper.md` section 4.1 now carries the XGBoost, CatBoost and linear table for all five pairs (copied from sessions 14 to 17), the three-library agreement finding, and corrected limitations and to-do list (the draft still said LightGBM only). Next: neural net baseline, per-library tuning, two-part conformal, once a network reaches the feeds.

## Session 17, 2026-11-03: milestone 17, CatBoost quantile models on all five city/target pairs (test year 2024), session 16's "Next"

Why: three tree libraries (LightGBM, XGBoost, now CatBoost) should agree if the gain over the reference class is a property of the data and not of one library's defaults. CatBoost differs most: ordered boosting and native categorical encoding (`src/catboost_run.py`, depth 6, learning rate 0.15, up to 300 rounds, early stopping 30 on the calibration year, 3 seeds, same split and week-block bootstrap).
Prediction (written in the session plan before the runs, prior about 65%): CatBoost lands within 3 points of XGBoost at every tau in every pair.
Data: all three feeds re-pulled today (Chicago 851,902; SF 1,297,749; Austin 2,383,209 rows). Relative change of mean pinball loss against the reference class (negative is better; interval = week-block bootstrap):
| pair | CatBoost q0.1 | q0.5 | q0.9 | XGBoost q0.1 / 0.5 / 0.9 |
|---|---|---|---|---|
| Chicago a2i | +0.4% [+0.3, +0.4] | -7.8% [-8.3, -7.3] | +2.4% [+0.8, +4.0] | +0.3 / -10.5 / +4.9 |
| SF a2i | -0.4% [-2.0, +1.3] | -4.5% [-6.8, -2.3] | -17.0% [-19.4, -14.8] | -0.7 / -3.8 / -17.7 |
| Austin a2i | -4.9% [-5.3, -4.4] | -22.9% [-25.0, -20.9] | -31.5% [-34.9, -28.2] | -6.9 / -25.7 / -35.9 |
| SF i2c | -6.2% [-7.6, -4.9] | -12.8% [-14.4, -11.2] | -1.7% [-4.6, +0.9] | -6.3 / -12.5 / -3.2 |
| Austin i2c | -6.5% [-7.7, -5.3] | -18.0% [-19.5, -16.8] | -19.7% [-22.3, -17.2] | -6.9 / -18.1 / -20.1 |
- **The prediction is refuted in one cell of 15.** CatBoost is within 3 points of XGBoost everywhere except Austin a2i q0.9, where it is 4.4 points weaker; the next widest gaps are Austin a2i q0.5 (2.8), Chicago a2i q0.5 (2.7, weaker) and q0.9 (2.5, better).
- The ordering across pairs is the same in all three libraries: Austin gains the most, SF a2i gains only at q0.9, SF i2c gains at q0.1 and q0.5 but not q0.9, and Chicago a2i is worse than the reference class at q0.9 (+2.4%, interval above zero) for CatBoost and XGBoost alike. The conclusion that boosting helps most where permit-type means hide variance does not depend on the library.
- CatBoost is not the best tree model in any pair at q0.5; on Austin a2i it is 2.8 points behind XGBoost. Depth 6 and 300 rounds are shared defaults, not tuned per library, so this is a comparison of defaults.
- Fix found on the way: Austin i2c failed once on a test-year category absent from training (NaN); `prep()` now maps it to its own level. Only Austin i2c hit it and its result comes from the fixed code; the other four ran before the fix and did not fail, so their test sets held no unseen level.
- Limits: one test year; defaults untuned; LightGBM column omitted from the table (it is in `m3_table.md`); no two-part conformal yet. `manifest.json` not touched (counts match session 16 for SF and Austin; Chicago differs by 124 rows from the 2026-10-31 pull).
Next: two-part conformal; Chicago H6 with a fuller linear fit; per-library tuning to see whether the Austin a2i gap closes.

## Session 16, 2026-11-03: milestone 16, XGBoost and linear quantile baselines on SF and Austin i2c (test year 2024), session 15's "Next"

Why: sessions 14 and 15 compared XGBoost and a linear model with LightGBM on a2i only. Does the pattern hold for the second target, issue to completion (i2c)? Chicago has no completion date, so i2c is SF and Austin only.
Prediction (stated in the session plan; the log entry was written after the run, so it was not logged beforehand): XGBoost lands within 3 points of LightGBM (M3) at each tau in both cities, and linear stays behind the trees at q0.5. Prior about 70%.
Data: SF and Austin re-pulled today (same row counts as session 15: SF 1,297,749, Austin 2,383,209), same code, split, 3 seeds and week-block bootstrap (`results/baselines_{sf,austin}_i2c_2024.json`). Relative change of mean pinball loss against the reference class (negative is better):
| city | model | q0.1 | q0.5 | q0.9 |
|---|---|---|---|---|
| SF | LightGBM (M3) | -5.9% | -12.7% | -3.0% |
| SF | XGBoost | -6.3% [-7.7, -5.0] | -12.5% [-14.3, -10.8] | -3.2% [-6.0, -0.7] |
| SF | linear | -2.8% [-3.3, -2.2] | -5.6% [-6.6, -4.7] | +1.9% [-0.8, +4.2] |
| Austin | LightGBM (M3) | -6.6% | -18.1% | -20.5% |
| Austin | XGBoost | -6.9% [-8.1, -5.7] | -18.1% [-19.5, -16.9] | -20.1% [-22.8, -17.5] |
| Austin | linear | -4.0% [-4.7, -3.3] | -12.3% [-13.1, -11.6] | -16.6% [-18.3, -15.0] |
(Intervals: week-block bootstrap on the pinball difference, divided by the reference-class loss.)
- XGBoost is within 0.4 points of LightGBM in all six cells, so the first part of the prediction holds: the gain over the reference class is not a LightGBM quirk on i2c either.
- Linear is behind the trees at q0.5 in both cities (SF -5.6% vs -12.5%; Austin -12.3% vs -18.1%), so the second part holds. In SF it does not beat the reference class at q0.9 (+1.9%, interval spans zero), unlike on SF a2i (-16.7%).
- Limits: one test year; linear fitted on 20,000 of 685k and 2.0M training rows; CatBoost and a neural net unrun; `manifest.json` not touched (the feeds' counts match session 15).
Next: CatBoost; two-part conformal; Chicago H6 with a fuller linear fit.

## Session 15, 2026-11-03: milestone 15, XGBoost and linear quantile baselines on SF and Austin a2i (test year 2024), run as session 14's "Next"

Why: session 14 found on Chicago that XGBoost agrees with LightGBM and the linear model fails at q0.9. Does that carry to the other two cities? Prediction (before running, prior 65%): in SF and Austin XGBoost lands within 3 points of LightGBM (M3) at each tau, and linear stays behind the trees at q0.5.
Data: SF and Austin re-pulled today (SF 1,297,749 rows, Austin 2,383,209), same code, split, 3 seeds and week-block bootstrap as session 14 (`results/baselines_{sf,austin}_a2i_2024.json`). Relative change of mean pinball loss against the reference class (negative is better):
| city | model | q0.1 | q0.5 | q0.9 |
|---|---|---|---|---|
| SF | XGBoost | -0.7% [-2.2, +1.1] | -3.8% [-6.0, -1.8] | -17.7% [-20.1, -15.4] |
| SF | linear | -0.0% | +0.1% | -16.7% [-18.5, -15.1] |
| Austin | XGBoost | -6.9% [-7.5, -6.4] | -25.7% [-27.6, -23.8] | -35.9% [-39.2, -32.6] |
| Austin | linear | -0.8% | -14.5% [-15.6, -13.5] | -28.0% [-30.3, -25.8] |
- Austin: XGBoost matches LightGBM at q0.5 (-25.7 vs -26.0) and q0.9 (-35.9 vs -35.9); at q0.1 it is 2.3 points better (-6.9 vs -4.6). Within the 3-point line. SF against LightGBM (M3: -1.6, -4.7, -17.5): XGBoost -0.7, -3.8, -17.7, gaps 0.9, 0.9, 0.2 points. **Prediction part 1 holds** in all six cells.
- Linear is behind the trees at q0.5 in both cities (SF +0.1% vs -3.8%; Austin -14.5% vs -25.7%), so part 2 holds. But in SF and Austin the linear model does beat the reference class at q0.9 (-16.7%, -28.0%), unlike Chicago (+72.9%): the Chicago failure is not general, it depends on the city's permit-type structure.
- Limits: one test year, a2i only; linear fitted on 20,000 of 1.14M and 2.19M rows; Austin XGBoost hit the 300-round cap on several taus, so it may be under-trained; CatBoost and a neural net unrun.
Next: i2c; CatBoost; two-part conformal.

## Session 14, 2026-11-03: milestone 14, XGBoost and linear quantile baselines for H1 (Chicago a2i, test year 2024), predictions written before the run

Why: the paper draft's to-do item 1 says H1 is still only against the weakest bar (reference class) plus LightGBM. Add two more: XGBoost quantile (`reg:quantileerror`) and a linear quantile regression on one-hot features (fitted on a 20,000-row random subsample, since the exact LP does not scale; disclosed). Same features, split and week-block bootstrap as `boosted.py`; `src/baselines.py`. Feed re-pulled today (not the 2026-11-01 copy).
Predictions (before running): (1) XGBoost lands within 3 points of LightGBM's relative change at each tau (M3: q0.1 +0.3%, q0.5 -9.7%, q0.9 +6.5%), so the q0.9 failure of boosting against the reference class is not a LightGBM quirk. Prior 70%. (2) The linear quantile model is worse than both trees at q0.5 and does not beat the reference class at q0.9. Prior 75%.

Outcome (`results/baselines_chicago_a2i_2024.json`; n_train 727,114, calibration 34,782, test 33,062; 3 seeds; relative change of mean pinball loss against the reference class, week-block bootstrap interval; the feed re-pull has 851,902 rows against 851,889 on 2026-11-01, so the data moved slightly): **both predictions held.**
- XGBoost: q0.1 +0.3% [+0.2, +0.3], q0.5 -10.5% [-11.2, -9.9], q0.9 +4.9% [+3.5, +6.2]. LightGBM (M3): +0.3, -9.7, +6.5. Gaps 0.0, 0.8 and 1.6 points, all inside the 3-point line. The Chicago q0.9 loss to the reference class is therefore not a LightGBM quirk: a second tree library with a different split rule agrees.
- Linear quantile regression (20,000-row subsample, one-hot features): q0.1 +0.0%, q0.5 -2.3% [-2.6, -2.0], q0.9 +72.9% [+65.6, +81.1]. It captures about a fifth of the trees' q0.5 gain and is far worse than the reference class at q0.9, so permit type interacts with the other fields in a way a linear model cannot represent.
- Limits: one city, one target, one test year. XGBoost's early stopping on the calibration year stopped after 3, 135 and 15 rounds for q0.1, q0.5, q0.9 (the calibration year may not resemble the test year for the tails). The linear model saw 20,000 of 727,114 training rows, so part of its gap may be sample size, not form. CatBoost and a neural net remain unrun. `enable_categorical` printed a harmless xgboost warning (the setting belongs to the DMatrix, which does set it).
Next: the same two baselines on SF and Austin; CatBoost; then two-part conformal.

## Session 13, 2026-11-01: paper draft 0 (no new compute)

Why: sessions 5 to 12 produced five hypotheses' worth of results spread over the log; the programme had no `paper/`. Done: `paper/paper.md`, a draft that assembles the logged numbers (H1 to H5) with limits and a to-do list. Every figure is copied from this log or `results/`; no experiment ran, so no result changed. Hypothesis: none (writing step). Not done and listed in the draft's section 7: the proposal's other baselines (linear quantile, XGBoost, CatBoost, neural net) are unrun, so H1 is still against the weakest bar; conformal for same-day mass; spread over draws.
Next: run the missing baselines (needs a Python with lightgbm/xgboost and a fresh feed pull), then two-part conformal.

## Session 12, 2026-11-01: milestone 8, five draws of the local sample (H5 re-test), hypothesis written before the run

Why: M7 used one effective draw per n (seeds only partly averaged, no interval over the draw), and called differences of 1 to 2% noise. Hypothesis (H5b): with 5 independent draws of the n local rows, the M7 headline survives: the first n at which pooled (w=20) is at or below the full-history per-type baseline (grid 100, 300, 1000, 3000) is above 1000 in at least 3 of 4 a2i cities-pairs (Austin, Chicago, SF; so at least 2 of 3 here; i2c follows if time allows). Refuted if it is 1000 or less in 2 of 3. Prior 60%. Secondary: the pooled model beats base_n (same n rows) in fewer than half of the pair/n cells (M7: 6 of 15). Prior 70%.
Changes against M7, stated up front: 5 seeds not 2; source rows capped at 100,000 per city (not 200,000) for the 4-core budget, so a shift from M7 may come from the cap; grid trimmed to 100 to 3000; `src/pooled.py` gains `--grid` and `--tag` (results `pooled_m8_*`). Feeds re-pulled today (Chicago 851,889 rows, SF 1,297,749, Austin 2,383,195).

Outcome (a2i only; test year 2024; `results/pooled_m8_*_a2i_2024.json`; 5 draws of the local rows per n, source rows capped at 100,000 per city; relative change of mean pinball loss against the city's full-history per-type baseline; stars = week-block bootstrap interval, over test weeks, not over draws): **H5b holds (secondary also holds).**
- Pooled w=20 first reaches the full baseline at n = 300 in Austin and never within the grid (to 3000) in Chicago and SF, so it is above 1000 in 2 of 3 pairs; the refutation line was 1000 or less in 2 of 3. Pooled w=1: Austin 1000, others never. Rows at n=3000: Chicago w1 +8.7%, w20 +14.1%; SF +3.4%, +5.9%; Austin -6.3%, -8.8% (significant).
- Pooled beats the baseline built from the same n local rows (base_n) in 8 of 24 pair/n/weight cells (point estimates), 6 of them in Austin, so fewer than half (prior 70%). Where it does it is small: SF n=100 -1.0% for both weights; Austin up to -8.9% at n=3000.
- Same-n comparison hides which model wins: in Austin, a boosted model on the n local rows alone beats the full baseline from n=100 (-2.3%, up to -9.1% at 3000) and is as good as or better than pooling at every n. In Chicago and SF, local_n is worse than the full baseline at every n tested (+3.3% to +26.7%; +7.3% to +15.0%); base_n reaches within 0.3% (SF n=3000, interval includes zero) of the full baseline.
- Reading: with draws averaged, M7's picture stands: the other cities' millions of rows do not buy the new city what a few thousand of its own rows (a per-type table, or in Austin a boosted model) do.
- Limits: a2i only (i2c not rerun); the cap was halved against M7 (100,000 vs 200,000) and the grid ends at 3000, so a crossing "never" means not by 3000; the interval does not cover draw-to-draw variation (5 draws averaged, the spread not reported); w and features fixed in advance; one test year.
- Next: report the spread over draws, i2c, a fourth city (licence check), then the paper.

## Session 11, 2026-11-01: milestone 7, pooled model plus a small local sample (H5), hypothesis written before the run

Hypothesis (H5): a model pooled with the other cities and given n rows of the held-out city's own history matches that city's full-history per-type baseline (mean pinball over q0.1/0.5/0.9, test year 2024) only once n is in the thousands: the first n in the grid (0, 100, 300, 1000, 3000, 10000) at which the pooled point estimate is at or below the full baseline is above 1000 in at least 3 of 5 city/target pairs. Refuted if it is 1000 or less in 4 or more pairs. Prior 55% that it holds (M6 showed the cost of moving between cities is large, +2 to +137%, but the per-type baseline also needs data to fill its classes). Secondary, also written now: at every n from 100 to 1000, the pooled model (weight 1 or 20) beats the baseline built from the same n rows (base_n) in most pairs; prior 80%.
Plan: `src/pooled.py`; local rows drawn at random from the held-out city's years <= 2022; early stopping on the other cities' 2023 plus 20% of the local sample (the held-out city's 2023 is never used); 2 seeds (they change the draw and the model); paired week-block bootstrap against the full baseline and against base_n.

Outcome (test year 2024; `results/pooled_*_2024.json`, table `results/m7_table.md`; mean of the three pinball losses; 1 seed; at most 200,000 random rows per source city for speed): **H5 holds, on its main claim**. The first n at which pooled (w=1) is at or below the city's full-history per-type baseline is 1000 (Austin a2i), 1000 (Austin i2c), 10000 (SF i2c) and never in the grid (Chicago a2i, SF a2i): above 1000 in 3 of 5 pairs. With local weight 20 it is above 1000 in 4 of 5. n = 0 (plain transfer) is +36% and +64% in Austin, +107% in Chicago, +9% and +2% in SF, so M6 is reproduced under the cap.
**The secondary claim is refuted.** I expected the pooled model to beat the baseline built from the same n local rows at n = 100, 300, 1000 in most pairs (prior 80%). It does in 3 of 15 pair/n cells at w=1 and 6 of 15 at w=20. A per-type empirical quantile from 300 rows of the city's own data is already within 0 to 8% of the full-history baseline in four pairs (Austin i2c, Chicago, SF both), and the pooled model rarely beats it. Only in Austin a2i does pooling help at small n (n=1000: w20 -5%, vs base_n +2%).
Unplanned finding: a boosted model on the n local rows alone (local_n) is as good as or better than pooling in Austin a2i (-8% vs full at n=1000, significant) and Chicago (-1% at n=1000, the only cell where anything beats Chicago's full baseline), so for the cities where a boosted model helps at all, a small local sample did what the other cities' millions of rows did not. Weight 20 beats weight 1 at small n in Chicago and Austin, and loses in SF i2c; no setting is best everywhere.
Limits: one test year, 1 seed (so the random draw of the local rows is not averaged; differences of 1 to 2% between cells are within noise: stars mark the bootstrap over test weeks only, not over draws); source rows capped at 200,000 per city (M6 used all rows); local rows drawn at random from the city's history rather than the first n a new city would have, so drift is understated; w and the city feature were fixed in advance, not tuned; harmonised class map still not hand-validated; i2c has one source city.
Next: repeat with 5 draws of the local sample to put an interval on the n-curve, the "first n local rows" ordering, and a fourth city (licence check) before the paper (milestone 8).

## Session 10, 2026-11-01: milestone 6, cross-city transfer (H4), hypothesis written before the run

Hypothesis (H4, from the proposal): a model trained on the other cities and tested on the held-out city is no better than that city's own reference-class baseline on 2024 mean pinball loss (q0.1, 0.5, 0.9). Refuted for a city if the paired week-block bootstrap interval of (transfer minus own baseline) lies below zero at two of three quantiles. Prior 35% that H4 holds: the baseline uses the city's own permit types, which carry most of the signal (session 9), while a transfer model only sees a keyword-harmonised class, cost, description length, month and weekday.
Plan: `src/transfer.py`; leave one city out (a2i: three held-out cities; i2c: Austin and SF, Chicago has no completion date, so each is trained on one source city); compare with an own-city boosted model on the same harmonised features as the ceiling; 3 seeds. Feeds re-pulled today. The harmonised class map is a keyword rule written once, before seeing results, and not tuned on the test year.

Outcome (test year 2024; `results/transfer_*_2024.json`, relative change of mean pinball loss against the held-out city's own baseline, week-block bootstrap intervals): **H4 holds in every city and target**. The transfer model is worse than the own baseline with the interval above zero in 13 of 15 city/target/quantile cells: Chicago a2i +16, +38, +84% (q0.1, 0.5, 0.9); SF a2i +2.1, +14.7, +3.8%; Austin a2i about 0, +0.0, +62.5%; Austin i2c +66, +137, +79%. Two cells are not worse: Austin a2i q0.1 (a tie, both predict about zero) and SF i2c q0.1 (-2.8%, the only cell where transfer wins; it loses at q0.5 +2.0% and q0.9 +3.0%). H4 would be refuted by two quantiles in one city, so it is not. Coverage of the transfer 80% interval: 0.63 and 0.61 in Austin (a2i and i2c), 0.85 Chicago a2i, 0.92 SF a2i, 0.78 SF i2c.
Control, so the loss is not just the thin harmonised features: an own-city model on the same harmonised features beats the baseline in Austin (a2i -13% median, -20% at q0.9; i2c -4.5%) and SF i2c, and is within a few percent in Chicago and SF a2i. So the cost is moving between cities, not the feature set.
Limits: one test year, 3 seeds; the harmonised class is a keyword map written once and not validated against a hand-labelled sample; i2c transfer has a single source city (Chicago has no completion date), so it is weaker evidence than a2i; no pooled-plus-local model (train on all cities and fine-tune on a little local data), which is the likelier practical route and is the next step; Austin a2i q0.1 and q0.5 differences sit at zero because most predictions are zero. A fourth city and its licence check are still to do.
Next: pooled model with a small local sample (learning curve in local rows), then the paper (milestone 7).

## Session 9, 2026-10-31: milestone 5, permutation importance and drop-one ablation (H3 holds, as worded)

Hypothesis (H3, from the proposal, before the run): at most five fields account for 80% of the importance. Operationalised before running: importance is the rise in mean pinball loss (q0.1, 0.5, 0.9) of the session-6 models when one test-row column is shuffled (3 repeats, 3 seeds); k80 is the smallest number of fields whose positive importances reach 80% of their sum. Refuted if k80 > 5 in any pair. Prior 70% that it holds. Caveat noted in advance: the models have only 7 fields (6 in SF, which has no work class), so k80 <= 5 is a weak test.
Done: `src/importance.py`; refreshed the three feeds into a scratch directory; results in `results/importance_*_2024.json`, table in `results/m5_table.md`. Drop-one refits use the first seed only (cost).
Outcome: **H3 holds on all five pairs (k80 = 2 to 4)**, but the wording is looser than the data. The top field carries 39 to 70% of the importance: work class in Austin (68% a2i, 65% i2c) and Chicago (39%), permit type in SF a2i (70%), log cost in SF i2c (66%). Month and weekday are near zero everywhere. Drop-one agrees on the top field in four of five pairs; in Chicago a2i it picks description length (+1.16 days) while permutation picks work class, a sign of correlated fields (drop-one lets the others stand in, permutation does not) and of a one-seed refit.
Not what H3 says: H3 speaks of the gain over the baseline, and permutation importance is not a decomposition of it. The importances sum to 1.7 to 3.4 times the gain in four pairs and 20 times in Chicago a2i, where the gain is only 0.17 days: the model leans on fields heavily and still barely beats a per-type baseline. So "five fields explain 80% of the gain" is not shown; "five fields carry 80% of the model's reliance" is.
Limits: one test year, 3 seeds, 3 permutation repeats, importance not given intervals, no grouped permutation of correlated fields, drop-one has one seed. Hypothesis wording should be tightened (state k80 on permutation importance, or run a Shapley decomposition of the gain) before the paper.
Next: milestone 6 (cross-city transfer, H4; licence check for a fourth city), and a grouped-permutation or Shapley variant of H3.

## Session 8, 2026-10-31: milestone 4 run, split-conformal on the real feeds (H2 refuted)

Hypothesis (H2, written in session 7 before any run): split-conformal intervals calibrated on the year before the test year cover within 3 points of 80% on the test year in every city; refuted if coverage is outside 77 to 83% in any city. Prior 60% that it holds (I expected it to fail in Chicago and SF a2i).
Done: `src/conformal_run.py` (fit on years <= Y-2, early-stop on odd ISO weeks of Y-1, conformalise on even weeks of Y-1, test on Y; q0.1/q0.9 LightGBM ends; 2 seeds; coverage CI by week-block bootstrap), run on 7 city/target pairs x test years 2022, 2023, 2024 (Chicago has no completion date). Feeds pulled fresh today (hosts reachable this session). Results: `results/conformal_*.json`.
Outcome (test year 2024, the headline year):
- Conformal coverage: Austin a2i 0.816, Austin i2c 0.813 (both within 3 points); Chicago a2i 0.860 [0.852, 0.867]; SF a2i 0.891 [0.881, 0.899]; SF i2c 0.834 [0.827, 0.840]. **H2 is refuted**: three of five pairs are outside 77 to 83%.
- Across all 15 city/target/year cells: 7 of the 15 cells are within 3 points (Austin a2i 2022, 2024; Austin i2c 2022, 2024; Chicago a2i 2023; SF i2c 2022, 2023).
- Mechanism for a2i: in Chicago and SF (and Austin 2024) qhat is exactly 0.00 and conformal equals raw. The raw interval over-covers on the calibration weeks, and because many permits are same-day (y = 0 with lower end 0) the CQR scores tie at 0, so the finite-sample quantile cannot go negative and cannot narrow the interval. The method is conservative here by construction, not by luck. SF a2i 2024 stays at 0.891.
- Where the raw interval under-covers (i2c, and Austin/SF a2i in 2022 or 2023) conformal widens it by 3.5 to 22 days and lifts coverage by 4 to 11 points, usually to 0.80 to 0.86. It does not always reach 80%: Austin a2i 2022 0.780 and Austin i2c 2022 0.787, the cases where the calibration year (2021, early pandemic) differs most from the test year.
- Drift diagnostic: the two-sample KS statistic of calibration vs test scores is small (0.02 to 0.07) except Chicago a2i 2024 (0.246), where coverage moved from 0.81 (2023) to 0.86 (2024).
Limitations: 2 seeds; one split rule; intervals are marginal, not conditional on permit type; CQR with a clipped lower end cannot narrow. A fix to try: score the two-part (same-day indicator, then tail) model, or use a randomised tie-break, so the same-day mass does not pin qhat at 0.
Next: milestone 5 (importance and ablations, H3), and a two-part conformal variant for a2i.

## Session 7, 2026-10-31: milestone 4 instrument (split-conformal, drift diagnostic); not run on real data

Hypothesis (H2, unchanged, written before any run): split-conformal intervals calibrated on the year before the test year cover within 3 points of 80% on the test year in every city; refuted if coverage is outside 77 to 83% in any city. Given session 5 (baseline coverage 0.75 to 0.89 on 2024) and session 6 (unconformalised boosted 0.77 to 0.89), I expect H2 to be refuted in Chicago a2i and SF a2i, where the same-day share moves between years, and to hold in the i2c targets. Prior 60%.
Done: `src/conformal.py` (stdlib: finite-sample conformal quantile, CQR scores and intervals after Romano, Patterson and Candes 2019, coverage, two-sample KS of calibration against test scores, coverage by month) and `tests/test_conformal.py` (hand counts for the rank rule including the infinite case, scores, floor, KS; a 200-repeat exchangeable check that average coverage is at least 0.79; a drift case where coverage falls under 0.7 and KS exceeds 0.2). 9 tests run, 3 skipped (need numpy/lightgbm).
Why no result: the feed hosts (data.cityofchicago.org, data.sf.gov, data.austintexas.gov, data.cityofnewyork.us) are refused by this session's egress proxy, as in session 4. **No number in `results/` changed.**
Test-writing note: the first exchangeable test failed (coverage 0.40) because it used signed Gaussian data under the interval's floor of 0; permit lags are non-negative, so the test now uses absolute values. This is a test bug, not a method finding.
Design for the real run (not yet coded): fit on years <= Y-2; early-stop on odd ISO weeks of Y-1 and conformalise on even weeks of Y-1, so the same rows never do both jobs; apply to Y; drift curve by repeating for Y = 2022, 2023, 2024.
Next: on a network that reaches the feeds, wire `conformal.evaluate` to `boosted.fit_predict` with the odd/even split, run the three cities, and report H2 with week-block bootstrap intervals on coverage.

## Session 6, 2026-10-31: milestone 3, LightGBM quantile models vs the baseline (H1)

Hypothesis (written before the run, H1 of the proposal): a gradient-boosted quantile model beats the per-city, per-type empirical quantile on mean pinball loss at q = 0.1, 0.5, 0.9 in the 2024 test year; refuted if the paired bootstrap interval of the difference includes zero in two of three cities. Planned analysis: 5 city/target pairs, features without calendar year (type, work class, log cost, area top-60, description length, month, weekday), calibration year used only for early stopping, paired week-block bootstrap (2,000 resamples) and weekly Wilcoxon.
Done: re-pulled the three feeds (`results/manifest.json` row counts moved by up to a few hundred rows: the feeds grew); `src/boosted.py`, `src/summarise_m3.py`, `tests/test_boosted.py`; results in `results/boosted_*_2024.json`, table in `results/m3_table.md`.
Deviation from plan, disclosed: a first configuration (learning rate 0.06, up to 600 rounds, 5 seeds) ran over 40 minutes on San Francisco application-to-issue without finishing on 4 cores, so I stopped it and ran learning rate 0.15, up to 300 rounds, 3 seeds for all five pairs. Only Chicago finished under the first configuration (one seed, earlier smoke test), with the same sign pattern; its numbers are discarded. No tuning on the test year.
Outcome: **H1 holds** (no city has two of three intervals including zero). 13 of 15 cells favour the boosted model (all of Austin and San Francisco; Austin a2i median -26%, q0.9 -36%). Chicago a2i: median -9.7% (interval excludes zero) but q0.1 +0.3% and q0.9 +6.5% are worse (intervals exclude zero on the wrong side): the baseline is better in the tails there. Boosted 80% interval coverage on 2024: 0.77 to 0.89, so the unconformalised model is no better calibrated than the baseline was (0.75 to 0.89); H2 is the next test.
Same-day classifier (Brier): better than the baseline's coarse grid in Austin a2i (0.103 vs 0.245) and SF a2i (0.210 vs 0.240); worse in Chicago a2i (0.268 vs 0.191, close to the constant train-rate predictor 0.294); equal in i2c where almost nothing is same-day. I did not diagnose why the Chicago classifier fails to beat a per-type rate; early stopping on a 2023 calibration year whose same-day share differs from 2024 is a candidate.
Limitations: one test year (the drift years 2022 and 2023 I planned were dropped for time); 3 seeds, so seed variance is only roughly reported (`boosted_pinball_per_seed`); one fixed configuration, not tuned; XGBoost, CatBoost, linear quantile regression and the neural net from the proposal are not run; Chicago contains only issued permits (survivorship).
Next: milestone 4 (split-conformal on 2023, H2, drift curve over 2022 to 2024), and a linear quantile baseline so "boosted beats the baseline" is not only "any model beats the reference class".

## Session 5, 2026-10-31: milestone 2 run on the real feeds; baselines for five city/target pairs

Hypothesis (written before the run): the reference-class baseline's 80% interval covers within 3 points of 80% on the 2024 test year in each city, and the same-day share in 2024 is near the all-time one (median 0 days everywhere).
Done: full re-pull of the three feeds (hosts reachable this time; about 20 minutes, CSVs outside git), `src/harness.py` run with test year 2024, train to 2022, calibrate 2023. Results in `results/baseline_<city>_<target>_2024.json`; `results/manifest.json` now has Austin's cost count (1,190,252, session 3's correction).
Outcome (application-to-issue, a2i, and issue-to-completion, i2c; interval = baseline q0.1 to q0.9):
| city / target | n test | same-day share | coverage 80% | pinball q0.1 / 0.5 / 0.9 | Brier same-day |
|---|---|---|---|---|---|
| Chicago a2i | 33,062 | 0.304 | 0.885 | 2.68 / 12.57 / 11.05 | 0.191 |
| SF a2i | 23,688 | 0.554 | 0.754 | 2.42 / 11.58 / 15.69 | 0.240 |
| Austin a2i | 53,002 | 0.063 | 0.791 | 8.00 / 39.91 / 37.05 | 0.245 |
| SF i2c | 19,184 | 0.001 | 0.802 | 14.99 / 56.80 / 36.10 | 0.001 |
| Austin i2c | 48,249 | 0.005 | 0.769 | 14.06 / 55.13 / 39.24 | 0.005 |
- **Hypothesis part 1 is refuted for three of five**: coverage is outside 77 to 83% for Chicago a2i (0.885), SF a2i (0.754) and Austin i2c (0.769). The baseline is the weakest fixed reference class, so this is the bar H2's conformal step must beat, and it shows the forward split drifts (calibration on 2023 is not 2024).
- **Part 2 is refuted for Austin**: its 2024 same-day share is 6%, not the median-0 picture of the full history (session 2), so the all-time zero-inflation is a property of earlier years; it varies by city and year (SF 55%, Chicago 30%). Targets must be modelled per period, not from pooled history.
- i2c has almost no zeros, so the two-part score collapses to plain pinball there.
Limitations: one test year; baseline only (no H1 claim yet); no bootstrap intervals run; the Austin loader counts every row as "issued" (2,382,939) although session 3 found 477,248 rows with no issue date, so the loader's issued column needs a check before milestone 3; the same-day Brier uses the coarse quantile grid.
Next: milestone 3 (LightGBM quantile models and the two-part score, H1), after fixing the Austin issued count and adding test years 2022 and 2023 for a drift curve.

## Session 4, 2026-10-31: milestone 2 harness written; not run on real data (feed hosts unreachable)

Hypothesis: none about the data; this session only builds and tests the instrument. The three data hosts returned HTTP 403 at the CONNECT step through the cloud proxy (`curl`: "CONNECT tunnel failed, response 403"), so no pull was possible and **no number in `results/` changed**.
Done: `src/harness.py` (stdlib): one quantile definition (type 7, linear interpolation), pinball loss, forward-in-time split (train <= Y-2, calibrate Y-1, test Y), the per-type reference-class baseline with fallback below 30 rows, the two-part score the session 2 finding demands (Brier of the same-day indicator plus tail pinball on y > 0), 80% interval coverage, and a paired week-block bootstrap. `tests/test_harness.py` has hand counts for the quantile, pinball, split, fallback, a zero-inflated end-to-end run and the bootstrap. `src/describe.py` now uses the same quantile, which resolves session 3's open item on p90 definitions: re-running it will move the p90s slightly from the session 2 table (floor(p n) versus interpolation).
Limitation: the same-day probability here is read off the baseline's quantile grid (coarse: 0, 0.1, 0.5 or 0.9), so its Brier score is a placeholder to beat, not a result. Calibration rows are split out but unused until milestone 4.
Next: on a network that reaches the feeds, `python3 src/permits.py pull --out DIR` then `python3 src/harness.py DIR --city sf --target a2i --test-year 2024` for each city/target, commit the `results/baseline_*.json`, then milestone 3 (boosted models, H1).

## Session 3, 2026-10-31: correction to the Austin cost field (found by a parallel run's duplicate pull)

A second run built the same milestone 1 at the same time (PR 12048, closed as a duplicate of 12049). Its independent pull of the same three feeds matched the row counts (851,778; 1,297,657; 2,382,939) and disagreed with this log on two facts:
- Austin does have a cost field, `total_job_valuation` (non-zero on 1,164,174 of 2,382,939 rows, 49%). The session 2 line "Austin has no cost field" is wrong; `src/permits.py` now maps it. Cross-city cost features are therefore available for all three cities, with zeros in Austin possibly meaning "not stated".
- Austin is not issued-only: 477,248 rows have no issue date, so it can show applied-but-not-issued permits.
- Not reconciled: that run's p90 application-to-issue lags (SF 70, Austin 176) differ from session 2's (81, 142). They used `statistics.quantiles` (exclusive method) and nulled years outside 1990 to 2100; session 2's method is in `src/describe.py`. Milestone 2 should fix one definition and test it against a hand count.
No tables were rebuilt: `results/` still holds the session 2 numbers and Austin's cost column there is empty until the next pull.

## Session 2, 2026-10-31: milestone 1, loaders, schema, datasheets, first lags

Hypothesis (before the pull): the full pulls reproduce session 1's row counts, and the median application-to-issue lag is at least 7 days in every city.
Done: `src/permits.py` (stdlib loader, one schema, paginated SoQL), 4 tests, datasheets for the three feeds, `results/manifest.json`, `src/describe.py` and `results/lags.json`. Pulled the full feeds (parquet not used; CSVs stay outside git).
Outcome:
- Row counts match session 1 exactly: Chicago 851,778; SF 1,297,657; Austin 2,382,939. Completed: SF 750,188, Austin 2,184,191, Chicago 0.
- **The lag hypothesis is refuted.** Median application-to-issue lag is 0 days in all three cities (p90: Chicago 56, SF 81, Austin 142). Most permits are issued over the counter the day they are filed, so the target is zero-inflated, not a smooth positive duration. Consequence for H1/H2: the empirical-quantile baseline gets q = 0.1 and 0.5 right trivially; the models will be judged mainly at q = 0.9 and on a two-part view (P(same day), then the tail). Milestone 2 must score that split explicitly or the pinball loss at q = 0.5 will be uninformative.
- Build time (issued to completed), negative values dropped: SF median 108 days (p10 15, p90 430), Austin median 104 (p10 7, p90 330). Both feeds carry thousands of negative lags (data entry order errors), counted in the manifest.
- Austin has no cost field; Chicago and SF do. Cross-city models must treat cost as missing for Austin, not zero.
- Limitations: no cleaning beyond dropping negative lags; "completed" is a status date and may not mean the build finished; trade permits dominate Austin; this is descriptive, no model run.

Next: milestone 2 (baselines, quantile-loss harness, forward-in-time split) with the zero-inflation handled up front.

## Session 1, 2026-10-31: proposal and feed probe

Hypothesis (before looking): at least three of the four named city feeds expose both an application and an issue date, and at least two expose a completion date.
Plan: count rows and date fields per feed through each feed's public SoQL API, read licences from dataset metadata, check every citation.

Outcome:
- Chicago `ydr8-5enu`: 851,778 rows, issue date on all of them (issued permits only, so survivorship-biased); no completion date field probed.
- San Francisco `i98e-djp9` (host now `data.sf.gov`): 1,297,657 rows, 1,233,195 issued, 750,188 completed.
- Austin `3syk-w9eu`: 2,382,939 rows, 2,184,191 completed.
- NYC DOB NOW `w9ak-ipjd`: my first query used wrong column names and failed; field names and licence not yet established, so NYC is out of milestone 1.
- Citations: all 12 works resolve (Crossref DOIs for four journal papers, arXiv abstract pages for eight). `cite_check.py` was rate limited (HTTP 429) on four arXiv ids, checked by hand.
- Prediction partly wrong: only two cities (SF, Austin) give a completion date, as predicted; Chicago's feed turned out to be issued-only, which I had not expected.

Next: milestone 1 (loaders, schema, datasheets).
