# SaaS Feature Packaging Optimizer

A free browser tool for SaaS founders: **paste what each surveyed customer would pay per month for each feature, and get which features belong in which plan and the plan prices that earn the most profit**, who lands on each plan, what each feature is worth in each plan, and what that is worth against your current packaging.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/saas-feature-packaging-optimizer/

After using this, you can **decide the contents and prices of a Good-Better-Best ladder from one survey**, which used to take a spreadsheet of guesses or a paid pricing consultant. It is the companion to `saas-tier-price-optimizer`, which prices plans whose contents you have already fixed.

## Model

- Each respondent gives the most they would pay per month for each feature on its own (blank or `-` = no value) and optionally a weight. A feature name ending in `*` is locked into the cheapest plan (use it for the core product).
- Plans are nested: a feature first placed in plan N is in plan N and every higher plan. A plan's value to a person is the sum of their values for the features in it.
- A respondent buys the plan with the largest surplus (value minus price); a tie goes to the higher-priced plan; nobody buys at negative surplus.
- Prices form a ladder (each plan costs at least the one below) and never fall below the cost to serve. Profit = sum over buyers of `price - cost`.
- Search: local search over placements (move one feature to another plan or off the menu, or swap two features) from four starting points, priced with a quick grid of surveyed values, then the two best optima are climbed again with exact prices (profit only changes where a respondent switches plan, so only those prices need testing). Tests check it against exhaustive search on small random surveys and check that no single price move improves the answer.
- Output also shows, per feature, the profit if it alone were placed in each other plan or dropped, a 10% price-sensitivity table, and the best single flat plan with every feature as a baseline.

Not modelled: features that only matter together or substitute for each other (additivity is assumed), annual billing, trials, free tiers, usage limits, seat counts, churn and lifetime value, competitors, stated-versus-real willingness to pay (stated values usually run high; test the top candidate on real signups).

Up to 3 plans, 8 features and 500 survey lines. The search is a heuristic for 8 features; the page says so.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance, investment or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
