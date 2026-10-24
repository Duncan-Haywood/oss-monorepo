# Before the wedding: do unmarried couples marry or break up? (HCMST 2009–2017)

The owner's question (2026-10-20) is divorce risk **before** marrying, for a couple or a
potential partner. Every other lens starts at the wedding. This one starts earlier. It takes
couples who were together but **not married** in early 2009 (dating or living together,
different-sex or same-sex) and follows them to 2017, asking two things for each follow-up
period: did they marry each other, and did they break up first?

## Data

- **Source:** *How Couples Meet and Stay Together* (HCMST), Stanford University (Rosenfeld,
  Thomas & Falcon 2018). The files are public version 3.04 (waves 1–3) and the wave 4, 5 and 6
  supplements, from `stacks.stanford.edu`, druid `ns183dp7831`. These are the same four files
  as the HCMST couples lens (`../hcmst/`), with the same checksums.
- **Licence:** the Stanford Digital Repository record (`https://purl.stanford.edu/ns183dp7831`,
  read 2026-10-20) states an **Open Data Commons Public Domain Dedication and License (PDDL)
  1.0**, and the user agrees not to use the data to identify anyone. `../hcmst/METHODS.md`
  quotes the older data.stanford.edu agreement. Git holds only code, checksums, aggregates and
  fitted parameters either way.
- **Download:** `stacks.stanford.edu` chains to *emSign Root CA - G1*, which is missing from
  the cloud session's CA store. It was taken from certifi's Mozilla bundle; TLS verification was
  never turned off.

## Sample and outcomes

- **Couples:** the 1,081 respondents who were partnered but not married at wave 1
  (Feb–Apr 2009): 703 different-sex and 378 same-sex. 939 were re-interviewed at least once and
  contribute 2,234 couple-periods.
- **Periods:** the same five follow-up periods as the HCMST couples lens, ending about 1.1,
  2.2, 4.1, 5.8 and 8.4 years after wave 1. They run between the cohort's median interview
  months: 2009-02, 2010-03, 2011-04, 2013-03, 2014-12 and 2017-07.
- **Marriage:** the first wave that reports marrying the same partner (`w2_q7`, `w3_q7`,
  `w4_q7`, `w5_q7`, `w6_got_married` = yes). Waves 4–6 ask for the wedding year and month,
  which place 79 of the 160 weddings in their period. The other weddings fall in the period
  ending at the reporting wave.
- **Break-up before marrying:** HCMST's derived break-up, with its timing, from
  `../hcmst/hcmst_data.py`, so the couples lens and this lens agree. The partner's death
  censors the couple.
- **Whichever comes first** ends the couple's time at risk: 160 couples married, 400 broke up
  first, 29 partners died, and 492 are censored. Of the 160 who married, **9 broke up after
  the wedding** and 151 were still together at their last report. HCMST is far too short and
  too small to say whether these marriages last. After the wedding, the app should hand over
  to a marriage lens such as NSFG.
- **Inputs:** wave-1 answers only, coded exactly as in the couples lens: relationship quality,
  living together, couple type, couple race, prior marriage, parental approval, religion pair,
  how they met, mean age and age gap, years of schooling and gap, household income, and
  children in the household. `relationship_years` and `mean_age` are advanced to the start of
  each period.

## Models and held-out evaluation

Two cause-specific discrete-time logistic models are fitted on the couple-periods: P(marry in
the period) and P(break up in the period), each among couples together and unmarried at its
start. The weights are HCMST `weight2` (partnered respondents), normalised. Folds are 5, by
couple, with a seeded shuffle. The score is weighted log loss against a constant probability.

| Target | Model | Log-loss gain vs constant | Fold range | AUC |
| --- | --- | --- | --- | --- |
| Marriage | Period only | −1.3% | −5.7 to 1.4% | 0.481 |
| Marriage | **Additive logistic** | **7.9%** | 1.4 to 20.5% | **0.726** |
| Marriage | Additive, harmonized (no parents' view or religion) | 7.7% | 1.4 to 21.0% | 0.716 |
| Marriage | Tree, depth 2 | −1.6% | −9.7 to 12.6% | 0.564 |
| Break-up | Period only | 1.6% | 0.1 to 3.2% | 0.566 |
| Break-up | **Additive logistic** | **9.3%** | 5.9 to 12.8% | **0.706** |
| Break-up | Additive, harmonized | 8.7% | 4.9 to 11.6% | 0.700 |
| Break-up | Tree, depth 2 | 3.1% | −0.4 to 9.7% | 0.631 |

There are only 160 weddings, so the marriage model's skill varies a lot between folds.

## External check on a later cohort: HCMST 2017–2022 (`external_validation_hcmst2017.csv`)

HCMST drew a fresh sample in 2017: 3,510 adults, 2,862 of them partnered, re-interviewed in
2020 (2,107) and 2022 (1,722). The file is *small public version 2.2*, the same file and checksum
as the HCMST couples lens. Its 777 couples who were together but unmarried in July 2017 were
scored with the **2009-trained harmonized models**, which leave out parents' view and religion
because 2017 did not ask about them. Nothing was refitted. Inputs are coded by
`../hcmst/hcmst_data.py` `couples_2017()`.

- **Outcomes:** whichever came first, marrying the 2017 partner or breaking up with them, by
  the 2020 wave and by the 2022 wave. Partner deaths, and couples not seen at the end of a
  window with no earlier event, are left out of that window.
- **Weddings newly reported in 2022:** they carry `w3_when_married_yr`, but their derived
  `w3_partner_type` still says "unmarried". The wedding year plus `w3_partner_source` = 1 (the
  current partner is the 2017 partner) is what marks them: 8 weddings that the status field
  alone misses.
- **Horizons:** the models' period sums end at 2.2 years for the 2020 window and 4.1 years for
  2022. The real windows are somewhat longer, so predicted shares would, if anything, run low.

| Window | Outcome | Couples | Events | Observed (weighted) | Predicted | AUC |
| --- | --- | --- | --- | --- | --- | --- |
| 2017→2020 | Married | 400 | 65 | 16.5% | 15.8% | **0.767** |
| 2017→2020 | Broke up first | 400 | 131 | 33.1% | 34.4% | **0.838** |
| 2017→2022 | Married | 352 | 73 | 21.7% | 21.6% | **0.786** |
| 2017→2022 | Broke up first | 352 | 151 | 43.8% | 44.9% | **0.847** |

The 2009 models rank the 2017 couples at least as well as they ranked held-out 2009 couples.
Their overall shares land within 1.5 points of what happened. The depth-2 trees do worse (AUC
0.69–0.77), and the period-only baseline has no ranking skill by construction. This is one
external cohort from the same survey design and the same kind of panel, so it shows the models
travel across eight years, not across populations.

## Results (`cumulative_incidence.csv`, weighted, whichever event comes first)

- **All unmarried couples:** 6.6% had married by about 1.1 years, 17.6% by 4.1 years and 21.9%
  by 8.4 years. 26.8%, 48.7% and 54.0% had broken up first by the same points.
- **Relationship quality in 2009:** couples who called it "excellent" married 37.0% of the time
  by 8.4 years and broke up first 40.3% of the time. For "good" the figures were 11.2% and
  59.0%; for "fair", 4.1% and 79.3%.
- **Living together:** cohabiting couples married 34.0% of the time and broke up first 35.7%.
  Couples living apart married 14.3% of the time and broke up first 65.1%.
- **Parents' view:** couples whose parents approved married 31.6% of the time and broke up
  first 44.2%. Where parents were neutral or unsure, the figures were 11.3% and 70.1%.
- **Same-sex couples** married far less often before 2015, when U.S. marriage law changed: 15%
  of male couples and 17% of female couples had married by 8.4 years. That reflects the law of
  the time as much as the couples.
- **Additive-model odds ratios** (`*_odds_ratios.csv`), holding the other inputs fixed:
  - marriage: 2.48 for living together, 0.41 for "good" rather than "excellent" quality, 0.26
    for "fair", 1.34 per extra year of mean schooling and 0.68 per child in the household;
  - break-up: 0.36 for living together, 1.73 for "good" and 2.79 for "fair" quality, and 0.96
    per year the relationship has already lasted.

These are associations in one cohort (2009–2017), reported by one partner. Who chooses to
cohabit or to rate a relationship "excellent" differs in ways the survey does not measure.

## Using the bundles

`app/models/hcmst_dating_marriage.json` and `hcmst_dating_breakup.json` each hold the
additive logistic model, the harmonized additive model (externally checked, and usable when a
person skips parents' view or religion), a period-only baseline and a depth-2 tree.
`stage` is `before`, as in `couple.js` (#8713). `how_to_combine` in each bundle gives the
calculation:

- still dating: S<sub>k</sub> = S<sub>k−1</sub>(1 − m<sub>k</sub> − b<sub>k</sub>);
- P(married by period k) = Σ S<sub>j−1</sub> m<sub>j</sub>.

The two models are fitted separately, so treat their combination as approximate. Both
bundles are listed in `models/index.json` without a form adapter. They abstain for couples
already married, inputs outside `support`, and horizons beyond about 8.4 years.
`tests/hcmst_dating.test.mjs` checks the engine against Python on 320 predictions (to 10⁻⁹).

## Reproduce

```sh
sh download.sh            # the four HCMST 2009 files into raw/, checked and unzipped
pip install -r requirements.txt
python3 train_models.py   # ~20 s; CSVs here, ../../app/models/hcmst_dating_*.json
```
