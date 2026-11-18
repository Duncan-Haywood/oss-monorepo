# Pre-registration: the shipped synthetic control on two real few-donor panels (2026-11-18)

Written and committed before any synthetic control was fitted to either panel in this repository. The only things
looked at beforehand are the raw files (their units, years and column names, printed by `eval/few-donor-panels.mjs`)
and the published papers' results quoted below.

## Why

Every real test of the synthetic control so far used Proposition 99's 38-state donor pool. The flagship row asks for
"a real deployer's panel, few donors": the case a user is likelier to have (a handful of stores, regions or countries).
With J donors the placebo p cannot go below 1 / (J + 1), so with 16 donors the smallest p is 0.059 and "p <= 0.05" is
out of reach whatever happened. The CLI prints the smallest p in brackets; it does not say what that means.

## Panels (no values changed; `data/SOURCE.md`)

- **West Germany, reunification 1990** (Abadie, Diamond and Hainmueller 2015, AJPS): GDP per head (PPP, 2002 USD) of
  17 OECD countries, 1960-2003; 16 donors. Published (with covariates): weights Austria 0.42, USA 0.22, Japan 0.16,
  Switzerland 0.11, Netherlands 0.09; GDP per head about 1,600 USD a year lower on average over 1990-2003; West
  Germany's post/pre RMSPE ratio the largest of the 17 (p = 1/17); an in-time placebo at 1975 shows no gap.
- **Basque Country, terrorism from about 1970** (Abadie and Gardeazabal 2003, AER): GDP per head (thousands of 1986
  USD) of 17 Spanish regions, 1955-1997; 16 donors. Published (with covariates, fitted on the 1960s): Catalonia 0.851,
  Madrid 0.149; a gap of about 10% of GDP per head opening in the mid-1970s.

## What is run (`node eval/synth-few-donors-real.mjs`, `eval/synth-few-donors-real.out.txt`)

The shipped CLI defaults only (`synthResult` in `synth-cli.mjs`: outcome-only fit on every point before the date,
the floored ratio, placebo pool without the treated unit), on levels:

- G: `--column WestGermany --known-date 1990 --donors all`, window 1960:2003.
- B: `--column BAS --known-date 1970 --donors all`, window 1955:1997.
- In-time placebos: G with window 1960:1989 and date 1975; B with window 1955:1969 and date 1965.
- Leave-one-out (Abadie et al. 2015's robustness check): G and B refitted with each donor of weight at least 0.05
  removed from the pool, one at a time.
- Both panels with `--covariates` (`data/oecd-covariates-1989.csv`, `data/spain-regions-covariates-1969.csv`) for the
  balance table, which changes no p.

## Bars

1. **G estimate.** Mean gap over 1990-2003 between -2,500 and -800 USD, gap at 2003 below 0, and at least 60% of the
   weight on the paper's five countries (Austria, USA, Japan, Switzerland, Netherlands).
2. **G test.** Floored rank 1 of 17 (p 0.059, the smallest 17 units allow).
3. **B estimate.** Mean gap over 1970-1997 below 0 and above -1.5 (thousand USD), and at least 60% of the weight on
   Catalonia and Madrid together.
4. **B test.** Floored rank at most 3 of 17 (p <= 0.176). A weak guess; the paper reports no in-space p for the
   1955-1969 fit used here.
5. **In-time placebos.** Neither fake date ranks 1 (p > 0.059 at both).
6. **Leave-one-out.** In G and B, every leave-one-out refit keeps a negative mean gap after the date.

Reported, no bar: the before-fit RMSPE and its placebo share, the paper's plain-ratio rank, and the balance table's
warnings.

## Product change decided now, whatever the bars say

When the smallest attainable p is above 0.05 (fewer than 19 donors), the CLI and the page say so in words: p <= 0.05
cannot be reached with this many donors, so rank 1 is the strongest result the test can give and a "p 0.059" is that
result, not a near-miss. This is arithmetic on the permutation test, not a finding, and ships either way.
