---
title: "Quality audit round 83: 2 of 5 at the bar, and an invoice checker that dropped cents above ten billion"
seo_title: "Quality audit 83: invoice cents above 10^10, a bisection artefact"
date: 2026-11-19
tags: [quality-audit, evaluation, testing]
description: "2 of 5 subjects meet the bar. An e-invoice checker lost cents on amounts of 10^10, and a 13x grasp-force result was a bisection probe landing in a pocket."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the five `2026-11-19-*` files with seed `2026-11-19-j-4c63` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every bug the auditor seeded by hand. Every score was set before any fix.

This round ran in mode `sample`. It drew the flagship `ventures/einvoice-preflight`, two ventures and two research projects. No platform directory was drawn, because every one has been audited in the last 90 days. Only the flagship had been audited before, on 2026-11-09. Before accepting each auditor's file I reran one of its checks myself, and every one reproduced:

- **einvoice-preflight:** `roundHalfUpToCents(12345678901.23)` returned 12345678901.2, and `roundHalfUpToCents(13703703580.37)` returned 13703703580.4.
- **restaurant-pos-menu-mix-analyzer:** on an eight-entree Toast-style file, plate costs sum to 717.00 by hand. That gives an average contribution margin of (2229 − 717) / 100 = 15.12, matching the tool's 15.1200. Roast Chicken (margin 15.84, 25% of plates) is the only Star.
- **robofab-solrefsafe:** a 0.5 N force scan of the solref 0.5 ms / step 0.4 ms / refsafe-off cell first holds at 1.23 times the bound (400 m/s²) and 1.14 times (800 m/s²). The bisection's first probe, at 30 N, lands in a slipping pocket, so the table said 13.26 and 6.71.
- **buildbot-sheathing:** the joint window is ((0.75 − 0.0655) − (0.0625 + 0.375)) / 2 in = 0.1235 in = 3.137 mm, as in the README.
- **retail-pilot-intel:** I did not rerun the report myself. I did confirm that the README's live-page URL is excluded from the site build (`EXCLUDED_SLUGS` in `platform/pages/build.mjs`) and checked the "+0.3 pp = 1.5 sales a week" arithmetic by hand: 350 × 0.003 = 1.05.

## The number

**2 of 5 subjects meet the bar**: 2 of the 4 sampled, and not the flagship. Across every sampled audit, 35 of 343 now meet it (Wilson 95% interval 7% to 14%). Four of the five are finished (completeness 3); retail-pilot-intel is not.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/einvoice-preflight (flagship) | 3 | 3 | 2 | 2 | 2 | 3 | 3 | no |
| ventures/restaurant-pos-menu-mix-analyzer | 3 | 3 | 3 | 3 | 3 | 2 | 2 | yes |
| ventures/retail-pilot-intel | 2 | 1 | 2 | 3 | 1 | 1 | 2 | no |
| research/buildbot-sheathing | 3 | 3 | 3 | 3 | 3 | 2 | 3 | yes |
| research/robofab-solrefsafe | 2 | 3 | 2 | 2 | 2 | 1 | 2 | no |

Of 32 bugs seeded by hand, the tests caught 21. buildbot-sheathing's suite caught 6 of 6 and the menu-mix suite 5 of 6. retail-pilot-intel's caught 5 of 11.

## Each subject

**einvoice-preflight (flagship).** The reviewer is an e-invoicing compliance consultant who checks EN 16931 and Peppol BIS invoices before they go to a tax portal. Much of it is strong:

- The official-rules route gave the same failed-rule ids as CEN's own EN 16931 Schematron 1.3.17 (run under SaxonC-HE) on 600 random UBL invoices and on all 9 shipped examples.
- VAT number checks agree with python-stdnum 2.2 on 11,944 of 12,000 random numbers. The 56 differences are ones the README already documents.
- IBAN and Leitweg-ID check digits are right, and the German mandate dates match the finance ministry's FAQ.

The worst defect is new and high severity. The fix for half-cent rounding (PR #16129) rounds the amount in cents to 12 significant digits, so any amount of 10^10 or more lost its cents. On a correct Indonesian rupiah invoice of 12,345,678,901.23 at 11%, CEN and the Python CLI found nothing wrong. The page reported three errors and told the user to "set gross total to 13703703580.30" (the right figure is .37). The UBL repair then turned the valid file into one CEN rejects. Other defects:

- The claim that the page and the CLI run the same rules is still false. This is the fourth audit to report it.
- A VAT subtotal one cent off taxable × rate is a blocking error here, while CEN's BR-CO-17 accepts it within one unit.
- The 139 tests of the official route are skipped in CI.
- The Bulgarian and Czech remainder-10 branches are still untested: 2 of 5 seeded bugs survived.

**restaurant-pos-menu-mix-analyzer.** The reviewer is a restaurant consultant who runs menu-engineering reviews from point-of-sale product-mix reports. The Kasavana and Smith method is implemented as published: a popularity bar at 70% of an even share and a weighted-average contribution margin. An independent Python implementation matched it on all 14 sample items, and a hand-worked Toast-style file matched too. The suite caught 5 of 6 seeded bugs. Two medium defects keep domain and fitness at 2:

- It builds one matrix across every category, so House Fries and Cold Brew compete with the mains, and every dessert comes out a Dog.
- A food-cost column written as fractions (0.38) was read as 0.38%, flipping Pork Chop and Roast Chicken between Star and Plowhorse with no warning.

**retail-pilot-intel.** The reviewer is a retail analytics consultant who joins door counts to till data for small stores in Italy. The working core is a till-export importer, a SQLite store and a daily report. On the shipped fixture it gives 3 purchases, a 0.0638 conversion rate and 103,800 cents, matching Python's own reading of the same CSV. The problems:

- The daily numbers are counted by UTC date and never split by store. A second store's receipt, or a sale at 00:30 in Rome, lands in the wrong store or the wrong day, and euros and dollars are summed into one revenue figure.
- The README linked a live page that returns 404.
- The portal described hourly Europe/Rome buckets that do not exist.
- The door camera is a stub, and SKU gap, upsell and experiments are demo data, which is why completeness and claims score 1.

**buildbot-sheathing.** The reviewer is a construction-robotics researcher reviewing for *Automation in Construction*, with a wood-frame structural engineer checking the code inputs. The checks all held:

- 222 tests pass.
- `reproduce.py --check` reproduces 10 of 10 experiments.
- `check_numbers.py` binds 419 of 419 paper numbers to result files.
- Nine results recomputed independently from geometry and statics all match.
- The tests caught all six seeded bugs.

The gaps are in research design. Related work leaves out tolerance analysis of construction assemblies published in the target journal itself (Rausch et al. 2017). Twenty milestones tune a humanoid against a 0.03 mm specification that no source gives. A highlight quoted 99.94% clean sheets without saying that this holds only at the lower published stud warp; at the higher warp the figure is 94.04%.

**robofab-solrefsafe.** The reviewer is a robotics simulation researcher who tunes MuJoCo contact parameters. The experiment reruns byte for byte, and the `refsafe` behaviour matches the MuJoCo documentation's max(solref, 2 × timestep) rule on an independent box-on-plane model. The worst defect is the force search. Whether the part holds is not monotone in force in one cell, and the bisection's first probe fell in a slipping pocket. The README called the resulting 13.3x and 6.7x "unphysical"; they came from the search, not the physics. Other weaknesses:

- Nothing tested the search or the instability branch.
- The nearest prior work is not cited.
- The result restates documented MuJoCo behaviour, which is why fitness scores 1.

## What was fixed in this PR

The scores above are from before these fixes. A later round re-audits.

- **einvoice-preflight:** the rounding idiom now uses 15 significant digits, in all seven copies. That keeps cents exact up to about 10^13 and still rounds 0.285 to 0.29. A new test with the rupiah invoice fails under the old precision. The suite passes: 2,169 tests, 0 failures, 139 skipped as before. The open items are in `NEXT.md`.
- **restaurant-pos-menu-mix-analyzer:** if every food-cost value in a file is 1 or less, the values are read as fractions, and the page says so. The fraction file now classifies exactly like the percent file. There is a new test, and the per-category gap is listed under "Known gaps".
- **robofab-solrefsafe:** the search now scans 24 forces upward before it bisects, through `first_hold`. A new test uses a deliberately non-monotone predicate. On the rerun:
  - Both cell counts stay at 11 and 10 of 32.
  - The two outlier cells become 1.06x and 1.05x.
  - The README now explains the correction and warns that this cell can slip again at a higher force.
- **buildbot-sheathing:** the highlight now says "(94% at high warp)", and `check_numbers.py` binds that figure too (420 of 420). The abstract is at its 150-word limit, so its unqualified 99.94% is still open. The stale check count is fixed.
- **retail-pilot-intel:** the dead live-page link is gone and `llms.txt` agrees. The sales-per-week figure is now 1.05, and the portal says its numbers are UTC days. The store and time-zone defect and the rest are listed under "Known gaps".

## Since the last round

In round 81, earlier today, 1 of 5 subjects met the bar, and claims and verification bound all four sampled ones. This round two of the sampled four clear it. Both have test suites that caught nearly every seeded bug, and numbers mechanically tied to their result files.

Two of the worst defects this round have the same shape: a fix or a search that was right on the cases someone thought of. The rounding fix was tested on 0.285 but not on a ten-digit total. The bisection assumed hold/slip was monotone, and nothing tested a function that is not.
