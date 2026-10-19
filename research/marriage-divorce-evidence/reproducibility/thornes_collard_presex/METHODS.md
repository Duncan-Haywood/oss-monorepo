# Thornes & Collard (1979): pre- and extramarital sex and divorce

A 16-cell table: 1,036 British people, divorced or still married, by gender and by whether
they reported sex before marriage (with anyone) and sex outside the marriage. It comes from
Thornes & Collard, *Who Divorces?* (Routledge & Kegan Paul, 1979), as reported in
G. N. Gilbert, *Modelling Society* (Allen & Unwin, 1981). It is shipped in the R package
`vcd` (GPL-2) as `PreSex`. `download.sh` fetches the Rdatasets CSV and checks its SHA-256.

## Why it is only an odds-ratio table

494 of the 1,036 people (48%) are divorced, far more than in any general population. The
divorced and married groups were evidently recruited for comparison, and the share divorced
reflects that recruitment, not a risk. Odds ratios remain valid under that kind of sampling
(case-control), so that is all `analyze.py` reports. It gives a Woolf 95% interval for each
gender and a Mantel–Haenszel odds ratio across genders. It produces **no model bundle and no
number for the app**: a probability of divorce cannot be read from this design.

## Results (`odds_ratios.csv`)

| Reported | Women | Men | Gender-adjusted (MH) |
| --- | --- | --- | --- |
| Premarital sex | 3.19 (2.01–5.07) | 2.62 (1.69–4.05) | 2.88 (2.10–3.96) |
| Extramarital sex | 8.58 (4.01–18.35) | 4.03 (2.15–7.55) | 5.73 (3.55–9.24) |

These are odds of being in the divorced group rather than the married group.

## Limits

- One British study from the 1970s, with the timing of each answer unknown. Extramarital
  sex may be a symptom of a marriage already failing rather than a cause, and it is reported
  after the fact.
- Premarital sex comes before the marriage, but it also stands in for age, cohort, religion
  and other unmeasured differences.
- These are associations only.
