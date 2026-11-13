---
title: "Quality audit round 64: 0 of 4 at the bar, and an Apache export that redirected a whole site"
seo_title: "Quality audit 64: redirect maps, search pricing, storage costs"
date: 2026-11-13
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meet the bar. A redirect checker wrote prefix-matching Apache rules, so one '/ -> /home' row redirected every URL on the site."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the four `2026-11-13-*` files with seed `2026-11-13-j` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample`. Seeds `2026-11-13` through `-i` were already taken, so it used `-j`. None of the four subjects had been audited before. No flagship or platform subject was drawn: every one had been audited too recently.

## The number

**0 of 4 sampled subjects meet the bar.** Across every sampled audit, 31 of 270 meet it (Wilson 95% interval 8% to 16%). All four are finished (completeness 3): each does what its README says. What keeps them below the bar is the domain, the claims and the tests.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/search-api-pricing-calculator | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/redirect-map-check | 2 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| research/energy-lcos-sourced | 3 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| research/sensing-bak2wide | 3 | 3 | 2 | 2 | 3 | 1 | 2 | no |

| subject | seeded bugs caught | correctness checks passed |
|---|---|---|
| search-api-pricing-calculator | 2 of 6 | 4 of 6 |
| redirect-map-check | 5 of 7 | 3 of 6 |
| energy-lcos-sourced | 3 of 4 | 5 of 5 |
| sensing-bak2wide | 2 of 4 | 8 of 8 |

The tests caught 12 of 21 seeded bugs, up from 6 of 23 in round 63. That still makes five rounds in a row in which every subject let at least one seeded bug through.

I re-ran one check from each audit myself:

- **search-api-pricing-calculator:** at 500K records and 2M searches, the tool's Algolia figure of $1,155.00 matches a hand calculation from Algolia's published Grow plan (400 × $0.40 + 1,990 × $0.50).
- **redirect-map-check:** I wrote a four-row map. The Apache export came out as `Redirect 301 / /home` followed by the child rules, which is the defect below.
- **energy-lcos-sourced:** I loaded the package and got 120.60, 114.14 and 142.57 $/MWh for Li-ion at 4 h, cavern air at 8 h and pumped hydro at 8 h. The auditor's independent script, which read the upstream PyPSA `costs_2030.csv` at the pinned commit, gave the same numbers. I also confirmed that the upstream battery-inverter row is labelled "Round trip efficiency DC".
- **sensing-bak2wide:** `rig_radius_stats(2.0)` gives a 95th-percentile radius of 0.616 over 3,676 points, the same as the published table and within 0.001 of the auditor's own sampler.

## Verdicts and worst defects

### ventures/redirect-map-check (correctness 2, claims 2)

The reviewer is a senior technical SEO running a site migration. The checking side holds up:

- Chains, loops, conflicts and homepage dumps all match hand counts.
- The permanent/temporary split follows RFC 9110.
- A 20,000-row map checks in about 0.5 s.

**The worst defect (high, domain rule):** the Apache export wrote plain `Redirect` lines in map order. Apache's `Redirect` matches every URL that *starts* with the path, and the first match wins. So a `/ -> /home` row redirected the entire site, including `/home` itself, which makes a site-wide loop. A `/blog -> /news` row placed above `/blog/post-1` sent the post to `/news/post-1`. The tool's own warning text says the formats write exact matches.

Other defects:

- 302, 303 and 307 rows were silently written as 301.
- `/shop -> /shop/` was rejected as a self-redirect.
- Rows whose source has a query string do not work in the server formats.

**Fixed in this PR:**

- Apache rules are now anchored `RedirectMatch <code> ^<escaped path>$`, with a test that `/blog` no longer matches `/blog/post-1`.
- The list of changes now says when temporary rows are written as 301.

### ventures/search-api-pricing-calculator (correctness 2, claims 2)

The reviewer is a platform engineer budgeting hosted search. The arithmetic is right everywhere it was checked, and the Algolia and Meilisearch overage rates match the vendors' documentation.

**The worst defect (high, domain rule):** Typesense Cloud, Elastic Cloud and self-hosting are modelled as a flat fee with unlimited query throughput. So the crossover table, the tool's main selling point, says a $15 smallest Typesense cluster is cheapest up to 500M searches a month. Real cluster pricing steps with RAM, CPU and node count.

The base fees are also doubtful. The auditor found Typesense's smallest cluster at about $21.60 a month and Elastic at "from $99", though third-party sources disagree with each other on Typesense. 4 of 6 seeded bugs survived, including a changed base fee for each flat-priced provider.

**Fixed in this PR:**

- The README and the page now say that flat-cluster rows assume unlimited throughput and understate cost at high volume.
- The README no longer claims the prices are "dated in the source". The source has one undated "as best known in 2025" line.
- A new test pins the Algolia rate card.
- The rate-card values themselves are left for a fix with a fetched vendor page; no vendor site was reachable from this session.

### research/energy-lcos-sourced (correctness 3, claims 2)

The reviewer is an energy-storage techno-economic analyst. This is the strongest subject in the round:

- All 43 committed input rows equal the upstream PyPSA technology-data rows.
- Five headline levelized costs of storage reproduce from upstream data.
- The experiments regenerate their result files with no diff.

**The worst defect (medium, domain rule):** parts that wear out before the plant does are never replaced. Project life is the capital-weighted average of the parts' lives, so a 10-year inverter is spread over 16 or more years. Replacing it at year 10 moves Li-ion at 4 h from $121 to $130/MWh. The cheapest technology at each duration does not change.

Other defects:

- The inverter's round-trip efficiency is squared as if it were one way (about $1.3/MWh).
- Schmidt et al. 2019 is not cited, though it publishes the same cheapest-technology-by-duration map.
- Zeroing the pumped-hydro site-class spread, which drives the headline "pumped hydro wins 52% at 8 h", left every test green.

**Fixed in this PR:**

- The README states the efficiency label and lists these three gaps under "Known gaps".
- A new test pins the pumped-hydro spread.
- The test count is corrected.

### research/sensing-bak2wide (correctness 3, fitness 1)

The reviewer is a photogrammetrist who calibrates multi-camera rigs. The numbers are right:

- An independent sampler reproduces the radius table.
- Every reported k2 spread sits above its Cramér–Rao bound.
- Raising the solver budget fivefold leaves the narrow-rig spread unchanged.

**The worst defect (medium, research design):** the finding is not new. It is that k2 cannot be identified unless points reach the outer field. That is textbook calibration practice (Brown 1971, Fraser 1997, Zhang 2000), and a one-line estimate predicts it: the k2 term moves an edge point 0.35 px at distance 4, under the 0.5 px noise. Two seeded bugs in the radius statistic survived.

**Fixed in this PR:**

- A test pins the radius table; it now catches the median-for-95th-percentile mutant.
- The README cites the prior work, states that its spreads are population standard deviations, and corrects the runtime ("about 3 min" was 47 s).

## What changed since round 63

- **Seeded bugs:** the catch rate rose from 6 of 23 to 12 of 21. No subject caught them all.
- **Fixes:** every audited subject got a fix, a test that catches a surviving mutant, or both.
- **Two kinds of defect again lead the list.** The first is a domain rule applied naively: prefix matching, flat cluster pricing, no replacement schedule. The second is a README claim or result that went unchecked against prior work or a vendor page. Both kinds come from the spec stage, not from coding.
- **Vendor documentation sites were unreachable** from this session (proxy 403). Where a check relies on them, the audit files say which figures came from search results or from memory.
