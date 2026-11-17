---
title: "Quality audit round 54: 0 of 4 at the bar, and a takeover checker that missed the commonest S3 case"
seo_title: "Quality audit 54: subdomain takeover, DJ pricing, ABC scripts"
date: 2026-11-12
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meet the bar. A subdomain takeover checker called a dangling S3 bucket safe because it only read the last CNAME."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/), in the four `2026-11-12-*` files named below. Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample` with seed `2026-11-12-m`. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each had been audited too recently to come up again.

## The number

**0 of 4 sampled subjects meet the bar.** Counting every sampled round on `main` plus this one, 31 of 230 meet it (Wilson 95% interval 10% to 18%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/subdomain-takeover-check | 1 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/dj-gig-profit-calculator | 3 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| research/chip-logic-script | 3 | 3 | 1 | 2 | 2 | 2 | 2 | no |
| research/sample-twin | 3 | 3 | 2 | 3 | 3 | 2 | 3 | no |

| subject | seeded bugs caught | recomputed outputs right |
|---|---|---|
| subdomain-takeover-check | 4 of 6 | 2 of 10 |
| dj-gig-profit-calculator | 10 of 11 | 4 of 7 |
| chip-logic-script | 1 of 6 | 5 of 5 |
| sample-twin | 2 of 5 | 5 of 6 |

Each subject missed the bar on a different gate. The DJ calculator missed only on claims, and sample-twin only on verification. The two that did their arithmetic right were let down by thin tests or by claims that went past what the files back.

## Verdicts and worst defects

### subdomain-takeover-check (correctness 1)

The reviewer is an attack-surface security engineer who triages bug-bounty reports. The tool follows a hostname's CNAME chain over DNS-over-HTTPS. If the chain points at a hosting provider, it sends one GET request and compares the response with that provider's "nothing is claimed here" page. The design is careful in the right place: a finding is only "confirmed" when the live response matches.

**The worst defect (high):** it matched providers against only the *last* name in the chain (`analyze.mjs:73`, `check.mjs:78`, `index.html:222`). A deleted bucket behind `<bucket>.s3.amazonaws.com` usually resolves on to an internal S3 name such as `s3-w.us-east-1.amazonaws.com`, and no pattern matches that name. So the commonest takeover case came back "not-risky". The same bucket reached in one hop was correctly confirmed. The auditor modelled that chain on a public write-up and ran it through the shipped `runCheck`. Live DNS was blocked from this session, so that step is modelled rather than observed.

Other defects:

- **High.** Dangling Azure records show up as NXDOMAIN at the target. The tool has no NXDOMAIN signal, so it can never confirm one, and the CLI blames "a browser CORS block" instead.
- **Medium.** The takeover status of 9 providers disagrees with the [can-i-take-over-xyz](https://github.com/EdOverflow/can-i-take-over-xyz) reference. The tool reports a closed Zendesk help centre as CRITICAL, while the reference lists Zendesk as not vulnerable.
- **Low.** The page claimed 25 providers in ten places; the table has 24.

### dj-gig-profit-calculator (claims 2)

The reviewer is a bookkeeper for self-employed wedding and mobile DJs. Every output the auditor recomputed by hand matched, including the per-hour profit, floor price, marketplace and agency comparisons and the quote builder. The tests caught 10 of 11 seeded bugs.

**The worst defect (medium):** "take-home" means pre-tax profit everywhere, and the wedding-pricing guide never mentions tax. On the guide's $60,000 goal, self-employment tax alone is $8,477.73.

Other defects:

- **Medium.** "Price for target" misses its target whenever the DJ books less than full capacity, because overhead is spread over bookable hours rather than booked ones (`calc.mjs:59`). On the sample mix it earns $37.15 an hour against the $40 target, while every line shows "meets".
- **Medium.** The add-on parser in `quote.mjs` turned a quoted `"$1,200"` into price 1 and cost 200. The same bug was fixed in `calc.mjs` the day before, but the copied parser in `quote.mjs` was missed.
- **Low.** The page's "not modelled" list still named deposits, overtime and seasonality, all of which the quote builder now models.

### research/chip-logic-script (verification 1)

The reviewer is an EDA researcher reviewing for a logic-synthesis workshop. The project re-scores hand-written circuit structures under five ABC synthesis scripts in Yosys. The auditor installed Yosys 0.33 and Icarus and reran the whole experiment, which reproduced `results.txt` exactly. The auditor also simulated all 37 candidates and all 170 mapped netlists over every one of the 65,536 inputs against their own reference functions. Every netlist was right, and the auditor's own walk of the netlists gave the same cell counts and depths as the tool.

**The worst defect (medium):** the headline result has an unstated assumption. The headline says the nibble-combine leading-zero counter beats the sweep by 216 to 344 under `dch_map`, and that the script flips the verdict under 3 of 5 scripts. Both depend on a MUX costing one gate. Remove MUX from the generic library and `dch_map` goes back to the sweep (396 against 344), so the verdict flips under 2 of 5 scripts. I reran this check myself and got the same lines.

Other defects:

- **Medium.** The tests are thin. 5 of 6 seeded bugs survived, including one that made the equivalence check prove the source instead of the mapped netlist, which is the one step this project adds.
- **Medium.** The "default" column is not the earlier project's flow, although the README compared the two as if it were.
- **Low.** The nibble-combine form is Oklobdzija's 1994 leading-zero detector, and it was uncited.

### research/sample-twin (verification 2)

The reviewer is a senior control engineer. The project compares a sampled PD loop on a double integrator with its continuous-time "twin". The auditor recomputed everything with numpy, without the author's code: the stability boundary `ωnT < min(4ζ, 1/ζ)`, the pole sizes, the settling times, deadbeat control and pole placement. All of it matched. I reran that script and got the same output.

**The worst defect (medium):** the settling and overshoot metrics behind two of the four results had no tests. Three seeded bugs left all 8 tests green, including an off-by-one in settling time and measuring overshoot only at the sample instants.

Other defects:

- **Medium.** Against a PhD bar, the result is a textbook worked example. The nearest prior work (closed-form digital PD stability regions from the Jury test) is not cited.
- **Low.** The README called the twin's pole size "optimistic" at `ωnT = 1.2`, where it is actually pessimistic (0.432 against the real 0.200). The paper had it right.

## What was fixed in this round

All fixes are in [PR #15264](https://github.com/Duncan-Haywood/oss-monorepo/pull/15264). Each comes with a test that fails on the old code. The scores above are from before the fixes; a later round will re-audit these subjects.

- **subdomain-takeover-check.** The tool now matches a provider anywhere in the CNAME chain, through a new `providerForChain` in `fingerprints.mjs` that the classifier, the CLI probe gate and the browser page all use. A modelled S3 chain is now confirmed, and new tests cover the classifier and the probe. The provider count now reads 24, and a page test ties every stated count to the table. The NXDOMAIN signal and the 9 status mismatches are not fixed and stay open.
- **dj-gig-profit-calculator.** The add-on parser now uses the same quote-aware splitter as `calc.mjs`, with a test. The page and README now say that "take-home" is pre-tax, and the "not modelled" list matches what the tool models. The capacity gap in "price for target" is a design change and stays open.
- **chip-logic-script.** A Yosys run whose output cannot be parsed now raises an error. Before, it scored 0 cells × depth 0, the best possible score. The README now states the MUX sensitivity, the difference in the default flow, and the prior work. The thin tests on the netlist check stay open.
- **sample-twin.** Overshoot is now exact, taken at the vertex of each period's parabola instead of a 20-point grid. Two numbers in `results.txt` moved in the fourth digit (0.2341 → 0.2343 and 0.4847 → 0.4852). New tests pin overshoot and four settling times to values recomputed independently. The README's pole-size sentence is corrected.

## What changed since round 53

Round 53 also had 0 of 4 at the bar, and its subjects also failed mostly on verification. That pattern holds here: of 28 seeded bugs, 17 were caught, and 10 of the 11 misses were in the three subjects other than the DJ calculator. Across all audits, verification is the dimension that most often binds after fitness and domain (94 of 244 audits at 3 or more). The DJ calculator shows what a well-tested subject looks like, and it still missed on the words around the numbers.
