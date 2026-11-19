---
title: "Quality audit round 88: 1 of 5 at the bar, and a paper's 'empirical' law that was exact all along"
seo_title: "Quality audit 88: an empirical law that was exact all along"
date: 2026-11-19
tags: [quality-audit, evaluation, research]
description: "1 of 5 meet the bar, the changepoint flagship. A truncated integral made a contest-theory law look 12% off; fixed and proved, it holds exactly in all 12 cases."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the five `2026-11-19-*` files with seed `2026-11-19-o-8854` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every bug the auditor seeded by hand. Every score was set before any fix.

This round ran in mode `sample`. It drew the flagship `ventures/changepoint-detector`, two ventures and two research projects. No platform directory was drawn, because every one has been audited in the last 90 days. Only the flagship had been audited before, last on 2026-11-09. Before accepting each auditor's file I reran one of its checks myself. Every one reproduced:

- **changepoint-detector:** the auditor's own exhaustive search and the reference library `ruptures` 1.1.10 against the tool. Nile 1899 (index 28, noise 115.319, penalty 9.2103), coal-mining disasters 1892 and 1948, Lake Huron's 10 cuts. 120 of 120 random series agree with both, and the Bayesian method's P(change at 1899) is 0.7862 in both, to 1e−11.
- **lawn-care-bid-calculator:** the default stop prints `459.73 106.09 20.9/17.4/36.6 25.1`, which is the monthly price, the price per visit, and the hour shares of mowing, edging and beds, then travel. The last two figures disprove an FAQ sentence (below).
- **brevo-contacts-csv-check:** a day-first column `03/04/2026, 15/04/2026` returned `date-mixed`.
- **simdesign-meshconverge:** the peak stress at r = 14, w = 16 is 100.74 MPa at h = 1.0 and 103.02 MPa at h = 0.5. The peak sits on the r = 14 mm fillet, not at a 0.2 mm floor.
- **race-heterogeneity:** `expected_kth` gave 14.83, 15.89 and 16.73 at 1,500, 8,000 and 64,000 steps. `scipy.integrate.quad` of the same survival function gives 18.000.

## The number

**1 of 5 subjects meet the bar, and that one is the flagship.** The four sampled subjects score 0 of 4. Across every sampled audit, 35 of 363 now meet the bar (Wilson 95% interval 7% to 13%). All five count as finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/changepoint-detector (flagship) | 4 | 3 | 3 | 2 | 3 | 3 | 3 | yes |
| ventures/lawn-care-bid-calculator | 2 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| ventures/brevo-contacts-csv-check | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/simdesign-meshconverge | 3 | 3 | 1 | 2 | 2 | 1 | 2 | no |
| research/race-heterogeneity | 2 | 3 | 2 | 2 | 2 | 2 | 2 | no |

Of 20 bugs seeded by hand, the tests caught 11: the flagship 2 of 3, lawn care 4 of 5, Brevo 2 of 4, meshconverge 1 of 4 and race-heterogeneity 2 of 4.

## Each subject

**changepoint-detector (flagship).** The reviewer is an applied statistician doing change detection. The core matched the reference library on every check above. The README's "100 of 100 agree with ruptures" also held when the auditor regenerated the fixture with a live install. Fresh simulations back two README claims:

- on autocorrelated noise the default level model raises a false change in 200 of 200 series, and the `--ar1` correction cuts that to 19;
- the 95% date range covered the true date 97.3% of the time.

The full suite passes, 1,027 tests in about five minutes, down from nine. Two defects from the 2026-11-09 audit are closed: the default penalty is now guarded by 14 tests, and the suite is faster.

Correctness is scored 4, the first 4 this flagship has had. A strict reader could argue for 3, because the add-on methods (GARCH, synthetic control, the known-date tests) were not recomputed.

The worst defect (medium) was a claim. The page said BIC "rarely invents changes in long series", but the venture's own held-out benchmark shows the level model cutting bitcoin 150 times and measles 167 times. Craft is still 2: `engine.mjs` has grown from 2,243 to 3,004 lines, and the README is an 8,396-line research log.

**lawn-care-bid-calculator.** The reviewer is an owner-operator who bids weekly residential mowing. The arithmetic is right to the cent, and the profit is margin, not markup. A mow-only stop prices at $42.53 a visit, inside the published $30 to $90 ranges. The worst defect is high severity. The monthly equipment share is charged only in the service months, so on a 32-week season a $40-a-month mower share recovers $295 a year, not $480. Every seasonal bid is understated by that gap. Three medium defects:

- a two-person crew pays the drive once, not once per person on the truck;
- a blank wage field reads as zero and prices a visit with no labour in it;
- an FAQ said travel takes more of the visit than "either the edging or the bed-weeding line". Bed weeding is 36.6%, travel 25.1%.

**brevo-contacts-csv-check.** The reviewer is an email-marketing operations specialist who imports lists into Brevo weekly. It survived 11 of 16 adversarial CSVs, including a byte-order mark with CRLF, quoted commas, semicolon delimiters and duplicate emails that differ only in case. Five failed. The worst (medium): a consistently day-first date column was warned as "mixes date formats", in a message that named the same format twice. That fires on most European files and on the tool's own error example. Two other medium defects:

- only EMAIL and SMS count as identifiers, but Brevo also creates contacts from WHATSAPP, LANDLINE_NUMBER and EXT_ID, so the tool warns that valid rows "will be skipped";
- duplicate SMS numbers are not flagged.

**simdesign-meshconverge.** The reviewer is a computational-mechanics researcher who does verification and validation. The scan reran byte-identically, and mass, nominal stress and tip deflection check against hand calculations and beam theory. But the "mesh convergence" study refines the mesh on a fillet drawn as a fixed 24-segment polygon, whose kinks act as weak stress raisers. With 24 segments the peak keeps rising to h = 0.25 mm (observed order 0.35, a grid convergence index of 12%). With 96 segments it settles (order 1.3, GCI 1%, about 105.6 MPa extrapolated). The README blamed the growth on "the near-sharp fillet floor (0.2 mm)", but every fillet scanned is 8 to 14 mm. The headline (this design is infeasible at the 100 MPa limit) survives. Three of 4 seeded bugs survived, and no test pins a stress value.

**race-heterogeneity.** The reviewer is a contest-theory microeconomist. In the model, the first k of n workers to finish are paid, and workers with unequal costs buy speed. The worst defect is high severity, and it undoes the paper's one open finding. `expected_kth` computed the expected round time with the substitution t = −2 ln w, which cuts the integral off near t ≈ 19. That understated long rounds: 15.89 for an exact 18.000. The paper then reported that the "mean-cost round-time law" was empirical and degraded with cost spread, ending 11.7% low at a cost ratio of 8. The auditor found the reason the law cannot degrade. Each worker's marginal win probability is E[X_(k); that worker is not paid], so the n marginals sum to (n−k)·E X_(k). With linear cost, each marginal equals c_i/R in equilibrium. So E X_(k) = n·c̄/((n−k)R) exactly, for any spread, whenever every worker races. The note also missed Clark and Riis (1996), whose multiple-prize lottery contest is this exact race, and it credited Stein (2002) only as "related" though he gives the k = 1 exit rule.

## What was fixed in this PR

The scores above are from before these fixes. A later round re-audits. Each audit file marks the defects fixed with `fixed_by`.

- **race-heterogeneity:** the integral now runs in ln t across every rate scale. It agrees with adaptive quadrature to 1e−6, including a case where two rates differ 1,000-fold, which my first fix (scaling by the slowest rate) got 18% wrong. Rerun, the law holds within 0.00% in all 12 cases, where the earlier version had 6 of 12. Section 4 now states and proves it as a proposition, with a correction note. The E2 round times at ratios 4 and 8 are corrected, Clark–Riis is cited and Stein is credited. Three new tests; two fail on the old integral.
- **simdesign-meshconverge:** the mesher used a dense distance matrix that crashed below h ≈ 0.3 mm. A KD-tree replaces it and gives an identical peak (100.7405 MPa), and a test now meshes h = 0.25. The fillet-floor explanation is replaced by the 24- against 96-segment result. Dead code is removed, and the leftover question from the parent project is fixed.
- **changepoint-detector:** the BIC claim is qualified with the benchmark figure. A new test pins the variance floor and catches the mutant that survived. The test count and the privacy event list are brought up to date.
- **brevo-contacts-csv-check:** date shapes are now day-first, month-first or ambiguous, and an ambiguous date conflicts with neither. The 15-digit SMS limit no longer counts a `00` prefix. Two new tests; both fail on the old code. The calculator boilerplate in `llms.txt` is replaced with what the tool does.
- **lawn-care-bid-calculator:** the FAQ sentence (with a test tying it to the computed shares), the summary label, "52 minutes" and the README events list are corrected. The high defect is logged as a known gap in the README, with a workaround: until it is fixed, enter the in-season share. Fixing it changes every published figure on three pages, so it is work for its own PR.

Still open: the lawn-care fixed-cost recovery, crew travel and blank fields; Brevo's other identifiers and duplicate SMS numbers; a proper grid-convergence study with a refined fillet for meshconverge; the size of the flagship's engine and README.

## Since the last round

Round 87 put 0 of 5 at the bar, and its tests caught 15 of 25 seeded bugs. Round 88 puts 1 of 5 there, with 11 of 20 caught. The one is a flagship, which is chosen, not sampled.

The research finding repeats a pattern from round 87, inverted. There, careful work had not been carried back into the headline. Here, a numerical error was written up as a finding: a gap that grew with spread looked like a real effect, and nobody checked the integral against an outside quadrature. A one-line test against `scipy.integrate.quad` would have caught it.
