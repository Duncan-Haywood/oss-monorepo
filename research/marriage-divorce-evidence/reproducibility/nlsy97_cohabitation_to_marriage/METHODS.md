# Before the wedding: do cohabiting couples marry or split up? (NLSY97, moved in 1994–2023)

Living together is now the usual step before marrying, so it is where a "before the wedding"
answer starts for most couples. This lens follows every NLSY97 respondent's **first
cohabiting union** from the month they moved in together. The respondents were born in
1980–84, and none had married before. It asks, year by year, whether the couple married each
other or split up first.

## Data

- **Source:** the NLSY97 all-variables public release, rounds 1–21 (1997–2023/24), from the
  BLS National Longitudinal Surveys. It is the same zip, checksum and streamed column extract as
  `../nlsy97_first_marriage/`: run that folder's `download.sh`, then set `NLSY97_WORK`. Nothing
  person-level is committed.
- **Checks:** the extract has 8,984 round-1 respondents, the BLS sample size. The codebook
  frequencies for `MAR_STATUS_2005.01` (0 never married, not cohabiting: 5,884; 1 cohabiting:
  1,312; 2 married: 1,260; and so on) fix the coding used here.

## Sample and outcomes

- **Spells:** 6,020 respondents had a first cohabiting month (`MAR_STATUS` = 1) with no
  marriage before it. 2,961 never cohabited and 3 married first.
- **Partner:** the union's partner is `MAR_PARTNER_LINK` in the first cohabiting month.
- **Married the partner:** the first later month whose status is married (2) with the same
  partner link, or with no link recorded. That gives 2,109 couples.
- **Split first:** 3,481 couples. A spell counts as split in the first later month that is
  anything else: not cohabiting, separated or divorced, married to a different partner, or
  cohabiting with a different partner.
- **Censored:** 430, at the respondent's last valid month.
- **Clock:** NLSY97 continuous months. Exposure runs from move-in to the event, split into
  years together (0 = first year): 18,613 intervals and 15,625 person-years. The weights are
  round-1 sampling weights normalised to mean 1, and every fold is clustered on the respondent
  (one spell each).
- **Inputs, fixed at move-in:**
  - years together (time-varying);
  - the respondent's age at move-in and sex;
  - race-ethnicity;
  - the highest credential by move-in, from the dated degree variables;
  - children born before move-in;
  - the household at age 12;
  - the parents' highest grade;
  - the ASVAB math-verbal percentile (tested 1997–98);
  - the religion raised in;
  - the calendar year of move-in.

**Partner traits are left out on purpose.** The partner section's age, schooling, earlier
marriage and children are recorded in a way that depends on how the union ended, so using them
would leak the outcome:

| Partner item | Splits where known | Splits where unknown |
| --- | --- | --- |
| Partner's schooling | 87% | 47% |
| Earlier marriage or children | 33% | 63% |
| Age gap | 57% (present) | 82% (missing) |

`sample_audit.json` (`partner_item_leakage`) keeps these rates. With the partner items
included, the split model's held-out gain looked like 14.9%. Without them it is 9.3%.

## Models and held-out evaluation

Each outcome gets three yearly Poisson hazard models, each evaluated with 5 folds by person:

- years together only, a spline (the baseline curve);
- an additive spline Poisson model on all inputs;
- a depth-3 Poisson tree.

The score is weighted Poisson deviance against a constant rate.

| Target | Model | Deviance gain vs constant | Fold range |
| --- | --- | --- | --- |
| Married the partner | Years together only | 2.8% | 1.9–3.6% |
| Married the partner | **Additive spline** | **4.9%** | 4.4–5.7% |
| Married the partner | Tree, depth 3 | 3.9% | 2.4–5.0% |
| Split first | Years together only | 4.7% | 3.9–5.5% |
| Split first | **Additive spline** | **9.3%** | 7.6–10.4% |
| Split first | Tree, depth 3 | 7.6% | 6.1–8.7% |

## Results (`cumulative_incidence.csv`, weighted Aalen–Johansen; whichever comes first)

- **All first cohabitations:** 13.1% had married the partner within 1 year, 29.4% within 3,
  36.0% within 5 and 39.1% within 10. 27.0%, 45.2%, 51.3% and 55.3% had split first by the same
  points.
- **Credential at move-in:** with a bachelor's degree or more, 63.5% married the partner within
  10 years and 29.9% split first. With no high-school credential, the figures were 21.4% and
  74.2%.
- **Age at move-in:** under 20, 25.3% married and 72.4% split. At 26–29, 51.9% married and
  39.1% split.
- **Children before move-in:** none, 40.8% married; two or more, 20.9%.
- **Additive-model rate ratios** (`additive_partial_effects.csv`), with everything else held
  fixed:
  - splitting: each year together lowers the split rate (0.78 after 1 year, 0.40 after 5), and
    moving in at 28 rather than 20 gives 0.57;
  - marrying the partner: a bachelor's degree gives 1.28 against an associate degree, no
    high-school credential 0.61, and two or more prior children 0.79;
  - later cohorts marry less: move-in in 2016 gives 0.67 against 2004.

These are associations in one U.S. cohort, reported by one partner. They are not causes.

## Using the bundles

`app/models/nlsy97_cohab_marriage.json` and `nlsy97_cohab_split.json` have `stage: before`.
`how_to_combine` gives the exact yearly competing-risks split. After the wedding, hand over to
`nlsy97_first_marriage`, the same cohort's first-marriage lens. The bundles abstain for people
already married or married before, and for inputs outside `support`. Same-sex unions are not
identified in this construction.

`tests/nlsy97_cohab.test.mjs` checks the engine against Python on 300 predictions to 10⁻⁹.

## Reproduce

```sh
sh ../nlsy97_first_marriage/download.sh        # zip + streamed extract into $NLSY97_WORK (~8 min)
NLSY97_WORK=<work dir> python3 train_models.py # ~2 min
```
