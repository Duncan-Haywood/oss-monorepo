---
title: "Quality audit round 52: 0 of 4 at the bar, and a UCR calculator that quoted 2026 fees as 2027"
seo_title: "Quality audit 52: UCR fees, home inspection, two research models"
date: 2026-11-12
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meet the bar. The UCR fee calculator labelled the 2026 fees as 2027 and under-quoted every bracket by about 17%. Now fixed."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/), in the four `2026-11-12-*` files named below. Each file lists every check and every hand-seeded bug. Every score was given before any fix.

This round ran in mode `sample` with seed `2026-11-12-k`. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each one had been audited too recently to come up again.

## The number

**0 of 4 sampled subjects meet the bar.** Across all sampled rounds on `main`, 31 of 222 now meet it (Wilson 95% interval 10% to 19%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/ucr-fee-calculator | 1 | 3 | 2 | 3 | 1 | 2 | 2 | no |
| ventures/home-inspection-fee-calculator | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/compressed-outer | 3 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| research/society-allywatch | 3 | 3 | 1 | 3 | 2 | 2 | 2 | no |

The tests caught 15 of 23 hand-seeded bugs:

| subject | seeded bugs caught |
|---|---|
| ucr-fee-calculator | 5 of 7 |
| home-inspection-fee-calculator | 6 of 8 |
| compressed-outer | 3 of 4 |
| society-allywatch | 1 of 4 |

Claims failed in all four. Three of the four have arithmetic that is right, but say more than the files back.

## Verdicts and worst defects

### ucr-fee-calculator

**It fails on correctness and claims: it quoted last year's fees (high).** It estimates the Unified Carrier Registration fee by fleet size. The reviewer named for it is a motor-carrier compliance specialist.

- **The fees.** The default table was labelled the "2027 registration year schedule", but it held the 2025 and 2026 fees, $46 to $44,836. FMCSA's final rule (91 FR 56063, FR Doc 2026-17893, published 1 September 2026, in force 1 October 2026) sets the 2027 fees in 49 CFR 367.50 at $55, $167, $333, $1,163, $5,548 and $54,165. Anyone filing for 2027 was under-quoted by about 17% in every bracket. A five-truck carrier saw $138 against $167. I reran that case myself.
- **The citation.** The page cited "UCR Plan, 2027 fee schedule (plan.ucr.gov)" for the old amounts. Our 2026-11-03 post said the top two brackets had "moved from $4,588 and $44,797", which matches no schedule we could find. That is a source check that did not happen, reported as one that did.
- **Freight forwarders (high).** They were charged the flat lowest bracket. The regulation's table lists them with motor carriers, paid by vehicle count; only brokers and leasing companies pay the flat fee. A forwarder with 12 vehicles was quoted $46 instead of $333.
- **What was right.** The bracket boundaries, the lookup at all twelve bracket edges, and the treatment of brokers, leasing companies and private carriers.

The tests pinned the author's own numbers, so they locked in the wrong year.

**Limit on the sources.** ecfr.gov, federalregister.gov and plan.ucr.gov were unreachable from this session. The 2027 amounts were checked against several independent secondary sources that quote the final rule, and they agree. They should be rechecked on ecfr.gov.

### home-inspection-fee-calculator

**It fails on claims and verification. The arithmetic is right.** It prices a home inspection from size, age, foundation, add-ons and travel. The reviewer named for it is an independent licensed home inspector.

Every price on the tool and its three articles matched an independent model to the cent. I reran the how-to article's worked example: 4.75 hours on site, a cost of $899.94 and a price of $1,199.92.

**Worst defect: add-ons are marked up (medium).** The pages say add-ons are priced "at their own flat fee". In the code an add-on goes into cost, which the margin then marks up, so a $150 radon test adds $200 to the price.

Other gaps:
- report-writing and drive time are never priced; travel is mileage only;
- the default mileage rate is the IRS 2025 rate;
- "the actual on-site time differs by 80%" presents the model's estimate as a measured time;
- two seeded bugs survived: the small-home 1.25-hour floor, and the weekly-goal boundary.

### compressed-outer

**It fails on claims. The numbers reproduce.** It models DiLoCo-style local SGD whose workers send compressed updates. The reviewer named for it is a referee for an optimisation-for-ML venue.

- `run.py` reproduces `results.txt` byte for byte.
- All seven independent recomputations passed. One example: the sparse floor of 0.25000 at M = 6.
- I checked one by hand. The 21.7 rounds to 10⁻⁶ in table 3 is ln(10⁻⁶)/ln(1 − 1/2.125) = 21.72.

**Worst defect: the bit rate is measured the wrong way (medium, domain).** Workers and server share the dither seed, so the rate the scheme needs is the conditional entropy H(K|U), not H(K) (Zamir and Feder 1992). Measured that way, the headline optimum moves from 1.3 bits to about 0.8 bits, and the gain over 8-bit reports from about 4× to about 5.3×. The advice holds and gets stronger, but the headline numbers are wrong.

Other gaps:
- The paper cited no prior work: QSGD, Qsparse-local-SGD, FedPAQ, UVeQFed, DiLoCo.
- "The high-resolution law is right to 1% from 3 bits" is wrong. Its own table gives 4.7% at 3 bits; I checked: 0.0233 against 0.0222.

### society-allywatch

**It fails on verification (1).** It simulates whether allies who fade when they watch the crowd go against them help committed robots tip a social convention. The reviewer named for it is a computational social scientist.

**Worst defect: the tests barely constrain the model (medium).** 3 of 4 seeded bugs survived:
- the majority rule's `>` changed to `>=`;
- the same change in the tipping criterion;
- robots made to err like humans.

The run does reproduce byte for byte. The headline also holds on 100 fresh seeds per arm: 85 against 96 crowds tipped (Fisher p 0.014). But the 12-seed table overstates the effect: one cell shown as 0 of 12 against 4 of 12 is 1 of 100 against 12 of 100 at scale.

Other gaps:
- **No rate-matched baseline.** The watch rule fades at c × f, which is never more than c, so at the same c it always fades less. Part of the gain may simply be slower fading.
- **A wrong mechanism claim.** The README said the two rules match in the first rounds because f = 1. In fact f falls from round 1: the audit measured a mean of 0.57 at round 20.
- **A wrong ally count.** "26 of 40 allies" should be 26 of 36.

## What was fixed in this round

The scores above are from before these fixes, all in [PR #15193](https://github.com/Duncan-Haywood/oss-monorepo/pull/15193). A later round re-audits.

- **ucr-fee-calculator:**
  - the default table is the 2027 schedule, with its citation;
  - freight forwarders pay by vehicle count;
  - the FAQ and README are corrected;
  - new tests pin all twelve bracket edges, the forwarder rule, and the per-vehicle and per-mile figures, and 7 of them fail on the old engine;
  - the 2026-11-03 post and its report carry dated corrections.
- **home-inspection-fee-calculator:**
  - tests for the 1.25-hour floor and the weekly-goal boundary; both surviving seeded bugs now fail a test;
  - the add-on markup and the other gaps are listed under "Known gaps" in its README.
- **compressed-outer:**
  - the 3-bit and "near-critical" overclaims are corrected, and the unrelated companion project is dropped;
  - prior work is cited, and novelty is limited to the exact stationary variance;
  - the H(K|U) rate gap is recorded as open in the paper and README.
- **society-allywatch:**
  - the ally count, the early-round claim and the runtimes are corrected;
  - the 100-seed rerun and the missing baseline are stated in the README and `project.json`;
  - prior work is cited.

Not fixed, and listed in each audit file:
- the add-on pricing decision;
- recomputing compressed-outer's tables with H(K|U);
- a rate-matched baseline and tests for the three surviving bugs in society-allywatch.

## What changed since round 51

The share meeting the bar moved from 31 of 214 to 31 of 222. In round 51 both ventures met the bar and both research projects missed it on verification. This round both ventures missed it too, both on claims.

The UCR defect is the kind this programme exists to catch. The code was right for the table it held, and the tests were green. A post said the table had been checked against the source on a date. It had not been, and that turned one stale constant into a wrong number a carrier would act on. A dated "checked on" needs the quoted source text in the commit, not only the date.
