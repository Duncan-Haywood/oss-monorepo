---
title: "Quality audit round 87: 0 of 5 at the bar, a break-even that read 0 for never, and headlines a rerun undid"
seo_title: "Quality audit 87: a break-even of 0 that meant never"
date: 2026-11-19
tags: [quality-audit, evaluation, testing]
description: "0 of 5 meet the bar. A 3PL quote tool printed 0 orders for a break-even that does not exist; two research headlines rested on a capped rate and 6-seed means."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the five `2026-11-19-*` files with seed `2026-11-19-n-5b9b` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every bug the auditor seeded by hand. Every score was set before any fix.

This round ran in mode `sample`. It drew the flagship `ventures/league-schedule-generator`, two ventures and two research projects. No platform directory was drawn, because every one has been audited in the last 90 days. Only the flagship had been audited before, last on 2026-11-10; it has had a week of work since, including an Americano scorer. Before accepting each auditor's file I reran one of its checks myself, and every one reproduced:

- **league-schedule-generator:** a mirrored double round robin has 12, 18, 24 and 30 home/away breaks at 6, 8, 10 and 12 teams. Playing leg one's rounds in reverse with venues swapped gives 8, 12, 16 and 20, which is 2(n−2), and still gives each pair one home game and one away.
- **3pl-quote-normalizer:** the default quote gives `1419.20 14.19 345` (monthly total, cost per order, break-even orders). By hand: 100 × (0.18 + 3.00 + 0.60 + 8.50 + 0.232) + 18 + 150 = $1,419.20, and 168 / (13 − 12.512) = 344.3 orders.
- **storage-auction-max-bid-calculator:** the defaults give `482.14 57.14`. By hand: (4,000 × 0.35 × 0.85 − 650) / 1.12 = $482.14 at break-even, and (1,190 × 0.6 − 650) / 1.12 = $57.14 at a 40% margin.
- **sensing-gatecorr:** the realised wrong-observation share at rate 0.102 is `0.083, 0.102, 0.101` at spans 1, 2 and 12. I also reran the independent 10.2% near-miss trial myself: the gate plus a Cauchy loss scored 0.0037, the RANSAC start 0.0056, and recall was 0.84.
- **sensing-mixgate:** from the 24-seed results, at ratio 0.9 the medians are 0.0712 for the RANSAC start and 0.0565 for the gate, and the gate wins 11 of 24 seeds. At 0.8 they are 0.0106 and 0.0084, with 17 of 24 wins and a sign-test p of 0.064.

## The number

**0 of 5 subjects meet the bar.** Across every sampled audit, 35 of 359 now meet it (Wilson 95% interval 7% to 13%). All five are finished (completeness 3): each does what it says, and none does it at the level a senior practitioner would sign.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/league-schedule-generator (flagship) | 3 | 3 | 3 | 2 | 2 | 3 | 3 | no |
| ventures/3pl-quote-normalizer | 2 | 3 | 3 | 2 | 3 | 2 | 2 | no |
| ventures/storage-auction-max-bid-calculator | 3 | 3 | 2 | 3 | 2 | 3 | 2 | no |
| research/sensing-gatecorr | 2 | 3 | 1 | 2 | 2 | 2 | 2 | no |
| research/sensing-mixgate | 2 | 3 | 1 | 2 | 1 | 1 | 2 | no |

Of 25 bugs seeded by hand, the tests caught 15: the flagship 4 of 5, the 3PL tool 6 of 7, the storage-auction calculator 3 of 6, sensing-gatecorr 1 of 3 and sensing-mixgate 1 of 4.

## Each subject

**league-schedule-generator (flagship).** The reviewer is a rec-league coordinator who also runs Americano nights. The full suite passes, 777 tests in 7 min 23 s. The auditor wrote independent checkers, and they found no failures:

- round robins for 2 to 24 teams, single and double: every pair meets once per leg, no team plays twice in a round, byes are even, and home/away counts are within one;
- n−2 breaks for every single round robin with an even number of teams, which is the proven minimum;
- all 31 stored Americano rotations: everyone partners once and opposes twice;
- Swiss pairings: no rematches.

The goals-for tie-break mutant, which survived in two earlier audits, is now caught. Claims is the gate it fails. The README said "the minimum possible breaks" for single or double, but the default double is a plain mirror with 3(n−2) breaks, and a reversed second leg reaches 2(n−2). The worst logic error (medium): the head-to-head mini-table counts a 3-2 volleyball win as a full win even when the league's 2-1 set scoring is on, so two teams level on points can be ranked the wrong way round. Two low defects:

- The Americano "average" sit-out credit multiplied an average already rounded to 0.1. For 63 points in 4 games and 2 sit-outs it gave 31.6, not 31.5.
- `calc.mjs` is now 4,149 lines, up from 3,197.

**3pl-quote-normalizer.** The reviewer is an e-commerce operations manager comparing fulfilment rate cards. 9 of 10 hand recomputations matched, including break-even volume, the account minimum and the restock-or-destroy comparison for returns. The worst defect is high severity. When the 3PL's variable cost per order is above the in-house rate (in-house $10 against $12.51), no break-even exists, but the summary, the page and the CSV/JSON export all said "about 0 orders". That is also what the tool prints when the 3PL is cheaper at every volume, so one figure stood for two opposite decisions. Other defects:

- Saved return fees were not restored on reload.
- The in-house side is a single per-order rate, so in-house rent folded into it scales with volume.
- There is no cubic-foot storage and no peak surcharge.
- Inbound pallets are billed fractionally.

**storage-auction-max-bid-calculator.** The reviewer is an experienced storage-auction reseller. The core math is right: the buyer's premium is added on top of the hammer price, the cleaning deposit is kept out of profit, and an untested second scenario also matched by hand. Verification and claims are the gates it fails:

- Tests: 3 of 6 seeded bugs survived. Two of them swapped the break-even and target-margin ceilings in the overbid flags; no test put a bid between the two ceilings, which is the split the product exists for.
- The cleanout guide's worked example was wrong. It said a 10 person-hour job "still misses" a 48-hour window solo.
- The "$800 rule-of-thumb bid" was called "a guaranteed loss before cleanout even starts", but the $896 purchase is below the $1,190 net resale. The $356 loss appears only once the $650 cleanout is counted.

The medium gaps a reseller would hit:

- no sales-tax input, though both large platforms say the facility collects it unless the buyer holds a resale certificate;
- a removal-window check that assumes round-the-clock access, where facilities only open in gate hours;
- no buyer's-premium minimum.

**sensing-gatecorr.** The reviewer is a structure-from-motion researcher. The full sweep reran byte-for-byte, and the 8-point fit and Sampson gate match Hartley and Zisserman to machine precision. The worst defect is high severity. The probability that a feature is bad, `rate × 12 / span`, is silently capped at 1. At span 1 and ratio 0.8 that is 1.22, so every feature is wrong in exactly one view, and the cell runs at 8.3% wrong, not 10.2%. The headline's span-1 anchor ("a 1.7x lead, recall 0.81") came from that cell. The genuinely independent 10.2% case gives 1.5x and recall 0.84: the finding points the same way, but the lead is smaller than claimed. The rate test used a band of 0.06 to 0.14 that could not see the shortfall. A 17% rate error survived it. The repeated-structure SfM literature (Zach et al. 2010, Heinly et al. 2014, COLMAP) is not cited.

**sensing-mixgate.** Same reviewer. The experiment reran byte-identically in 10 min 19 s, and the mismatch generator checks out against camera-derived fundamental matrices. The worst defect is high severity: the headline quoted 6-seed means that the project's own 24-seed rerun had overturned.

- At ratio 0.9 the README said the gate loses (0.130 against 0.082). By 24-seed medians it is a tie (0.057 against 0.071, 11 of 24).
- At 0.8 the 2.65x lead is 1.26x, with overlapping intervals and p = 0.064.
- The advantage is established only at 0.7 and 0.6.

There is also a design flaw (medium). The "along the epipolar line" error type was measured on a stereo pair and applied to a 12-view orbit. Only about 60% of along errors lie along the line for a pair the gate actually tests, which flatters the gate. Two sibling projects, `sensing-gatemix` and `sensing-matchmix`, run nearly the same experiment, and none of the three cites the others. 3 of 4 seeded bugs survived.

## What was fixed in this PR

The scores above are from before these fixes. A later round re-audits. Each audit file marks the defects fixed with `fixed_by`.

- **3pl-quote-normalizer:** no break-even now reads "none", in the summary, on the page and in the export (`null` in JSON). Three tests cover it. The README test command runs all nine files. 139 of 139 tests pass.
- **storage-auction-max-bid-calculator:** the overbid flags compare against the unclamped ceilings, so a $0 bid no longer "clears" an unreachable 60% target. The loss banner hides the overbid banner. The "$800 bid" wording now puts the $356 loss after cleanout. The cleanout guide's example is replaced by one that is true and names gate hours as the tool's limit. Five new tests, including the bid-between-the-ceilings case that catches both surviving flag mutants. 71 of 71 pass.
- **league-schedule-generator:** the sit-out credit is computed from the unrounded average, with a test that catches the old formula. The README qualifies the break claim for the double round robin (3(n−2)), and a test pins that. The README test command is fixed.
- **sensing-gatecorr:** the README discloses the span-1 cap and restates the headline from the independent case, which I reran (1.5x, recall 0.84). A new test holds the rate to within 0.006 of 0.102 at spans 2 to 12 and checks the cap at span 1. It catches the 17% rate mutant.
- **sensing-mixgate:** the headline, lede and summary are restated from the 24-seed medians. The wrong table-B sentence is corrected. The along-error limit and the uncited sibling and external work are listed. A test checks that the headline quotes the 24-seed table, and it catches a revert to the old numbers.

Still open, logged in each subject's README, NEXT.md or Limitations:

- the volleyball head-to-head, the reversed second leg and the size of `calc.mjs` in the flagship;
- the return-fee reload, the in-house fixed-cost model and the rate-card gaps in the 3PL tool;
- sales tax, gate hours and the premium minimum in the storage-auction calculator;
- the along-error rerun and the duplicate projects in sensing, which are research work.

## Since the last round

Round 86 put 1 of 5 at the bar, a flagship, and its tests caught 13 of 22 seeded bugs. Round 87 puts 0 of 5 at the bar, with tests catching 15 of 25. The flagship moved on the evidence: its last surviving mutant is now caught, and its engines passed an independent checker. It still missed on one sentence of its README. The two research projects show a pattern this programme keeps finding. The authors did the more careful work (24 seeds, a rate test) and then did not carry its result back into the headline. A test that ties the headline to the results file is cheap, and both now have one.
