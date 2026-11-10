# heavy-market log

## 2026-11-10, milestone 1a: depreciation and size scaling from real auction prices

- The session's proxy blocked the Open Source Ecology wiki, USACE and manufacturer sites, so the
  sourced new-price and BOM side of milestone 1 waits. A public GitHub mirror of Kaggle's Blue
  Book for Bulldozers data did clone; it gives real used prices.
- Built a two-way fixed-effects estimator (alternating projections, clustered SE), checked on
  synthetic data with a known slope and a confounding sale-year trend (4 tests pass).
- Results as in the README: excavators 6.5%/yr, skid steers 3.8%/yr; every class depreciates
  two to four times faster in years 0 to 10 than after; nearly new excavator price ~ weight^0.634.
- Open item: Kaggle's competition rules were not readable from the session. Only aggregates are
  published; check the rules before a paper uses the data.
