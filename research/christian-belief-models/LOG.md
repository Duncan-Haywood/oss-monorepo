# Research log: christian-belief-models

## 2026-11-06 · Milestone 2 (part): CV-seed stability and a politics ablation, Catholics (plan and predictions written before the run)

- Why: milestone 1 used one fold seed, so its AUCs carry no split-to-split spread, and the permutation-importance table suggests politics matter but never removes them. `experiments/m2_seeds_ablation/run.py`: Catholic respondents, 14 targets, logit and hgb, 5-fold weighted CV with seeds 0 to 2, on the full feature set and with `polviews` and `partyid` removed.
- Predictions: (1) the seed-to-seed range of AUC is under 0.01 for every target (samples are 2,000 to 18,000); (2) removing politics lowers hgb AUC by under 0.02 on the sexual-morality items (the other answers already carry the ideology); (3) the largest loss is on abortion or same-sex marriage items, not on attendance; (4) the logit-vs-hgb gap of milestone 1 (+0.003 median) stays under 0.01 across seeds.
- Not done here: Hispanic split, the check of weighted shares against NORC's Data Explorer and `research/catholic-demography`, calibration plots, design-based variance.

## 2026-11-03 · Milestone 1 results: other answers predict unasked items well; associations transfer, levels do not

- Ran `experiments/m1_imputation/run.py` on the GSS 1972–2024 R3a (fit and test about 30 min on 2 cores). Tables are in `experiments/m1_imputation/results/summary.md`, and `summarise.py` rebuilds them from the committed CSVs.
- A first full run crashed in the temporal step. Some items were never on the same ballot before 2014, which left an all-missing feature column. Such columns are now dropped per training split, and the whole run was redone.
- **Headline.** Across 49 tradition × item cells, a model given a respondent's other answers beats the decade prior by a median 0.21 AUC. Its log loss is lower in 44 of the 49 (paired 95% interval below zero).
  - Among Catholics, boosting reaches 0.86 for weekly Mass attendance, 0.85 for "sex before marriage always wrong", 0.84 for same-sex relations, 0.88 for opposing same-sex marriage, 0.82 for cohabitation, 0.75 for abortion, 0.69 for divorce law and 0.71 for ever-divorced.
- **H1: mostly supported.** The four sexual-morality and marriage-belief items clear 0.75. Adultery (0.73) does not: almost everyone (77%) says it is always wrong, so there is little to rank. Divorce law stays under 0.70 as predicted. Ever-divorced reaches 0.71 with boosting (logistic 0.67), which breaks the "< 0.70" half of H1 for that model.
- **H2: supported.** The median boosting − logistic gap is +0.003 AUC. Only 4 of 49 cells have an interval wholly above +0.01, and 3 of those are ever-divorced, where age and exposure act nonlinearly. Logistic regression is never worse by more than 0.01.
- **H3: supported.** A model fitted only on third-plus-generation Catholics ranks foreign-born Catholics within 0.03 AUC of the pooled model on 12 of 13 items (ever-divorced −0.038). Its levels are wrong by more than 5 points on 5 of 13:
  - It under-predicts certainty about God by 11 points and opposition to same-sex marriage by 8.
  - It over-predicts belief in an afterlife by 10, support for harder divorce by 7 and ever-divorced by 8.
  - So the association structure largely travels to immigrants, but group levels do not. An imputation model must carry generation (and later country of origin) as a level term.
- **H4: refuted.** Scored on Protestants, a Catholic-fitted model loses a mean 0.011 AUC on Evangelicals, 0.005 on Mainline and 0.007 on Black Protestants. Black Protestants are not the worst. Again levels are the problem: on Evangelicals the Catholic model under-predicts "sex before marriage always wrong" by 17 points and averages 6.7 points low.
- **Descriptive** (Catholics, weighted share, by decade and generation; `shares_catholic_decade_generation.csv`):
  - Weekly Mass attendance fell from 41–48% in the 1970s to 14–19% in the 2020s, in every generation.
  - In the 2020s, foreign-born Catholics are the most likely to oppose abortion for any reason (62% vs 47% third-plus generation) and to hold papal infallibility (56% vs 37%).
- **Orthodox Christians:** only 27–205 GSS respondents per item, below the 300 floor, so no models were fitted. Global and Orthodox coverage waits on EVS/WVS/ISSP access (milestone 4).
- **Not yet checked against a published figure.** This is milestone 2's first task: compare the weighted shares with NORC's GSS Data Explorer and with `research/catholic-demography` once it lands. Still to do: fold seeds (one seed so far), calibration plots, design-based (PSU and strata) variance.

## 2026-11-03 · Session 1, plan for milestone 1 (written before the run)

- Data: GSS 1972–2024 cumulative cross-section, release 3a (NORC; `data/download.sh`, checksums in `data/SHA256SUMS` match the copy `research/marriage-divorce-evidence` records). 75,699 respondents; Catholic (relig 2), Orthodox (relig 10) and the three Protestant traditions of Steensland et al. (`reltrad` 1–3).
- Targets: 12 binary items coded as the answer consistent with Catholic teaching (Catechism paragraph in `src/gss.py`) or a practice level, plus ever-divorced among the ever-married and, for Catholics, papal infallibility.
- The GSS asks many items on only some ballots, so most "missing" answers are missing by design (at random). That makes it a fair test of imputation: predict an item a respondent was not asked from the ones they were.
- Planned analysis: 5-fold weighted cross-validation within each tradition. Models are the decade prior, L2 logistic regression and gradient boosting. Metrics are weighted AUC, log loss and Brier, with paired respondent bootstrap intervals (300 draws). Then a temporal hold-out (train ≤2014, test 2016–2024), an immigrant-generation transfer, a cross-tradition transfer and permutation importance.
- **H1.** Other answers predict the sexual-morality items well beyond the prior (AUC ≥ 0.75 among Catholics). Divorce law and ever-divorced are much harder (AUC < 0.70). *Refuted if* sexual-morality AUCs are below 0.75, or divorce-law AUC reaches them.
- **H2.** Gradient boosting beats logistic regression by less than 0.01 AUC on most items, as flexibility did not help in `marriage-divorce-evidence`. *Refuted if* the bootstrap interval for the boosting minus logistic AUC gap lies above 0.01 on most items.
- **H3.** A model fitted on third-plus-generation Catholics ranks first-generation (foreign-born) Catholics almost as well as the pooled model does (AUC loss ≤ 0.03), but its level is off: the mean prediction misses the first-generation share by more than 5 points on at least a third of items. *Refuted if* the AUC loss exceeds 0.03 on most items, or levels transfer within 5 points everywhere.
- **H4.** A Catholic-fitted model ranks Evangelical and Mainline Protestants within 0.03 AUC of their own models. It ranks Black Protestants worse, because party and ideology carry less information about sexual morality there. *Refuted if* the Black Protestant loss is no larger than the other two.
