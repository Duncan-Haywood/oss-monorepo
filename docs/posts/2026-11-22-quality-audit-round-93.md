---
title: "Quality audit round 93: 0 of 4 at the bar, and a Schulze count that agreed with its own copy"
seo_title: "Quality audit 93: a Schulze count that agreed with its own copy"
date: 2026-11-22
tags: [quality-audit, evaluation, testing]
description: "0 of 4 sampled subjects meet the bar. A ballot counter's crosscheck shared its bug, and a liner bid ignored the measured area a contractor typed in."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in four `2026-11-22-*` files with seed `2026-11-22-d-6938` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `ranked-ballot-counter`, `vinyl-liner-bid-calculator`, `inference-substitution` and `accel-lutsize`. Each file lists every check and every bug seeded by hand. Every score was set before any fix.

This round ran in mode `sample`. It drew two ventures and two research projects, none of them audited before. No flagship was drawn, because each was audited in the last 7 days. No platform directory was drawn either, because each was audited in the last 90. Before accepting each auditor's file, I reran one of its findings myself:

- **ranked-ballot-counter:** I used the ballots `20: C2 > C1`, `15: C3 > C1 > C0` and `20: C0 > C2 > C1 > C3`.
  - C0 beats C2 35 to 20 head to head. C2's strongest path back runs through C1 and is min(40, 35) = 35. The paths tie, so Schulze (2011) names C0 and C2 together.
  - The tool printed `C2 > C0 = C1 > C3`.
- **vinyl-liner-bid-calculator:** in a browser, I typed 1,200 sf over the suggested 960.64 sf liner area. Order square feet stayed at 1,037.49 and the price stayed at $5,319.79.
- **inference-substitution:** experiment E6 is the cost-optimal check rate.
  - From its own row, cost at f = 1 is Nc + hK = 127,200, so hK = 27,200.
  - Then f\* = (27,200 / 200,000)^(2/3) = 0.2645, as reported.
  - The cost at f\* is 3·N·c·f\* ≈ 79,350, against 79,337 reported. The gap is the rounding of f\*.
- **accel-lutsize:** `accel-lut`'s own README calls its favourable case "a near tie": 3.51 nJ against 3.56 nJ dense, and 1.55 nJ against 1.51 nJ pruned. The follow-up's headline called that same result about 2.7× worse, a verdict it then "flips".

## The number

**0 of 4 subjects meet the bar.** All four were randomly sampled. Across every sampled audit, 36 of 380 now meet it (Wilson 95% interval 7% to 13%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/ranked-ballot-counter | 2 | 3 | 2 | 3 | 2 | 2 | 3 | no |
| ventures/vinyl-liner-bid-calculator | 2 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| research/inference-substitution | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/accel-lutsize | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |

Of 23 bugs seeded by hand, the tests caught 9:

| subject | seeded bugs caught |
|---|---|
| ranked-ballot-counter | 3 of 7 |
| vinyl-liner-bid-calculator | 3 of 6 |
| inference-substitution | 2 of 5 |
| accel-lutsize | 1 of 5 |

Verification is 2 in all four subjects. That makes it the gate that binds this round. In every subject, more than half the seeded bugs left the suite green.

## Each subject

**ranked-ballot-counter.** The reviewer is an election administrator who certifies instant-runoff (IRV) and single transferable vote (STV) tabulations. The auditor wrote separate Python versions of IRV, STV (the Scottish 2007 order, with weighted inclusive Gregory transfers) and Schulze, each with its own random generator, and compared them with the tool on 3,000 elections:

- **IRV:** all 2,644 untied winners agreed.
- **STV:** all 2,778 elected sets agreed, including the exhausted votes and the votes lost to rounding.
- **Condorcet winner:** all 3,000 agreed.
- **Schulze:** 2,981 of 3,000 agreed.

Wikipedia's Tennessee and STV food examples came out as published.

The worst defect is high, and it is the 19 Schulze misses. The tool ordered candidates by how many rivals each beats on strongest paths. That is not Schulze's relation, and where two strongest paths tie it names one winner instead of two. The README's independent recount, `crosscheck/check.py`, used the same win-count rule, so it agreed with the engine on all 3,000 rankings. The crosscheck was a copy of the method, not a check of it.

There are three further defects:

- A CSV whose headers are not recognisable ranks ("Your 1st choice") has every column read as a candidate, with no warning. Timestamps become candidates, and IRV can "elect" one. The README said those columns are "never read as candidates".
- Four of seven seeded bugs survived. A test named for the rule that a majority counts only live ballots passed either way.
- Exclusion moves all of a candidate's papers in one step, where the Scottish rules move them in sub-stages by value.

**vinyl-liner-bid-calculator.** The reviewer is a pool contractor who replaces inground vinyl liners from a manufacturer's measuring form. The four preset prices reproduced to the cent from an independent script. The oval perimeter came out at 87.196 lf, checked against an exact ellipse integral rather than the code's approximation. The margin was 25.00% on every preset.

The worst defect is high. The takeoff runs as a chain: water surface and walls give the liner area, and the liner area plus waste gives the order. A contractor who typed over a link in that chain, such as the manufacturer's measured liner area, changed nothing below it. Order square feet was always rebuilt from the suggestion, so the price never moved.

There are four further defects:

- A cleared field priced as zero, because `Number('')` is 0.
- The hopper allowance is a flat 22% of water surface, with no deep-end depth. The auditor's floor model gives 11% to 20% from 6.5 to 8 ft.
- There is no water-volume or refill line, and pump-down is 2.5 hours for every pool.
- Two seeded bugs in the wall-foam material and break-even code survived.

**inference-substitution.** The reviewer is a statistician who works on sequential, anytime-valid tests. `run.py` regenerated its results byte for byte. Experiments E1, E3, E5 and E6 matched 40-digit arithmetic that does not import the package. A separately written e-process kept false alarms at 3.25%, below α = 0.05, and its delay ratios fell inside the paper's range.

The worst defect is high, and it is in the design. The statistic is Q(x)/P(x), so the verifier must already know which cheap model Q the cheater serves. The paper said only that the verifier must be able to evaluate P. When the cheater served P^1.5 against a test built for P^0.5, the auditor's runs detected 0 of 20 within 20,000 queries, even at full substitution.

The paper cited no prior work. Its "new" √N theft law is the square-root law of steganographic capacity (Ker 2007; Filler, Ker and Fridrich 2009) and of covert communication (Bash, Goeckel and Towsley 2013). Three of five seeded bugs survived, two of them in `savings_curve`, which had no test. The only `f_star` test landed on the `min(1, ·)` cap, so it tested the cap and not the formula.

**accel-lutsize.** The reviewer is a computer-architecture researcher who builds energy models for neural-network accelerators. Every README table cell recomputed to two decimals from a model typed in from Horowitz's Fig. 1.1.9 without the project's code. The break-even exponents were 0.2592 dense and 0.2790 pruned, against 0.26 and 0.28 in the README, and `run.py` reproduced its results byte for byte.

The worst defect is medium, and it is the headline. `accel-lut` had swept the table-read energy and found a near tie at 0.04 pJ/bit. This follow-up quoted only the pessimistic 0.16 pJ/bit case (2.7×) and said size pricing "flips that verdict". For a 32-byte table, 0.04 pJ/bit corresponds to an exponent of about 0.25, so the project turns an assumed constant into an exponent. It does not overturn a clear negative.

The break-even also depends on two assumptions the README did not state:

- **The 2-point accuracy tolerance.** With near-lossless designs instead, the break-even rises to about 0.40 dense and 0.49 pruned.
- **One 32-byte table at a time.** Pricing all 64 tables as one array removes the flip.

CACTI, which is open source and could have measured arrays below 8 KB, was not used. Four of five seeded bugs survived, and `run.py` has no tests.

## What was fixed in this PR

The scores above are from before these fixes. A later round re-audits. Each audit file marks the defects fixed with `fixed_by`.

- **ranked-ballot-counter:**
  - Schulze now ranks by the strongest-path relation itself. Each step takes every remaining candidate that no remaining candidate beats.
  - `crosscheck/check.py` uses the same rule, and the README says plainly that the recount used to share the bug.
  - New tests pin the tie example and make the IRV live-ballot test end a round earlier than the all-ballot rule would. Weakening `>=` to `>` in the new ranking is now caught.
  - The README's column claim, its test count and the "all agreeing" line in `llms.txt` now match what was checked. 39 of 39 tests pass.
  - The header-guessing input bug, STV exclusion by value, and the STV, tie-break and Schulze-win seeded bugs are still open.
- **vinyl-liner-bid-calculator:**
  - The takeoff chain is now a tested function, `takeoffChain` in `calc.mjs`, and the page calls it when a takeoff field changes. In a browser, 1,200 sf now gives a 1,296 sf order and a $6,310.74 price.
  - A cleared field is an error, not a zero.
  - New tests catch the wall-foam and break-even bugs that survived.
  - The copied water-heater test fixture is replaced, and the README lists the hopper, water-volume and uncited-rate gaps. 139 of 139 tests pass.
  - The depth-driven hopper allowance, water volume and the liner-share test are still open.
- **inference-substitution:**
  - The `f_star` test now uses a case where f\* is about 0.15, inside the range, and `savings_curve` has a test. All three surviving bugs are now caught. 11 of 11 tests pass.
  - The paper's limitations now state the known-Q assumption and the 0-of-20 result, and correct the grid-floor explanation.
  - It names the square-root-law, model-equality-testing, verifiable-inference and inspection-game work as prior work. These citations are from the auditor's memory and are marked as not yet checked against the papers.
  - A test that works without knowing Q is still open, and so are real model outputs.
- **accel-lutsize:**
  - The README headline, `project.json` and the research index now state `accel-lut`'s result as a near tie at 0.04 pJ/bit and 2.7× worse at 0.16.
  - Limitations now say what is new (the size law, not the sign) and give the tolerance and one-table sensitivities.
  - The tests, the CACTI measurement and the per-word read model are still open.
