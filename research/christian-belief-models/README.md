# Can a Catholic's other survey answers predict the beliefs on marriage, sexuality and devotion they were never asked?

**Headline (milestone 1, US General Social Survey 1972–2024):** yes, mostly. Given a Christian respondent's other answers, a model predicts an item they were never asked far better than the share for their decade: a median +0.21 AUC across 49 tradition × item cells.

Among Catholics, the AUC for each item is:

| Item | AUC |
|---|---:|
| Weekly Mass attendance | 0.86 |
| "Sex before marriage always wrong" | 0.85 |
| Same-sex relations always wrong | 0.84 |
| Opposes same-sex marriage | 0.88 |
| Cohabitation not acceptable | 0.82 |
| Opposes abortion for any reason | 0.75 |
| Adultery always wrong | 0.73 |
| Divorce should be harder to get | 0.69 |
| Has ever divorced | 0.71 |

The associations travel between groups, but the levels do not:

- A model learned on third-generation Catholics ranks foreign-born Catholics almost as well as a model that saw them (within 0.03 AUC on 12 of 13 items). But it misses their share by more than 5 points on 5 items, for example certainty about God by 11 points.
- A Catholic-trained model ranks Evangelical, Mainline and Black Protestants within about 0.01 AUC of their own models. But it under-predicts Evangelical sexual conservatism by up to 17 points.

Gradient boosting adds almost nothing over logistic regression (median +0.003 AUC).

Research programme, AI-assisted (Claude), on the owner's request: [`PROPOSAL.md`](PROPOSAL.md), [`LOG.md`](LOG.md) (hypotheses written before each run, then outcomes), full tables in [`experiments/m1_imputation/results/summary.md`](experiments/m1_imputation/results/summary.md).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/christian-belief-models/

![AUC by item and tradition](experiments/m1_imputation/results/auc_by_item.svg)

## What it asks

The programme asks how well survey models predict an individual's unanswered religious items:

- Catholic teaching adherence on marriage and sexuality
- devotional practice
- marriage outcomes

It also asks whether the associations a model learns hold across Catholic, Protestant and Orthodox subcultures, across decades, for immigrants and their children, and (milestone 4) across countries.

The GSS asks most of these items on only some ballots. So most "missing" answers were missing by design, which makes this a fair test of imputation. Each target is coded as the answer consistent with the Catechism of the Catholic Church (paragraph per item in [`src/gss.py`](src/gss.py)), or as a practice level. That code describes agreement with a stated teaching, not a judgement of anyone's faith.

## Scope

The programme uses anonymised public survey microdata only. "Prediction" means filling a survey respondent's unasked item and measuring how wrong that is. It is not a tool for inferring a named person's religion or beliefs (religious belief is special-category data under GDPR Art. 9), and it is not built for screening or targeting.

## Reproduce

```sh
sh data/download.sh                  # NORC GSS 1972–2024 R3a, checksums in data/SHA256SUMS (~600 MB, not committed)
python3 experiments/m1_imputation/run.py        # ~30 min; writes experiments/m1_imputation/results/*.csv
python3 experiments/m1_imputation/summarise.py  # summary.md and the figure, from the committed CSVs
python3 -m pytest test_recode.py
```

Needs `pandas`, `numpy` and `scikit-learn`. Set `GSS_DTA` to point at an existing `gss7224_r3a.dta`.

## Limits so far

- One fold seed.
- Intervals come from a respondent bootstrap, not the GSS's design-based (PSU and strata) variance.
- Attendance is self-reported, and self-reports run high (Hadaway et al. 1993).
- Shares are not yet checked against NORC's own tables.
- The GSS has 27–205 Orthodox respondents per item, too few to model.
- Global and immigrant-origin data (EVS/WVS, ISSP, Pew) need archive registration, which is an owner step.

The sibling programme [`research/catholic-demography`](https://github.com/Duncan-Haywood/oss-monorepo/pull/12893) estimates Catholic subgroup *levels*. [`research/marriage-divorce-evidence`](../marriage-divorce-evidence) models divorce with religion as a predictor.

GSS citation: Davern, Bautista, Freese, Herd and Morgan, *General Social Survey 1972–2024* [machine-readable data file], NORC at the University of Chicago, gss.norc.org.
