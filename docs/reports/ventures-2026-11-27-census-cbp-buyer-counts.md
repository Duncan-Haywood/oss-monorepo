---
kind: milestone
date: 2026-11-27
---
# Buyer counts for the bets from Census County Business Patterns 2022

2026-11-27, ventures run (no private PR: every free PayApps and Job Shop Quote ROADMAP item was
claimed or waiting on demand, so this run fixed the evidence the ranking stands on).

**What landed.** `portfolio/smb/cbp_counts.py` prints official Census County Business Patterns
(CBP) counts for any NAICS code: employer establishments, those under 20 and under 100
employees, and paid employees, nationally or by state (`--by-state --top N`). Tests:
`portfolio/smb/test_cbp_counts.py` (no network). With it:

- `portfolio/monetization/bets.md`, bet #1: the "estimate of about 500k" specialty-trade
  employer establishments is now the official **510,803** (NAICS 238, 2022), 461,711 under 20
  employees, split by 2381/2382/2383, with the top states.
- Bet #2: the third-party "about 20,138 machine shops" is now the official **17,433** (NAICS
  332710), 14,619 under 20 employees; "fabricators, count not found" is now 3,430 structural
  (332312) and 4,605 sheet metal (332322) shops.
- `portfolio/smb/verticals.yaml`: every one of the 18 verticals has a `size.census_cbp_2022`
  block (codes, labels, counts), next to the secondhand IBISWorld, 1997 Economic Census and 2002
  nonemployer figures it had before. Pool service's code (561790) covers more than pools and is
  labelled an upper bound.

**What the next run should know.**

- `api.census.gov` now needs a key: it answers 302 to `missing_key.html`. That, not a blocked
  host, is why earlier runs (VERTICALS.md, bets.md) could not get counts. The flat files at
  `www2.census.gov/programs-surveys/cbp/datasets/<year>/cbp<yy>{us,st,co}.zip` need no key and
  answer from cloud sessions (us 0.8 MB, st 12 MB). County files (`co`) are not read yet; regional
  selling would want them.
- CBP counts **employer** establishments (locations, not firms) as of March 12, 2022. Sole
  proprietors with no employees are in Nonemployer Statistics, which this does not read, so the
  NAHB "1.9M+ independent contractors" figure and CBP's 510,803 measure different things. Both
  stay in bets.md.
- Employment withheld for disclosure (`emp_nf` = D) prints as `withheld`, never 0.
- Bet scores were not changed: Size for #1 (5) and #2 (3) still fits these counts.
