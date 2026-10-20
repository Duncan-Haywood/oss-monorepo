# U.S. death rates for the lifelong-marriage estimate (UN WPP 2024)

The app's "lifelong" figure was missing one thing: a marriage that does not end in divorce
ends when a partner dies. This folder supplies official U.S. death rates so the app can
split each future year between divorce and widowhood instead of saying mortality is not
modelled.

## Source and licence

- **Data:** United Nations, DESA, Population Division (2024), *World Population Prospects
  2024*. The table used is `mx1dt`: central death rates by single year of age (0–100+),
  sex and calendar year (1950–2100; the medium-variant projection after 2023). Life
  expectancy at birth (`e01dt`) is used for the check.
- **Copy:** the `wpp2024` R data package that the WPP team's collaborators maintain on
  GitHub (`PPgp/wpp2024`), pinned to commit `2da7768`. SSA, CDC/NCHS and the Human
  Mortality Database were unreachable (HTTP 000) on 2026-10-20. Checksums are in
  `SHA256SUMS`. `mx1dt.rda` is 87 MB and is not committed.
- **Licence:** CC BY 3.0 IGO, "© 2024 United Nations, DESA, Population Division". The
  committed derivative, `../../app/data/us_mortality_wpp2024.json`, keeps only the United
  States (country code 840), ages 15–100 and years 2024–2100, rounded to 6 significant
  figures. Those changes are stated in its `licence` field, as the licence requires.

## Check

`extract.py` recomputes life expectancy at birth from the single-age rates, assuming a
constant hazard within each year of age and 1/m for the open 100+ group. It compares the
result with the UN's own e0 for 12 estimate years from 1950 to 2023, for both sexes
(`e0_check.csv`). The largest difference is 0.020 years (1950, men). From 1980 on, every
difference is 0.002 years or less: 2023 gives 76.862 against 76.864 for men and 81.847
against 81.849 for women. The UN table gives estimates only, so the projected years can't
be checked this way.

## How the app should use it (`../../app/mortality.js`)

`competingRisks(table, a, b, startYear, divorceRates)` takes each partner's sex and age at
the wedding, the wedding year, and a lens's annual divorce rates for each marriage year.
Each year has three constant hazards: divorce, death of a, death of b. So each year's
split is exact: the probability that the first event is a divorce in year k is
married(k−1) × h<sub>d</sub>/h × (1 − e<sup>−h</sup>). Death rates follow the calendar year
(cohort, not period) and the partners' ages. The function returns P(divorce first),
P(widowhood first) and P(still married at the end of the rates given). If a lens gives no
number for a year (`null`), the calculation stops there. The rest is reported as
unresolved, never guessed. `tests/mortality.test.mjs` checks it against the Python
reference on 24 couples to within 10<sup>−9</sup>.

Examples (`summary.json`), for a man and a woman both aged 30 and marrying in 2025:

- With no divorce at all, the chance both are alive is 97.2% after 10 years, 93.3% after
  20, 86.1% after 30, 75.4% after 40 and 58.2% after 50.
- With a constant divorce rate of 1% a year, 37.7% of such marriages end in divorce and
  62.3% in widowhood.

## Limits

- These are population averages. Married people die at lower rates than average, and
  spouses' deaths are correlated (shared lifestyle, and the "widowhood effect"). Neither is
  modelled, so joint survival is somewhat understated.
- Rates after 2023 are UN projections, not observations.
- There is one national table. No adjustment is made for race, education, income or
  region, which all shift mortality a lot.
