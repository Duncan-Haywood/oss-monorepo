---
title: "Quality audit round 91: 0 of 4 at the bar, and blank fields that quietly priced as zero"
seo_title: "Quality audit 91: blank fields that quietly priced as zero"
date: 2026-11-22
tags: [quality-audit, evaluation, testing]
description: "0 of 4 sampled subjects meet the bar. The arithmetic held in all four, but tests missed 10 of 22 seeded bugs and two calculators priced blank fields as $0."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the four `2026-11-22-*` files with seed `2026-11-22-b-8102` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `brrrr-calculator`, `paver-patio-bid-calculator`, `position-rent` and `selfrep-closure`. Each file lists every check and every bug the auditor seeded by hand. Every score was set before any fix.

This round ran in mode `sample`. It drew two ventures and two research projects, none of them audited before. No flagship was drawn, because every flagship has been audited in the last 7 days. No platform directory was drawn either, because each one has been audited in the last 90 days. Before accepting each auditor's file I reran one of its checks myself, and every one reproduced:

- **brrrr-calculator:** the sample deal's monthly payment is $1,247.44. The standard amortisation formula for $187,500 at 7% over 30 years gives the same figure.
- **paver-patio-bid-calculator:** a 14 × 22 ft herringbone patio prices at $5,534.74, and the cost of $4,317.10 divided by (1 − 0.22) gives the same.
- **position-rent:** a direct enumeration of H(y | s₀.₇) − H(y | s₀.₇, s₀.₈) gives 0.1636617. That matches the second-seat rent `pair_premium` reports.
- **selfrep-closure:** a script that does not import the package gives 45.1% of lines, 44.2% of units, 24.1% of mass and 21.1% of cost closed for the brass + casting shop, which matches `results.txt`.

## The number

**0 of 4 subjects meet the bar.** All four were randomly sampled. Across every sampled audit, 36 of 372 now meet it (Wilson 95% interval 7% to 13%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/brrrr-calculator | 3 | 3 | 2 | 3 | 3 | 2 | 3 | no |
| ventures/paver-patio-bid-calculator | 2 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| research/position-rent | 3 | 3 | 2 | 2 | 3 | 2 | 2 | no |
| research/selfrep-closure | 3 | 3 | 1 | 2 | 2 | 2 | 2 | no |

Of 22 bugs seeded by hand, the tests caught 12:

| subject | seeded bugs caught |
|---|---|
| brrrr-calculator | 2 of 4 |
| paver-patio-bid-calculator | 6 of 8 |
| position-rent | 3 of 5 |
| selfrep-closure | 1 of 5 |

In all four subjects the independently recomputed arithmetic matched, so as in round 90 the weak point is the tests and the method, not the sums. Three of the four miss on verification. The paver tool is the exception: its tests are good, but what it multiplies is not what a supplier bills.

## Each subject

**brrrr-calculator.** The reviewer is a buy-rehab-rent-refinance-repeat (BRRRR) investor who has closed cash-out refinances. Six outputs matched an independent script to the cent: cash invested, cash left in the deal, the loan payment, the highest price that leaves no cash in, the rent-capped refinance loan and the 70% rule. The worst defect is high. The optional fields showed realistic grey example values (property tax 2,800, insurance 1,500, management 8%, a minimum DSCR of 1.1), but a blank field counted as 0. A user who typed only price, after-repair value and rent, as the page asks, got an NOI of $22,743 instead of $16,288. That overstates cash flow by about $6,455 a year and silently switches off the rent-based loan cap. Two mutants in that cap survived: closing costs charged on the wrong loan, and HOA left out. The refinance is always sized on the after-repair value, with no seasoning or cost-basis limit, so after the default 6-month hold the headline number is the optimistic case.

**paver-patio-bid-calculator.** The reviewer is a hardscape contractor who bids patios. All five bids recomputed by hand matched to the cent, and the suite is strong: 6 of 8 mutants caught. Correctness and domain are 2 because the quantities are not what gets billed. Base stone is priced on compacted in-place cubic yards with no compaction factor and no option to price by the ton. Spoil is priced on the volume in the ground, with no swell. The base does not extend past the paver edge, which ICPI-style installation guidance recommends. With 6 in of extension and 1.25 for both compaction and swell, the default patio costs $4,714.93 against the tool's $4,381.10, about 7.6% low. Three smaller problems:

- a blank wage priced the job with no labour ($3,096.92);
- an FAQ answer overstated how much more a driveway digs out;
- the comparison page said Aspire's plans are "tiered by annual revenue", which no file backs.

**position-rent.** The reviewer is a market-design referee. The tests pass, `run.py` and the figure reproduce exactly, and an independent script matched every headline number. A separate LMSR simulation gives a market-maker loss of 0.3098 against 0.3095 exact. The worst defect is on novelty. Result 1, that expected LMSR profit equals conditional mutual information and telescopes to at most b ln 2, is the known log-score and chain-rule identity from Hanson (2003, 2007). The paper presented it as a result with no bibliography. The entry-cost results rest on one unsourced parameter pair (a = 0.7, c = 0.005) with no sweep. In the code, `entry_count(0.9, 1, 0.005)` crashed with an OverflowError at the default settings. Two mutants survived: a halved Chernoff constant, and the wrong seat in `pair_premium`.

**selfrep-closure.** The reviewer is a self-replicating-systems referee. `run.py` and the figure reproduce byte for byte, and the closure shares recompute exactly. Leaving out the fasteners, the printer alone makes 18 of 38 lines (47%), in line with RepRap's commonly quoted figure of about 48%. Verification is 1: no test checked any headline number, and 4 of 5 mutants survived. The worst defect is in the research design. The sensitivity analysis gives each part line its own random factor, so errors average out across the 18 printed lines. If every printed-part cost is wrong by 2x together, printer-alone cost closure moves from 11.4% to 34.1%, against a reported range of 9 to 15%, and the README's "at most 30%" robustness sentence rests on that narrow range. Cost closure also counts imported filament and aluminium inside makeable parts as closed. The project does not engage the closure literature (Freitas and Gilbreath 1982; Moses, Yamaguchi and Chirikjian 2014; Ellery 2016).

## What was fixed in this PR

The scores above are from before these fixes. A later round re-audits. Each audit file marks the defects fixed with `fixed_by`.

- **brrrr-calculator:** every optional placeholder now shows the value a blank field really uses, and a note says so. A test fails if a placeholder and the blank-field default drift apart: it fails on the old page. A new test covers HOA and closing costs in the rent-based cap. The refinance seasoning gap, the hard-money interest timing and the two DSCR definitions are in the README's "Known gaps". 30 of 30 tests pass.
- **paver-patio-bid-calculator:** a blank numeric field is now an error, not $0. The driveway FAQ (visible and JSON-LD) says what the engine computes, and a test ties the ratio to the engine. The unbacked Aspire revenue-tier claim is removed, and a test keeps it out. Base and spoil factors are in "Known gaps". 139 of 139 tests pass.
- **position-rent:** a numerically stable log-sigmoid ends the overflow, with a test at a = 0.9. A Chernoff test pinned to −ln 0.6 and a second-seat test pinned to the enumerated 0.1636617 catch both surviving mutants. The paper gains a related-work section and says plainly that Result 1 is a known identity. The research homepage now says that *error* falls roughly as 1/b, not accuracy. 11 tests pass.
- **selfrep-closure:** a headline test catches all four surviving mutants. The README compares the 47% with RepRap's figure, corrects "below 25%" to "at most 24%", and carries a "Known gaps" section on correlated sensitivity, placeholder masses, imported feedstock and prior work. 9 tests pass.

## What changed since the last round

Round 90 had 0 of 5 at the bar. The sampled share is unchanged at 36 out of 368, now 36 out of 372. The pattern carries over: the arithmetic held in all four subjects, and verification was the binding gate in three.

One new pattern stands out. Two calculators, built at different times, treated a blank field as zero while showing a plausible number in grey. A user reads the grey number as the assumption in use. This is the `input-handling` category the taxonomy already names ("a blank field silently becomes the example value"), here in its mirror image: the example is shown but not used.
