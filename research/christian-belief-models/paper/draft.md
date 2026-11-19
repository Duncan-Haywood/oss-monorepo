# Rotating an item off a subgroup's ballot: what a transferred imputation model can stand in for, and what a small calibration sample must add

*Draft v0 of the milestone-6 methods paper, written with AI assistance (Claude Code) on the repository owner's request. Target: *Sociological Methods & Research* (methods article), with a shorter substantive companion for the *Journal for the Scientific Study of Religion* after milestone 4. This is a Markdown draft with the argument, the numbers and the pre-registration record; figures at print size are in `paper/figures/` (Section 12); conversion to the journal template and an outside read are listed under "Before submission". Every number below is checked against the committed `experiments/*/results/summary.md` files by `paper/check_numbers.py`. References are in `paper/references.bib`.*

## Abstract

Long surveys rotate items across ballots, so many subgroups are asked a given item by only a fraction of their respondents, or not at all. A model trained where the item was asked can impute it elsewhere, but a level estimate for a subgroup built that way inherits the model's transfer error. Using the US General Social Survey 1972–2024 and 13 religion, sexual-morality and marriage items coded to the answer consistent with Catholic teaching, we study 241 source-to-target cells over 20 transfers between immigrant generations, Hispanic and non-Hispanic Catholics, four Christian traditions and two periods. A gradient-boosted model that ranks the target's respondents almost as well as an in-group model still misses the target's share by 5.59 points on average. Splitting that error exactly, the label-free covariate-shift part is a median 0.83 points and the concept-shift part 3.45, and the target's answers to the items it *was* asked do not recover the second (a 0.35-point gain, 95% interval −0.74 to +0.01). So a rotated item needs a calibration subsample in each group. The difference (prediction-powered) estimator saves a median 17% of that subsample, and the transferred model alone beats it below a break-even n* = var(y − f)/b², median 91 respondents, which the formula predicts within a factor of two in 99% of the cells where it can be checked. Across 73 families of two to four subgroups sharing a budget, the allocation barely matters (Neyman changes the loss by under 1%), but shrinking each group's correction toward the transferred model with a Fay–Herriot weight whose variance comes from items already fielded halves the group-average loss at 50 respondents per group, and the robust empirical Bayes interval of Armstrong, Kolesár and Plagborg-Møller keeps 94–97% average coverage at 0.83 of the difference estimator's width. A prior mean read off the other groups' misses helps only for one kind of group: for 2016–24 groups, borrowing the other traditions' miss on the same item cuts the mean squared error to 0.26 of the zero prior's, close to a known-bias oracle. A by-kind prior rule fixed in advance keeps 0.85 of the zero prior's error on seven GSS items it never saw (bootstrap 0.76–0.92), about half its in-sample gain, while re-choosing the prior by leave-out error loses most of it. All predictions were logged before each run; of the 62 made for these eleven steps (two of them the local-language-model baseline, which does not stand in for the subsample at 0.5B, 1.5B or 3B parameters), 35 held in full, 13 in part and 14 were refuted (45 more for milestones 1 to 3 bring the programme to 107: 59, 22 and 26). Under the GSS's own strata and PSUs, design effects on these pooled subgroup shares are small (median 1.06), but the survey's own error, which no calibration subsample removes, shrinks the saving to 14% at 400 respondents and makes subsample-only intervals 4 to 9% too narrow; a design variance computable from the model's predictions and the subsample fixes this. The shrinkage gains of Sections 6 and 8 survive the same correction unchanged to within 0.01, but the robust interval needs it: with the subsample-only variance it covers the population share 93.0 to 93.6% of the time at 200 to 400 respondents, and adding the full sample's design variance restores 94.1 to 95.0% for 1 to 3% more width.

## 1. Introduction

The General Social Survey (GSS) asks most of its religion and moral items on two of three ballots, and some (same-sex marriage, cohabitation, papal infallibility) in a handful of years only (Davern et al. 2024). Split-questionnaire designs make the same choice on purpose: each respondent gets a subset and the rest is imputed (Raghunathan and Grizzle 1995). When the analysis target is a subgroup's share (foreign-born Catholics, Black Protestants, the 2016–24 respondents of one tradition), the imputation model usually comes from a different group, and the question becomes one of transfer: how wrong is a model fitted where the item was asked, applied where it was not, and what must be asked to correct it?

Survey imputation work treats the imputation model as shared across groups unless the analyst adds interactions (Rubin 1987; van Buuren and Groothuis-Oudshoorn 2011), and the strongest principled alternatives, Bayesian latent-class mixtures for categorical data (Si and Reiter 2013; Murray and Reiter 2016), make the same assumption at the level of the mixture. Recent work imputes opinions with language models (Kim and Lee 2023; Argyle et al. 2023) and does not separate subcultures. Domain-adaptation theory bounds a transferred classifier's risk by its source risk plus a divergence (Ben-David et al. 2010), but a survey designer needs the error of a *share*, in points, and a rule for how many respondents to keep.

Milestone 1 of this programme found the pattern this paper starts from: a model trained on third-generation Catholics ranks foreign-born Catholics within 0.03 AUC of an in-group model on 12 of 13 items but misses their share by more than 5 points on 5 of them; a Catholic-trained model ranks Protestants well and under-predicts Evangelical sexual conservatism by up to 17 points. Associations travel; levels do not.

Contributions, each with its pre-registered predictions in `LOG.md`:

1. An exact decomposition of a transferred model's level error into a label-free covariate-shift term and a concept-shift term, with a bound on the first, measured on 241 cells. The second dominates and the asked items do not identify it (Section 4).
2. The size of the calibration subsample a rotated item needs per group, and a break-even n* below which the transferred model alone is better, checked against simulation (Section 5).
3. For several groups sharing a budget: allocation hardly matters, shrinkage does, and the shrinkage variance must come from outside the family (Section 6).
4. Intervals: the robust empirical Bayes interval keeps nominal average coverage around the shrunk estimate, and the plug-in alternatives do not (Section 7).
5. A prior mean for the shrinkage taken from the other groups' misses, a by-kind rule for when to use it, and two honest tests of that rule: leave-one-item-out and seven fresh items (Section 8).
6. One-command code on public data (`README.md`, "Reproduce").

## 2. Data and setting

**Survey.** GSS 1972–2024, release 3a (NORC; `data/download.sh`, checksums in `data/SHA256SUMS`), weighted by `wtssps`. Christian tradition follows the GSS denomination codes; immigrant generation comes from `born` and `parborn`; Hispanic origin is available from 2000.

**Items.** Thirteen binary targets (`src/gss.py`), each coded to the answer consistent with the Catechism of the Catholic Church or as a practice level: weekly attendance, daily prayer, certainty about God, afterlife, sex before marriage always wrong, adultery always wrong, same-sex relations always wrong, opposes same-sex marriage, cohabitation not acceptable, opposes abortion for any reason, divorce should be harder, ever divorced (an outcome, ever-married only) and papal infallibility (Catholics only). The coding describes agreement with a stated teaching, not a judgement of anyone's faith; the programme does not infer named people's beliefs.

**Transfers.** Twenty source-to-target pairs in three kinds: *generation* (Catholic generation 3→1, 3→2, 1→3; plus non-Hispanic→Hispanic Catholics, kept apart as *ethnicity* where it matters), *tradition* (all 12 ordered pairs of Catholic, Evangelical, Mainline and Black Protestant) and *period* (each tradition ≤2014→2016–24). With papal infallibility only for Catholic pairs and a few cells too thin, this gives 241 cells.

**Model.** Gradient boosting on demographics, politics and the other belief items (the milestone-1 model; boosting adds a median +0.003 AUC over L2 logistic regression, so the choice of learner is not the story). The transferred estimate E0 of a target's share on item j is the target's weighted mean of the source-fitted f_j. Truth is the target's observed weighted share among those asked j.

## 3. Notation

For target T, source S and item j, let p_{S,j}(x) and p_{T,j}(x) be the groups' conditional probabilities of the coded answer and f_j the source-fitted model. The transfer bias is b_j = E_T[f_j] − E_T[Y_j]. A calibration subsample of n target respondents asked j gives the plain mean M (variance σ_Y²/n) and the difference estimator D = E_T[f_j] + mean of (Y − f_j) over the subsample (Särndal, Swensson and Wretman 1992; prediction-powered inference, Angelopoulos et al. 2023a), with variance v = σ²_{Y−f}/n. For a family of groups g sharing item j, the composite estimator is E0 + m_g + γ_g(D − E0 − m_g), γ_g = τ²/(τ² + v_g), with prior mean m_g and prior variance τ² for the bias (Fay and Herriot 1979).

## 4. Why a transferred model misses a level

**Decomposition.** b_j = A_j + B_j exactly, where A_j = E_T[f_j − p_{S,j}] is the source model's misfit where the target lives (covariate shift) and B_j = E_T[p_{S,j} − p_{T,j}] is conditional (concept) shift. With r = dT/dS, A_j = E_S[r(f_j − Y_j)] needs no target label, and by Cauchy–Schwarz |A_j| ≤ √(1 + χ²(T‖S)) ‖f_j − p_{S,j}‖_{L2(S)}. B_j needs the target's answers to j.

**Measurement** (`experiments/m6_shift_bound`). r is estimated by a domain classifier (Sugiyama, Suzuki and Kanamori 2012). Over 241 cells the median |b| is 4.08 points (mean 5.59), the median |Â| is 0.83 and the median |B̂| is 3.45; |Â| < |B̂| in 77% of cells (Figure 1). The median importance-weight effective sample fraction is 0.33, which for normalised weights corresponds to 1 + χ̂² ≈ 3, so the bound's multiplier is about 1.7 in a typical pair. Covariate shift matters only between traditions (median |Â| about 1 to 3 points per pair) and is 0.16 to 0.35 points (pair medians) for generations, Hispanic Catholics and periods.

**Can the asked items stand in?** Four label-free estimators of the target's share were compared with E0 (mean absolute error 5.59): the source share E1 (10.90), importance weighting IW (5.25), E0 shifted by the median logit recalibration of the other items E2 (5.18), and a signed, similarity-weighted version E3 (5.24). Paired with E0, E3 gains 0.35 points (pair-cluster bootstrap 95% −0.74 to +0.01), IW 0.33 (−0.69 to +0.04). The pre-registered refutation was met: a subgroup's shift on the items it was asked does not carry a usable estimate of the unasked item's shift. The size of E3's correction does not rank cells by their error (Spearman 0.11), though its sign is right in 71% of cells. The items that move together (premarital sex, same-sex relations, cohabitation) borrow well; abortion, divorce law and adultery get worse because their shifts run against the rest.

**Can a language model stand in?** A local open-weights model sees the one thing the transferred model cannot: the target group's name. Milestone 5 (`experiments/m5_local_llm`) gave Qwen2.5-1.5B-Instruct each respondent's 15 demographic variables and tradition as text, with no item answers, and read P(yes) from its next-token logits. Over 74 cells it ranks respondents at a median AUC of 0.569, against 0.780 for the transferred model. It misses the share by 32.84 points zero-shot and saves nothing as the difference estimator's f (variance ratio 0.990). Its predicted gap between groups has Spearman 0.345 with the true gap but a slope of 0.09, so the source share plus its gap misses by 9.35 points, against 5.11 for the transferred model. A model of this size does not identify B<sub>j</sub> either. Scale does not fix it within the family: Qwen2.5-3B-Instruct orders the groups' gaps better (Spearman 0.556) but answers No to almost everything (87% of its scores below 0.01 or above 0.99), so its probability-scale gap has a slope of 0.02, its source share plus gap misses by 12.27 points, and as an imputer it misses the share by 61.43 points zero-shot. On the logit scale (an exploratory analysis, not pre-registered) its gap has a slope of 1.30 overall, carried by the tradition pairs; generation, ethnicity and period pairs carry little, and the logit-shift estimate is no better than the source share.

**Consequence.** The bound has a label-free first term and a second term that only answers to j itself identify. Every design below therefore keeps a calibration subsample of each group that is asked the rotated item.

## 5. How big a calibration subsample

(`experiments/m6_calibration`; 500 simple random subsamples of n ∈ {25, 50, 100, 200, 400} per cell, n at most half the asked rows.)

**Saving.** D needs a fraction σ²_{Y−f}/σ_Y² of M's sample for the same precision. Its median over cells is 0.830 (pair-cluster bootstrap 0.798 to 0.852; quartiles 0.732 and 0.899; below 1 in 98% of cells), so the model saves about a sixth of the subsample. The saving tracks predictability: same-sex marriage 33%, same-sex relations 31%, cohabitation 28%, weekly attendance 25%, against ever divorced 4%, afterlife and papal infallibility 6%, divorce law 7%. PPI++ power tuning (Angelopoulos, Duchi and Zrnic 2023b) and logit recalibration are within 0.3% of D's RMSE at every n and buy nothing here.

**Break-even.** D beats the transferred model alone once n > n* = σ²_{Y−f}/b². The median n* is 91 (quartiles 27 to 317; tradition pairs 58, generation 153, period 159, Hispanic 204). In the 137 cells whose simulated crossover falls inside the grid, the analytic n* is within a factor of two of it in 99% (Figure 2; median ratio 0.71; the formula ignores the finite-population correction and weight variation, so it leans early).

**Coverage.** D's Wald 95% interval covers 93.3, 94.1 and 94.5% of draws at n = 100, 200 and 400, and 90.0% at n = 25.

**Cost.** A ±3-point 95% half-width for one group takes 676 (premarital sex) to 1,431 (papal infallibility) calibration respondents with the model, against 812 to 1,538 without.

**Under the GSS design.** (`experiments/m6_design_variance`.) The analysis above draws subsamples simple random and scores against the target's sample share. With the GSS's strata and paired PSUs and the ultimate-cluster variance (Wolter 2007), the design effect on a subgroup's share is a median 1.058 (pair-cluster bootstrap 1.047 to 1.071), and 1.024 for the residual y − f, smaller for the residual in 78% of cells: a group pooled over decades has a median 2.26 respondents per PSU, so clustering has little to act on. The design-based variance ratio is 0.811 (0.781 to 0.834), slightly better than the 0.830 above. What does change the picture is the survey's own error V1, the design variance of the full asked sample's share, which M and D share and no subsample removes. Against the population share, D's total-error ratio to M is 0.834 at n = 50 and 0.863 at n = 400 (0.836 to 0.882), and the subsample-only Wald interval for D is too narrow (Figure 6) by a median factor of 1.036 at n = 50 and 1.085 at n = 400 (1.17 to 1.19 for generation, Hispanic and period groups at 400, where V1 is a quarter of M's error). The remedy needs nothing a designer lacks: the ultimate-cluster variance of the linearised values w(f − f̄)/W_T on every target row plus w(r − r̄_s)/W_s on the subsample averages 0.935 of the true variance at n = 50 and 0.989 at n = 400, where the Kish variance falls to 0.849.

## 6. Splitting a budget across subgroups, and shrinking

(`experiments/m6_allocation`; 73 families of 2 to 4 groups sharing an item and a kind; budget B = G × n̄; 300 draws per family and n̄; loss is the mean group MSE; medians over families with item-cluster bootstrap intervals.)

With b_g and σ_g known, the composite's MSE is b²v/(b² + v), and minimising its sum under Σn_g = B gives water-filling: n_g = max(0, σ_g/√μ − n*_g), Neyman allocation (Neyman 1934) minus each group's break-even, so a group the model already fits gets nothing.

Loss relative to D with an equal split, at n̄ = 50 / 400:

| strategy | n̄ = 50 | n̄ = 400 |
|---|---:|---:|
| plain mean, equal split | 1.226 | 1.218 |
| D, Neyman split | 0.993 | 0.994 |
| oracle composite, water-filled (infeasible floor) | 0.259 | 0.559 |
| shrinkage, τ² from the family's own groups (FH_fam) | 0.657 | 1.044 |
| shrinkage, τ² from other items of the same kind (FH_prior) | 0.501 (0.443–0.546) | 0.885 |
| FH_prior after a pilot and water-filling (FH2) | 0.518 | 0.909 |

Three findings. Allocation is not the lever: Neyman moves the loss by under 1%, and water-filling on pilot estimates is 2 to 3% worse than an equal split. Shrinkage is: FH_prior halves the loss at 50 per group (root group MSE 4.66 points against D's 6.75, about D's error at 100 per group) and still saves 11% at 400 (Figure 3), and it does not trade the worst group for the average (worst-group RMSE ratio 0.747 at 50). And τ² must come from outside the family: three or four groups cannot estimate it, and FH_fam is worse than D from n̄ = 200 on. The gap to the oracle (0.26 against 0.50) is the value of knowing which group is biased, which Section 8 takes up.

## 7. Intervals for a shrunk share

(`experiments/m6_intervals`; coverage computed exactly under the normal approximation given each group's bias; 227 groups.)

A shrunk estimate is biased by (1 − γ)b, so the posterior interval ±1.96√(γv) can undercover exactly where b is large. The robust empirical Bayes interval (Armstrong, Kolesár and Plagborg-Møller 2022) widens the critical value so that coverage *averaged over groups* is at least nominal for any bias distribution with the assumed second moment, here v/τ². Mean coverage over groups at n̄ = 50, 100, 200, 400:

| interval | 50 | 100 | 200 | 400 | half-width / D's at 50 |
|---|---:|---:|---:|---:|---:|
| naive posterior | 93.8% | 93.7% | 93.7% | 94.9% | 0.713 |
| robust EB | 96.8% | 95.1% | 94.1% | 95.0% | 0.832 |
| plug-in conditional MSE | 89.1% | 92.1% | 93.9% | 94.5% | 0.698 |

The robust interval is the one to report: nominal on average, the only one whose lowest decile stays above 92% at every budget, and 17% narrower than D's (11.39 against 13.57 points at 50). It works because τ² from other items of the same kind matches the groups' own mean squared bias (RMS bias and √τ² both 5.2, 11.7 and 7.0 points for generation, period and tradition). What it cannot do is protect a group missed by more than twice τ: the 12 groups with b²/τ² > 4 are covered 63.8% of the time (naive 44.7%) (Figure 4). The analytic approximation was checked against the simulation of Section 6: 87.2% of group-budget rows within 10% of the simulated RMSE, 94.7% once the without-replacement factor is included.

## 8. A prior mean from the other groups' misses

The oracle gap in Sections 6 and 7 is about knowing which group is biased. The 19 × 13 matrix of biases (pairs × items; Hispanic pair excluded) may carry that: a 2016–24 drift on an item is plausibly shared across traditions, and a tradition's level gap may repeat across items. Shrinking toward a regression prediction rather than zero is the original Fay–Herriot idea (Fay and Herriot 1979; Rao and Molina 2015).

**Priors** (`experiments/m6_prior`). Scenario: item j is rotated off one subgroup while every other cell's bias is known. P0: m = 0 (FH_prior). COL: the mean bias of the same kind's other pairs on j. ADD: an additive pair + item fit within the kind. LR: rank-2 completion of the column-centred matrix. GRP: zero mean, the pair's own τ². Each prior's τ² is its own nested leave-out squared error on the same kind's other items, so no cell's bias enters its own prior.

Mean group MSE over P0's at n̄ = 50 (item-cluster bootstrap 95%), all 227 groups and by kind:

| prior | all | generation | period | tradition |
|---|---:|---:|---:|---:|
| COL | 0.766 (0.52–1.03) | 1.533 | 0.259 | 1.048 |
| ADD | 0.725 (0.46–1.05) | 1.631 | 0.299 | 0.911 |
| LR | 0.818 (0.74–0.89) | 1.019 | 0.433 | 1.108 |
| GRP | 1.050 | 0.942 | 1.116 | 1.014 |
| known-bias oracle | 0.529 | 0.715 | 0.272 | 0.712 |

The information is real but kind-specific. For 2016–24 groups the other traditions' recent miss predicts this tradition's miss to 4.7 points RMS against the 11.7-point bias it replaces, and shrinking toward it reaches the oracle (0.259 against 0.272). For immigrant generations the other generations' misses point the wrong way and every structured prior but LR hurts by half. For traditions ADD helps within noise. Around ADD the robust interval covers the 12 large-bias groups 93.3% of the time (P0 63.8%) at no extra width. One item dominates: same-sex marriage, whose 2016–24 groups are missed by 35 to 43 points; without it the all-groups gain vanishes (COL 0.977, ADD 0.944), while the period gain survives.

**Choosing the prior without the rotated item** (`experiments/m6_kindsel`). Leave one item out, choose per kind the prior with the smallest leave-out error on the other 12, evaluate on the held-out item. The choice agrees with the by-kind reading in 37 of 39 kind-folds (period COL 13 of 13, generation P0 12 of 13, tradition ADD 12 of 13), yet the score is 0.826 of P0's at n̄ = 50 (0.74–0.95), against 0.648 for the rule period-COL, generation-P0, tradition-ADD. The two disagreeing folds are the costly ones: when the dominant item is held out, LR wins on the other 12 by a small margin and then misses that item badly (4.62 and 3.07 times P0's MSE on the 15 affected groups). Mean leave-out squared error over a dozen items is dominated by one or two large cells, so re-choosing by error is fragile in exactly the case it is meant for.

**The rule on items it never saw** (`experiments/m6_fresh_items`). The rule was fixed and seven fresh GSS items were fitted with the same pipeline (refitting the 13 old items reproduced all 228 earlier cells exactly): euthanasia, assisted suicide, the death penalty, marijuana, pornography law, teen sex and teen birth control, each coded to the Catholic-consistent answer, plus six abortion sub-items as a secondary set. Mean group MSE over P0's:

| set | n̄ = 50 | 100 | 200 | 400 | robust coverage at 50 |
|---|---:|---:|---:|---:|---:|
| primary (7 items, 133 groups) | 0.846 (0.76–0.92) | 0.874 | 0.901 | 0.988 | 98.5% |
| secondary (6 abortion items, 114 groups) | 0.868 (0.81–0.93) | 0.900 | 0.934 | 0.998 | 98.9% |
| in-sample (13 old items) | 0.648 | 0.709 | 0.792 | 0.993 | |

The rule keeps about half its in-sample gain, and nearly all of it is the period part (Figure 5) (COL 0.383 on the primary set's 2016–24 groups, 0.487 on the secondary set's). For traditions and generations no prior beats zero consistently: LR does on the fresh items (generation 0.787, tradition 0.768) and loses in-sample; a post hoc variant using it scores 0.655 on the fresh items and 0.745 on the old ones. The instability is the same one the leave-one-item-out test found, seen from the other side.

**Sections 6 to 8 under the GSS design** (`experiments/m6_design_shrinkage`; all 228 cells of Section 6 refitted and matched, every row of Section 8 rescored in closed form). Against the population share the shrunk estimate carries the survey's own error too: (1 − γ) times the phase-1 error of the model's mean prediction f̄ and γ times that of the sample share, each with the GSS's strata and PSUs. The model's mean is the steadier of the two (median V_f/V_y 0.209; correlation of the two errors 0.453), so at n̄ = 50 phase 1 is 3% of the shrunk estimate's mean squared error against 4% of D's, and the point-estimate gains are unchanged: Section 6's family-median loss ratio is 0.471 against 0.472 under the sample share (both computed analytically here; the simulated 0.501 above), the ratio pooled over all groups 0.635 against 0.641, and the by-kind rule of Section 8 0.649 against 0.648 (period COL 0.265 against 0.259). (The pooled ratio is higher than the family median because a few large-bias groups dominate it.) What moves is the interval. Scored against the population share, the robust EB interval built with the subsample-only v averages 93.0% at n̄ = 200 and 93.6% at 400, with a lowest decile of 89.6 to 90.6%; for generation and period groups at 400, where V_y is a fifth of D's error, 92.6% and 92.5%. Using v + V_y in γ, the critical value and the width restores 96.8%, 95.1%, 94.1% and 95.0% at n̄ = 50 to 400 for a median 0.9 to 3.4% more width, still 0.839 of D's width at 50 and 0.984 at 400 (Kish-variance D itself covers 93.5% at 400). V_y is the design variance Section 5's interval already needs.

## 9. What a survey designer should do

1. Before rotating item j off a subgroup's ballot, keep a calibration subsample of that subgroup that is asked j. Its other answers do not identify the level shift (Section 4).
2. Size it from a pilot with n* = σ²_{Y−f}/b²: below about n* the transferred model alone is better; above, use the difference estimator. Expect a sixth, not a half, of the sample saved, and a third at most for the most predictable items (Section 5).
3. With several groups, split the budget equally and shrink each group's correction toward the transferred model with τ² taken from items already fielded in full for the same kind of group; report the robust EB interval, with the full sample's design variance V_y added to v (Sections 6 to 8).
4. Use a non-zero prior mean only where the bias is shared: for a period shift, the other groups' miss on the same item. Fix that choice by kind in advance; do not re-choose it by error on the items already fielded (Section 8).

## 10. Limitations

- One survey. The fresh-item test is out-of-item, not out-of-survey; a second survey (Pew Religious Landscape Study, a later GSS wave, or a diocesan survey with the same items) is the real test, and those archives need a named registration, which is an owner step.
- One boosted model and one seed for the transferred model; intervals for the transfer are from pair- or item-cluster bootstraps, not the GSS's PSU and strata.
- Calibration subsamples are simple random draws from respondents who were asked, as GSS ballots are assigned. Section 5's design-based check uses the with-replacement PSU approximation, treats 1972–74 (no design codes) as simple random within year, and pools decades; a single-year subgroup estimate has more respondents per PSU and would see larger design effects. Sections 6 to 8 are rescored under the design at the end of Section 8 with the same approximations, the sample-level bias standing in for the population one and V_y taken as known (Section 5's estimate of it is within 1 to 7%).
- Sections 7 and 8 use the normal approximation with v and τ² treated as known (no Prasad and Rao 1990 term), and the scenario of Section 8 assumes the other groups' biases are known exactly, an upper bound for designs that rotate an item off several groups at once.
- The full asked target stands in for the subgroup's population.
- 13 items and 19 pairs: one item (same-sex marriage) can decide a comparison, and the period rule rests on 45 cells in four traditions.
- Orthodox Christians (27–205 respondents per item) are too few to model; cross-national transfer (milestone 4) and a local-LLM baseline (milestone 5) are not yet run.

## 11. Pre-registration record

Predictions were written to `LOG.md` before each run; outcomes were appended after. Counting each numbered prediction once (a prediction with several parts counts as held only if every part held):

| step | log entry | predictions | held | partly held | refuted | refutation rule met |
|---|---|---:|---:|---:|---:|---|
| decomposition | 2026-11-12 | 6 | 2 | 1 | 3 | yes (asked items do not carry the shift) |
| calibration size | 2026-11-12 | 5 | 4 | 1 | 0 | no |
| budget and shrinkage | 2026-11-13 | 6 | 3 | 2 | 1 | no |
| intervals | 2026-11-14 | 5 | 2 | 0 | 3 | no |
| priors from other cells | 2026-11-15 | 5 | 2 | 1 | 2 | no |
| per-kind choice | 2026-11-16 | 6 | 4 | 0 | 2 | no |
| fresh items | 2026-11-16 | 7 | 6 | 0 | 1 | no |
| design-based variance | 2026-11-16 | 7 | 5 | 1 | 1 | no |
| Sections 6 to 8 under the design | 2026-11-17 | 5 | 1 | 3 | 1 | yes (rule mis-specified; see `LOG.md`) |
| local LLM baseline (milestone 5) | 2026-11-17 | 5 | 3 | 2 | 0 | no |
| local LLM at 3B (milestone 5) | 2026-11-19 | 5 | 3 | 2 | 0 | no |
| **milestones 5 and 6** | | **62** | **35** | **13** | **14** | |
| H1 to H4, within-tradition and transfer (milestone 1) | 2026-11-03 | 4 | 2 | 1 | 1 | yes, H4 (Black Protestants not the worst-ranked) |
| fold seeds and politics ablation (milestone 2) | 2026-11-06 | 4 | 2 | 1 | 1 | no rule stated |
| Hispanic and non-Hispanic immigrants (milestone 2) | 2026-11-07 | 3 | 1 | 1 | 1 | no |
| decade &times; generation calibration (milestone 2) | 2026-11-07 | 4 | 2 | 1 | 1 | no rule stated |
| held-out survey year (milestone 3) | 2026-11-08 | 4 | 2 | 0 | 2 | no rule stated |
| period shift (milestone 3) | 2026-11-08 | 4 | 1 | 0 | 3 | no |
| local window (milestone 3) | 2026-11-09 | 4 | 2 | 0 | 2 | no |
| MICE (milestone 3) | 2026-11-10 | 4 | 2 | 1 | 1 | no |
| drift-aware intervals (milestone 3) | 2026-11-11 | 5 | 4 | 1 | 0 | no |
| latent-class mixture, DPMPM (milestone 3) | 2026-11-11 | 4 | 2 | 2 | 0 | no |
| mixture with the survey period (milestone 3) | 2026-11-12 | 5 | 4 | 1 | 0 | no |
| **milestones 1 to 3** | | **45** | **24** | **9** | **12** | |
| **total** | | **107** | **59** | **22** | **26** | |

The counts follow each outcome's own verdict word in `LOG.md` ("held", "half held", "mostly held", "held on the point estimate, not cleanly" and "held in its first two parts" count as partly held; "narrowly refuted" counts as refuted). `paper/prereg_count.py` reads every entry's numbered predictions and verdicts, maps each of the 21 verdict phrases the log uses with a table that states the judgement calls, and `--check` fails if this table and the log disagree (`test_prereg_count.py` runs it). A scripted recount on 2026-11-19 reproduced all eleven rows for milestones 5 and 6 as first written, but not their total: the rows sum to 35 predictions held in full, where the table and the abstract had said 36 (36 + 13 + 14 is 63, not 62). Both now say 35. Five phrases from milestones 1 to 3 needed a reading: "refuted in part", "refuted in its first half" and "refuted narrowly for hgb_shift" (one arm of a two-arm prediction failed) count as partly held; "refuted for one item" counts as refuted, because the prediction said "every target"; and "not supported" (Hispanic immigrants' AUC loss larger "on most items": 6 of 11, with no paired interval above zero) counts as refuted, the reading less kind to the predictions, where a literal one would count it held. Across the programme, 55% of predictions held in full, 21% in part and 24% were refuted; milestones 1 to 3 and milestones 5 and 6 were refuted at about the same rate (27% and 23%).

## 12. Figures

Vector PDF (for the journal) and SVG in `paper/figures/`, drawn at the journal's column widths (3.5 in single, 7.0 in double) by `python3 paper/figures.py` from the committed `experiments/m6_*/results/*.csv` files, with no microdata. Before drawing, the script recomputes from the plotted rows the numbers the text quotes for each figure and stops if any differs (`--check`; `test_figures.py`). Colours are Okabe–Ito and every series also differs by marker or line style, so the figures read in greyscale.

**Figure 1** (`fig1_decomposition`, single column). Each of the 241 cells' transfer bias split into its covariate-shift part Â (vertical) and concept-shift part B̂ (horizontal), points, coloured by kind of transfer. Points near the horizontal axis are cells whose miss is almost all concept shift (median |Â| 0.83, median |B̂| 3.45); the dotted diagonals mark |Â| = |B̂|. Only tradition pairs reach far from the axis vertically.

**Figure 2** (`fig2_nstar`, single column). Analytic break-even n* = var(y − f)/b² against the simulated n at which the difference estimator's RMSE falls to the transferred model's |bias|, for the 137 cells whose simulated crossover falls inside the n grid (log–log). The grey band is a factor of two either side of equality; 99% of cells fall in it, and most lie below the line (median ratio 0.71).

**Figure 3** (`fig3_budget`, single column). Family loss (mean group MSE) over the equal-split difference estimator's, median over families, against calibration respondents per group. The Neyman split sits on 1; shrinkage with τ² from other items halves the loss at 50; τ² from the family's own three or four groups loses its advantage by 200; the oracle composite is the floor.

**Figure 4** (`fig4_coverage`, single column). Exact coverage of the three intervals around the shrunk estimate in each of the 227 groups at n̄ = 50, against b²/τ² (log scale; values below 10⁻³ drawn at 10⁻³), with bin means over [0, 0.25), [0.25, 1), [1, 4) and [4, ∞) drawn at 0.1, 0.5, 2 and 8. The robust EB interval stays near or above 95% until b²/τ² exceeds 4, where its bin mean is 63.8%.

**Figure 5** (`fig5_priors`, double column). Mean MSE of each informative prior mean over the zero prior's at n̄ = 50, by kind of group: left, the 13 items the by-kind rule was read from; right, the seven fresh primary items. The black tick is the known-bias oracle of Section 8 (the best fixed weight between the transferred model and D, with a zero prior mean). Only the period groups gain on both sets.

**Figure 6** (`fig6_design`, single column). Under the GSS design, the difference estimator's error variance over the plain mean's, median over cells, against the sample share (phase 2 only, dashed) and the population share (including the survey's own error V₁, solid), with the factor by which a subsample-only Wald interval is too narrow for the population share (dotted, right axis).

## Before submission

- Pre-registration table: recounted against `LOG.md` by script and extended to milestones 1 to 3 on 2026-11-19 (Section 11, `paper/prereg_count.py --check`). A human reader should still check that each verdict word fits its numbers; the script checks only that the words are counted correctly.
- Citations: `python3 ../../_shared/cite_check.py paper/references.bib` resolved all 18 ids (16 DOIs, 2 arXiv) on 2026-11-17, each to the title cited. That check caught one wrong DOI: Prasad and Rao 1990 pointed at Gelfand and Smith's 1990 JASA paper and now points at 10.1080/01621459.1990.10475320. A resolving id does not prove the cited claim; a second reader should still open each.
- Figures: done at print size (Section 12, `paper/figures.py`); the journal may ask for TIFF or EPS, which the vector PDFs convert to without loss.
- Design-based variances: done for Section 5 and for Sections 6 to 8 (end of Section 8).
- A second survey for Section 8's rule, if the owner registers for an archive.
- Journal template, word count (about 8,000 to 10,000), cover letter: owner steps.

## Code and data

Every number above comes from `experiments/m6_*/results/summary.md`, regenerated by the commands in `README.md` ("Reproduce"). The GSS file is public (NORC), not committed. MIT licence.
