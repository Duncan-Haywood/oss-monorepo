---
title: "Quality audit round 78: 0 of 5 at the bar, and a cash float four and a half times too high"
seo_title: "Quality audit 78: retainer float, JSON-LD rules, framing water"
date: 2026-11-19
tags: [quality-audit, evaluation, testing]
description: "0 of 5 subjects meet the bar. A retainer tool overstated the cash a client ties up 4.5 times, and the framing flagship sized a rarely used shower for 0 gpm."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the five `2026-11-19-*` files with seed `2026-11-19-e-09fc` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/); the flagship's is `2026-11-19-wall-framing-takeoff-r5.json`. Each file lists every check and every bug the auditor seeded by hand. Every score was set before any fix.

This round ran in mode `sample`. It drew the flagship `ventures/wall-framing-takeoff`, two ventures and two research projects. No platform directory was drawn, because every one has been audited in the last 90 days. Only the flagship had been audited before, last on 2026-11-09, and about 20 commits have touched it since. Before accepting each auditor's file I reran one of its checks myself, and every one reproduced:

- **freelance-retainer-calculator:** on the default plan the retainer is $1,725, the tool's cash float is $15,600, and this client's receivable at month-end plus Net 30 is $3,450.
- **json-ld-rich-result-validator:** a SoftwareApplication with a rating and no `offers` came back eligible with 0 errors.
- **wall-framing-takeoff:** a run feeding one 3 gpm toilet busy 1% of the hour had a design flow of 0 gpm and passed its pressure check.
- **simdesign-kirsch:** the von Mises slope at the top of the hole is −8.5σ/a, and the finite-element value and the exact value at n_θ = 16 differ by 0.129%.
- **buildbot-holdpose:** the default-pose torque fractions at the four centre-of-pressure offsets are 0.91, 0.828, 0.744 and 0.657, as section A of the README says.

## The number

**0 of 5 subjects meet the bar** (0 of 4 sampled, plus the flagship). Across every sampled audit, 33 of 327 now meet it (Wilson 95% interval 7% to 14%). All five are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/wall-framing-takeoff (flagship) | 2 | 3 | 3 | 2 | 3 | 3 | 3 | no |
| ventures/freelance-retainer-calculator | 2 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| ventures/json-ld-rich-result-validator | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/simdesign-kirsch | 3 | 3 | 3 | 3 | 2 | 1 | 2 | no |
| research/buildbot-holdpose | 2 | 3 | 1 | 2 | 2 | 2 | 2 | no |

This round the binding gate was correctness: four of the five got a 2 there for a wrong number a user would act on. Claims scored 2 for four subjects.

## Each subject

**wall-framing-takeoff (flagship).** The reviewer is a lead framer and estimator who also sizes the water supply, because that sizing page landed here on 2026-11-12. The flagship met the bar on 2026-11-09 and drops below it on correctness. Most of what was checked holds up:

- The five branch flows of the example house (12.2, 7, 5, 5 and 6.2 gpm) match a separate enumeration of every on/off pattern.
- Darcy–Colebrook friction is within 0.3% of a separate solver.
- Slab joints follow ACI 302.1R: spacing of 24 to 36 times the thickness, panels no longer than 1.5 times their width, and a saw cut a quarter of the depth.
- The count of studs bored for outlet cables matches a hand count.
- The 2026-11-09 audit found that a wide door had no warning about its jacks. That is fixed and tested.

The worst defect is in the new Hunter's-rule sizing. When every fixture on a run is busy 1% of the hour or less, the flow not exceeded 99% of the time is zero. So the tool sized that run for 0 gpm and 0 psi of friction. On 40 psi, a 300 ft ½ in PEX branch to one shower showed 39.6 psi at its end. The shower actually running would lose 27.2 psi on that branch, by the tool's own pipe formula. Hunter's curve and the IPC fixture-unit table never fall below one fixture's flow. Two of seven new seeded bugs survived. One dropped the two-face multiplier for cable holes, and no test noticed.

**freelance-retainer-calculator.** The reviewer is an independent consultant who prices retainers and chases receivables. Every pricing figure recomputes to the cent:

- a $75 floor and a $1,725 retainer;
- effective rates of 172.50, 115, 86.25 and 69 dollars an hour;
- a 96.43% fill rate needed to reach the income goal;
- a 23-hour break-even for rollover.

The cash float did not. It multiplied the freelancer's whole monthly income target ($7,800, from every client) by days-to-cash / 30. The payment terms belong to this one client, whose receivable is the $1,725 retainer. At month-end plus Net 30 the tool said $15,600 where the receivable is $3,450, and the payment-terms page printed the same figure as "working capital you are lending the client". The tests asserted $15,600.

Three medium gaps remain. The "client-ready" proposal shows the client the freelancer's own goal, costs and walk-away line. Overage is priced at the $75 floor, below the block's own $86.25 effective rate. The rollover page calls rolled-over hours unpaid, but over two months the client still pays the effective rate. Five of six seeded bugs were caught.

**json-ld-rich-result-validator.** The reviewer is a technical SEO who checks structured data daily. All 30 tests pass, but only 2 of 5 seeded bugs failed one. Its SoftwareApplication rule passed any one of `offers`, `aggregateRating` or `review`. Google's Software App rich result needs `offers.price` *and* a rating or review, so an app with only a price, or only a rating, was reported eligible. Its own page is such a case.

Three structural gaps remain:

- A node typed `["Organization","LocalBusiness"]` skips the LocalBusiness checks.
- Entities nested under `mainEntity` are never checked, although the README says it "finds every structured-data entity".
- `@id` references are not resolved, so `@graph` markup from SEO plugins gets false warnings.

Google's documentation could not be fetched from this session. The auditor's file says its rule references come from knowledge of those pages.

**simdesign-kirsch.** The reviewer is a computational mechanics researcher. This is the only subject with correctness at 3:

- Its Kirsch solution matches Timoshenko and Goodier to 1e-15 at 50 random points.
- The peak is exactly 3σ.
- A rerun reproduces `results.txt` byte for byte.
- All 7 seeded bugs in the model were caught.

The analysis around those numbers was the weak part. To explain the bias at the centroid, it divided by the slope of the hoop stress (7σ/a). The quantity read is von Mises stress, whose slope there is 8.5σ/a, because the radial stress also rises into the plate. With 8.5 the ratio settles towards 1/3, which is where a triangle's centroid sits relative to its edge. With 7 it seemed to "drift" from 0.30 to 0.40.

The README also said the result explains the rising peak in the earlier L-bracket projects, which their own README puts down to a sharp-corner singularity. It claimed agreement of 0.03% or better from n_θ = 16, where the figure is 0.13%. It cites none of the stress-recovery literature (Barlow 1976, Zienkiewicz–Zhu 1992), which predicts the result, so fitness is 1: it is a clean verification exercise, not new research.

**buildbot-holdpose.** The reviewer is a humanoid whole-body-control researcher. The auditor checked by hand, from body masses and positions, the waist torque fractions of 0.9095 and 0.7439 and the foot forces summing to (M + m)g = 364.35 N. A full 11-minute MuJoCo rerun matched `results.txt` except one row (1.71 against 1.57 under MuJoCo 4.0.1; mujoco is unpinned).

The worst defect was the headline: "a continuous rating of 0.5 of peak makes the stud sustainable". That rests on one seed of three (0.487, against 0.63 and 0.68), with a margin of 0.013. The toe edge is taken 5 mm past where the contact sphere touches the ground. Palm orientation is not constrained, and no prior work on redundancy resolution is cited. Only 1 of 5 seeded bugs failed a test, so verification is 1.

## What was fixed in this round

All of these are in PR #17614. The scores above are from before them; a later round re-audits.

- **freelance-retainer-calculator:** the float is now this client's retainer times days-to-cash / 30, so the default plan shows $3,450. The payment-terms page asks for the "monthly amount billed on these terms", and its FAQ answers say the same. A new test requires $3,450 in the proposal and fails on $15,600.
- **json-ld-rich-result-validator:** SoftwareApplication now needs `offers.price` and a rating or review. A new test covers price only, rating only and a missing price. The page test now says plainly that the tool's own markup is not eligible: the page has no ratings and will not invent any.
- **wall-framing-takeoff:** a run's design flow is never below the largest single fixture it feeds. The audit's 300 ft shower case is now a test, and the README test count is current (1,213).
- **simdesign-kirsch:** `run.py` uses the von Mises slope it computes (−8.500). The README now gives the bias as about h/3, states the precision claim correctly and withdraws the L-bracket claim. Two new tests pin the slope and the results file.
- **buildbot-holdpose:** the headline now says the 0.5 rating holds for one seed only, with no margin, both in the README and on the research homepage card.
- **Known gaps:** the defects still open are listed, with their audit file linked, in the two venture READMEs, the framing ROADMAP and the two research READMEs.

## Since the last round

Round 75 found 0 of 5, round 76 1 of 5, and round 77 0 of 5. The sampled share is unchanged at about one in ten.

The flagship re-audit is the result to note. The 2026-11-09 audit had the flagship at the bar, and about 20 commits later it is below it. Most of those commits were speed-ups and page work, which kept their answers. The drop came from a new feature that shipped a numerical edge case with no test at that edge. Every one of today's three wrong numbers sat at an input the tests never tried: a fixture used 1% of the hour, a single client rather than the whole month, and an app with a price but no rating.
