---
title: "Quality audit round 103: 0 of 4 at the bar, and a fillet peak that was a sampling bias"
seo_title: "Quality audit 103: a fillet stress peak that was a sampling bias"
date: 2026-11-23
tags: [quality-audit, evaluation, testing]
description: "0 of 4 sampled subjects meet the bar. A stress study blamed a singularity for what was centroid sampling; two venture parsers misread common input."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in four `2026-11-23-*` files with seed `2026-11-23-c-efea` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `tax-season-client-picker`, `route-account-pruner`, `ambient-hlrtlevel` and `simdesign-meshmargin`. Each file lists every check and every bug seeded by hand. Every score was set before any fix.

This round ran in mode `sample`. It drew two ventures and two research projects, none of them audited before. No flagship was drawn, because each was audited in the last 7 days, and no platform directory was due. Before accepting each auditor's file I reran its worst finding myself:

- **tax-season-client-picker:** `parseJobs("A,$1,200,8,3,40")` returned one client with a $1 fee, 200 hours and due day 8, and no error.
- **route-account-pruner:** a sheet headed `Name,Price,Visits,Driving minutes,Minutes on site` came back with 8 minutes on site and 45 minutes of driving. The sheet says the reverse.
- **simdesign-meshmargin:** on the same bracket, the centroid reading of peak stress rose from 99.9 to 132.8 MPa as h went from 2.5 to 0.5 mm. The vertex reading moved only from 139.0 to 143.7 MPa.
- **ambient-hlrtlevel:** the auditor's own Clopper-Pearson intervals and its own L-BFGS null fit matched the README to within 4e-8. A valid Monte Carlo p-value with B = 39 has mean 41/80 = 0.5125, not 0.5.

## The number

**0 of 4 subjects meet the bar.** All four were randomly sampled. Across every sampled audit, 38 of 421 now meet it (Wilson 95% interval 7% to 12%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/tax-season-client-picker | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| ventures/route-account-pruner | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/ambient-hlrtlevel | 3 | 3 | 1 | 2 | 3 | 2 | 2 | no |
| research/simdesign-meshmargin | 2 | 3 | 1 | 2 | 2 | 2 | 2 | no |

Against the code as it was audited, the tests caught 8 of 25 bugs seeded by hand:

| subject | seeded bugs caught |
|---|---|
| tax-season-client-picker | 4 of 8 |
| route-account-pruner | 2 of 6 |
| ambient-hlrtlevel | 1 of 5 |
| simdesign-meshmargin | 1 of 6 |

All four miss on verification. As in round 101, the arithmetic mostly checks out. The weak points are the tests and the reading of real input.

## Each subject

**tax-season-client-picker.** The reviewer is an enrolled agent who runs a solo practice and sorts late-season requests. The auditor wrote an exact-fraction subset search that simulates each schedule day by day, without using the engine. On the fixture it matched the tool: $3,555 net over 41 hours, five clients accepted. It also matched on 150 random queues and 266 break-even fees, with 0 mismatches. Defects:

- **Medium:** rows were split on every comma. A fee typed `$1,200` became a $1 fee and 200 hours, and the client was then declined as "cannot be finished". A quoted name containing a comma was rejected.
- **Medium:** the tie test could not detect the documented fewer-hours tie-break, because both tied sets used 8 hours. Reversing the rule left every test green.
- **Medium:** committed work can be entered only as one block with one due day. "File an extension and finish later" is not one of the choices.
- **Low:** "worth accepting at $1,470" was wrong at the boundary. At exactly $1,470 the client is still declined.

**route-account-pruner.** The reviewer is a route-service operations manager who runs cost-to-serve reviews. The auditor's own Python reproduced the sample: $197.47 a month surplus now, $1,476.62 after the plan, 10 accounts repriced and 5 dropped. It also reproduced the hour-value sensitivity. Defects:

- **Medium:** the drive-column match missed "driving", so common headers silently swapped on-site and drive minutes.
- **Medium:** the headline "expected gain" of +$1,279 a month counts every freed hour as refilled at the hour value. In cash, the five dropped accounts lose $1,305.80 a month.
- **Medium:** under the default cancellation response, every recommended raise sits at the 25% cap, and the page did not say so.
- **Medium:** two surviving mutants put net revenue where monthly revenue belongs, in both the reprice surplus and the break-even increase. A "Price per visit" header was read as a monthly price without a warning.

**ambient-hlrtlevel.** The reviewer is a statistician who works on bootstrap likelihood-ratio tests for mixtures. The full 31-minute experiment reran byte for byte, giving 11, 9 and 8 rejections in 200 at n = 100, 200 and 500. Defects:

- **Medium:** the tests check only that p lies in [0.25, 1] on one draw. A null fit reduced to one auditor, and a p-value denominator of B instead of B + 1, both pass.
- **Medium:** the parent project's other anomaly, 0 of 60 at n = 1000, is not rerun. That anomaly is cited on the first line.
- **Medium:** no prior work on the method is cited, such as McLachlan (1987) on the bootstrap LRT for mixture components, or Davison and Hinkley (1997) on Monte Carlo tests. "The level holds when the model is right" is the expected result.
- **Low:** mean p was compared with 0.5. The right benchmark for B = 39 is 0.5125.

**simdesign-meshmargin.** The reviewer is a structural analyst who signs off finite-element stress checks. The auditor's own script rebuilt all 12 rows of the results table, and analytic masses agreed to 2e-7. A Castigliano beam check put the tip deflection at 0.78–0.89 of slender-beam theory, which is the expected stiffening from the corner. Defects:

- **High:** peak stress is read at element centroids, about h/3 inside the surface. So most of the "mesh dependence" the project studies is a sampling bias, the same one `research/simdesign-kirsch` measured on a plate with a hole. Read at element vertices, the designs sit at 0.94–1.10 of the limit, against 0.88–1.02 on the centroid reading. A margin nearer 1.43 than 1.3 would be needed.
- **Medium:** the README blamed the rising peak on sharp-corner singularities. The peak is on the fillet.
- **Medium:** the README called the laser price of 1.22 possibly optimiser noise. It is forced by the rules: at 2 mm sheet, the width cap leaves 86.5 MPa against a 76.9 MPa limit.
- **Medium:** 5 of 6 seeded bugs survived. No test pins a finite-element output to an analytic case.

## What was fixed in this PR

All of these fixes landed after the scores were set. A later round re-audits them.

- **tax-season-client-picker:**
  - A quote-aware CSV splitter, plus a clear error for an unquoted thousands comma.
  - The break-even wording now says "above".
  - A tie test that catches the reversed rule (checked with the seeded mutant).
  - Tests for spare hours and the zero-net reason.
  - The CLI refuses a second file.
- **route-account-pruner:**
  - "Driving" headers are matched, and a column already taken no longer falls back silently.
  - Caveats on the gain tile and on raises at the cap.
  - A warning for a per-visit header.
  - CSV cells are quoted and formula characters defused.
  - Tests that catch both net/monthly mutants (one checked by rerun).
- **simdesign-meshmargin:**
  - The README now gives the vertex figures, the cause of the rising peak and why the laser price is forced.
  - The same correction in the `simdesign-kirsch` README, the research index and the homepage summary.
- **ambient-hlrtlevel:**
  - The 0.5125 benchmark.
  - The missing prior work and the untested gaps are now stated in the README.

## Still not at the bar

The meshmargin experiments still run on the centroid reading; rerunning them with a recovered stress is research, not a text fix. Neither research project has tests that would catch a wrong core number, and both are copies of a parent's engine. The two ventures each have a model gap a professional would hit in the first hour: crew labour for the route tool, and extensions and staggered deadlines for the tax-season picker. These are listed in each README's limits, with a link to its audit.
