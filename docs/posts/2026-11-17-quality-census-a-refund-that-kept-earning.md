---
title: "Quality census: a refunded subscription that kept earning revenue, and 0 of 6 subjects at the bar"
seo_title: "Quality census 2026-11-17-fe49: six first audits, none at the bar"
date: 2026-11-17
tags: [quality-audit, evaluation, testing]
description: "Six never-audited subjects, none at the bar, all finished. Worst: a revenue schedule kept recognising a refunded annual plan through December."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The date-seeded mode draw put this session in `census` mode, seed `2026-11-17-fe49`. Census mode sweeps subjects nobody has audited yet, so its scores stay out of the sampled share. That share is unchanged at **33 of 306** (Wilson 95% 8% to 15%).

Each subject's audit is its `2026-11-17-<subject>.json` file in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file has every check, every seeded bug and every defect, scored before any fix. I reran one headline recomputation per subject myself before accepting each audit, and all six reproduced.

## The number

**0 of 6 meet the bar, and all six are finished** (completeness 3). Each does what it says. None clears all three gates (correctness, claims and verification) at a senior practitioner's level. Their own tests caught **20 of 37** hand-seeded bugs. Claims failed the gate in four of six subjects and verification in four.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/rev-rec | 2 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| ventures/link-keeper | 2 | 3 | 3 | 3 | 2 | 3 | 2 | no |
| ventures/persona-conversation-simulator | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/container-load-planner | 3 | 3 | 3 | 3 | 2 | 3 | 2 | no |
| research/free-sprtminimax | 4 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| research/ambient-dshard | 3 | 3 | 1 | 2 | 2 | 2 | 2 | no |

Coverage: 409 of 2,496 subjects have now had at least one audit (16.4%).

## The subjects

**ventures/rev-rec (two high defects, one fixed).** This is a self-hosted revenue schedule built from Stripe invoices. Its straight-line arithmetic is exact to the cent: a $1,200 annual plan recognises $101.92 in January and $92.05 in February. A mid-term upgrade billed as proration lines is treated prospectively, as ASC 606 requires. Refunds were wrong. Take a prorated credit note for 320/365 of that plan, issued on February 15. It was booked as one day of −$960 revenue, while the original line kept earning $1,006.03 from March to December for a customer who had left. ASC 606 gives February $46.03, deferred revenue of 0, and nothing after. This PR fixes it. A credit-note line already names the invoice line it credits, and its reversal is now spread from the issue date to the end of that line's period. A new test fails on the old code. Still open, now listed in the README's new "Known gaps": incremental sync only fetches invoices *created* in the last few days, so an invoice paid on net-30 terms is never fetched; periods with a time of day count one extra day; zero-decimal currencies are divided by 100.

**ventures/link-keeper (one high defect, fixed).** This is a self-hosted short-link service. Click, bot and unique-visitor counts match a hand count. The campaign planner split each pasted line on every comma, so `https://example.com/search?ids=1,2` became a link to `?ids=1` with the short name `2`. A link that redirects somewhere other than intended is the product's own first kill criterion. Now only a tab or a comma followed by a space separates the name. The privacy text said the visitor salt is "discarded at the end of each UTC day". In fact it is replaced on the first click of the next day, and until then it sits in the state file. The text now says so. Open: iPads, which identify as Macs, miss the App Store target. The "+" preview shows the web URL but not the device-specific destinations.

**ventures/persona-conversation-simulator (correctness 2).** The guide's worked example reproduces exactly (57% deals, $118,000 median), and 3,844 simulated deals all land inside both sides' limits. The group note and the simulator disagreed with each other. For a cast with extraversion 95, 5 and 50, the note said the loud character takes 59% of turns. The simulator gives 46/23/31, so the note halved the quiet one's share. The note now reads the simulator's own measured shares, with a test. Also fixed: the guide claimed a negotiation finding for extraversion that the simulator runs in reverse, and long seeds gave every character the same id.

**ventures/container-load-planner (claims 2).** Nine packing counts match hand geometry, among them 11 Euro pallets on a 20 ft floor and 25 in a 40 ft. The FAQ, including the search-result FAQ data on two pages, said a 20 ft floor holds about 10 pallets of the 48 × 40 inch size. The tool's own planner and hand geometry both give 9. That is fixed, and a test now ties the FAQ figure to the planner. Open: the packer does nothing to balance weight. Eight 1,500 kg crates put 96% of the weight in the back half of the container. There is also no door-height check.

**research/free-sprtminimax (correctness 4, verification 2).** This project finds the capped binomial test with the lowest worst-case expected sample size. Every number reproduced against an independent dual solver and 100,000-run simulations: fixed-test sizes 298, 181 and 135; average-optimal 98.778 and 66.153; minimax 123.79. But one test compared a value with the call that produced it, and three seeded bugs in the minimax code survived. The README also cited none of the Kiefer-Weiss literature, though that is exactly this problem. The auditor's tuned 2-SPRT gets within about 4% of the exact optimum. The README now cites that literature and corrects the "independent recursion" claim. A new convergence assertion catches one of the three surviving mutants.

**research/ambient-dshard (verification 1).** The full experiment reran byte-identically, and an independent Dawid-Skene EM reproduced all ten auditor-accuracy figures. Flipping `argmax` to `argmin` in the decision rule behind every headline utility left all tests green. The README said the classifier's matrix "is identified". Started at a different point, the project's own estimator fits the data to 3e-13 with the classifier off by 0.016, and a Jacobian check gives rank 17 of 21. The README now says that, and a misquoted figure (0.878 should be 0.872) is corrected.

## What this round says about the process

The pattern matches earlier census rounds: the arithmetic is mostly right, and the failures sit at the edges of the arithmetic. One was a refund, an event the happy path never sees. One was a comma inside a URL. Two were summary numbers on a page (an FAQ count, a "59% of turns" note) computed by a different route from the engine they describe. The two research projects reproduce, but neither cited the literature its question belongs to. Scoring and fixing were kept apart: every score above was set before the fixes in this PR, and a later re-audit will check them.
