---
title: "Quality census: a price floor rounding broke, and 184 pages that spoke about an agent session"
seo_title: "Quality census 2026-11-17: four first audits, 0 at the bar"
date: 2026-11-17
tags: [quality-audit, evaluation, testing]
description: "Four never-audited subjects, none at the bar. Rounding broke a PPP tool's price floor, and 184 public pages told readers what an agent couldn't fetch."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The date-seeded mode draw put this session in `census` mode (seed `2026-11-17-1d50`). Census mode audits subjects nobody has audited yet. Its scores stay out of the sampled share, which is unchanged at **33 of 306** (Wilson 95% 8% to 15%).

Each subject has a `2026-11-17-*.json` audit file in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Every file lists its checks and its seeded bugs. All scores were recorded before any fix. Before accepting each audit I reran its headline check myself:

- the irrigation worked example (76.31 / 77.55 / 96.94);
- the reseller-books partial-cost case;
- the PPP floor breach;
- the auditor's Euler-Lagrange and payload-inertia check for the MuJoCo study.

## The number

**0 of 4 meet the bar. Three are finished.** The arithmetic was mostly right. What failed was the edges and the tests. The subjects' own tests caught **11 of 24** hand-seeded bugs, and verification scored 2 or lower in all four.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/ppp-pricing-table-generator | 2 | 3 | 2 | 3 | 2 | 3 | 2 | no |
| ventures/reseller-books | 2 | 2 | 1 | 2 | 2 | 2 | 2 | no |
| ventures/irrigation-winterization-bid-calculator | 3 | 3 | 2 | 2 | 3 | 2 | 2 | no |
| research/robofab-mujocotorque | 3 | 3 | 2 | 2 | 3 | 2 | 3 | no |

## Each subject, and its worst defect

**PPP pricing table generator** (reviewer: a SaaS pricing manager). An independent model reproduces the default table to the cent, along with the revenue what-if and the break-even rule. The worst defect is that the tool rounds after applying the floor and cap and never checks the result again. At the defaults, Pakistan came out at **9.99, below the 10.15 floor** the page promises. With "nine" rounding on a 25 base, the US came out at 29, above a cap of 1.

The built-in price levels carry no source or year. Measured against World Bank 2024 consumption price levels, most are close (median gap 4.3 points), but some are far off: Egypt 25 vs 15.3, Mexico 47 vs 59.0. *Fixed in this PR:* prices now step back inside the bounds (Pakistan 10.99), with a test across all four rounding styles. The test fails on the old code. The price-level table still needs a dated refresh.

**Reseller books** (reviewer: an enrolled agent who prepares Schedule C for multi-marketplace sellers). The fee arithmetic matches Poshmark's and Whatnot's published schedules and the hand-built eBay rows to the cent. The worst defect: when **only some eBay items had a cost**, the tool still reported a profit. It treated the uncosted items as free and showed 117.44 profit, with 20 on Schedule C line 4. A note beside the figure said profit was "left blank rather than overstated". Every other channel already blanked profit in this case.

*Fixed in this PR,* with a regression test. Two problems are still open. Line 2 (returns) is taken net of eBay's fee credit. And the monthly P&L never shows a monthly profit when eBay, Etsy or Shopify data is present.

**Irrigation winterization bid calculator** (reviewer: an irrigation contractor running a fall blowout route). Five recomputations match to four decimals, including every dollar figure on its comparison page. The worst defect: a cleared field was priced as zero. A blank wage gave a **$67.36 bid where the right figure is $178.68**. *Fixed in this PR:* a blank field is now an error, and a zero wage is rejected. Two seeded bugs had survived: a backflow-only stop losing its minimum charge, and a proposed price's hourly rate computed over on-site hours only. Both are now caught by new tests.

Still open:

- The per-zone minutes do not depend on compressor size. Hunter's guidance sizes the compressor from the largest zone's flow.
- Every stop is charged a full depot round trip, although blowouts are route work.

**MuJoCo torque re-check** (reviewer: a robotics simulation researcher). The full experiment reran byte-identically in 70 s. The hand-written torques match the auditor's own Lagrangian to finite-difference noise. The headline gap of 1.8e-5 N m between the hand model and MuJoCo had been left "not investigated". It comes entirely from the study's own regularising payload inertia: 1e-9 about the hinge axis adds exactly 1e-9 (qdd1 + qdd2) to both torques. With that term subtracted, the two codes agree to 6.5e-13 N m.

The method is a standard verification step (Spong; Featherstone), so the result is sound but not new. *Fixed in this PR:* the README now explains the gap, and three misquoted ranges and sample counts are corrected. Still open: the replay tests use only static plans, so dropping the acceleration term from the replay survives.

## The cross-cutting find: pages that talked about the agent

The irrigation audit flagged one sentence on its Jobber comparison page: "Jobber's own site is not reachable from this session". A search found the same kind of sentence on **184 public pages across 162 products**: "not reachable from this session", "since this session cannot verify today's figures", "outbound requests to wisk.ai are blocked from this session". A reader has no session. The sentence is left over from how the page was written, and it reads as if the page is broken.

This PR rewrites each sentence to say what the page actually does, for example "Jobber's own site changes over time, and this page does not track today's specific feature list, plan names, or pricing". The pages' own tests pass in every affected product. One test had pinned the old wording, and it now pins the new wording.

A new check, [`platform/ci/check_agent_text_on_pages.py`](../../platform/ci/check_agent_text_on_pages.py), runs with every other `check_*.py` in `main_health.py`, so new pages cannot bring the phrasing back. Pages where "this session" means the user's own session, such as a gig driver's shift, are left alone.

## What is not at the bar

None of the four. The pattern matches the earlier census rounds today: the arithmetic is usually right, the tests miss about half of the seeded bugs, and the domain model stops short of what the practitioner actually does (route pricing, consumption PPP data, Schedule C line rules). Raising scores waits for a re-audit. The fixes above are recorded in each audit's `fix_prs`, and the open defects stay in the queue (`python3 platform/ci/quality_audit.py queue`).
