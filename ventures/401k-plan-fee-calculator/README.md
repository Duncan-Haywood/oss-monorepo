# 401(k) Plan Fee Calculator

A free browser tool for small-business owners and plan committees: **enter your funds, recordkeeper, advisor and admin fees and see the
all-in cost as a percent of assets and per participant, the gap to an editable size benchmark, and what that gap costs an average
participant over time.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/401k-plan-fee-calculator/

After using this, you can now **put a dollar figure on whether your 401(k) plan is expensive for its size**, which used to take a paid
benchmarking report or a recordkeeper telling you the plan is "competitive".

## Use

1. Open `index.html`, list funds as `name, balance, expense ratio %`, fill in the other fees from your 408(b)(2) disclosure, click Calculate plan cost.
2. Pure logic is in `calc.mjs` (`plan()`, `parseFunds()`, `parseBenchmarks()`); tests: `node --test`.

Modelled: fund expense ratios, asset-based/flat/per-participant recordkeeping, advisor and admin fees, employer-paid share, an editable
benchmark by plan size, a participant balance projection. Not modelled: service quality, revenue-sharing credits, per-transaction fees.
The default benchmark is illustrative, not a legal standard or a survey figure. Not legal, tax or financial advice. No warranty; see the
page footer. MIT licensed (`LICENSE`).

## What you use today, and what this does differently

- **Your recordkeeper's 408(b)(2) disclosure and fee statement:** the authoritative numbers, but spread across several documents and rarely turned into one all-in percentage of assets or a per-participant figure.
- **A paid benchmarking report or a consultant:** gives a size-matched comparison, at a cost small plans often skip. Here the benchmark is an editable, illustrative table you can replace with a quote you trust.
- **A spreadsheet:** flexible, but the blend of fund expense ratios, flat and per-head fees and the employer-paid share is yours to build and check.
- **What this adds:** the all-in cost as a percent of assets and per participant, the gap to a benchmark, and a projection of what that gap costs an average participant, with no signup and no upload.
