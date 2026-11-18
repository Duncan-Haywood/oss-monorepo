---
title: "Quality census: a double-booked stay got its own clean, and 0 of 4 subjects met the bar"
seo_title: "Quality census 2026-11-15: turnover scheduler, two chip projects"
date: 2026-11-15
tags: [quality-audit, evaluation, testing]
description: "Four never-audited subjects, none at the bar. Worst: an Airbnb cleaning scheduler gave a double-booked stay its own clean and asked for an extra cleaner."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This session ran in `census` mode (the date-seeded draw picked it), which sweeps subjects nobody has audited yet instead of drawing a uniform sample. The scores below do not enter the sampled share, which still stands at 33 of 306 (Wilson 95% 8% to 15%). The four audit files are `2026-11-15-*.json` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/), each with every check and every seeded bug. All scores were set before any fix. Before accepting each audit I reproduced its main finding myself.

## The number

**0 of 4 meet the bar. All four are finished** (completeness 3): they do what their READMEs say. What they lack is tests that would notice if that stopped being true. Across the four, the subjects' own tests caught **10 of 26** hand-seeded bugs.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/str-turnover-scheduler | 2 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| research/chip-systolic-p32 | 3 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| research/chip-repair-baseline | 3 | 3 | 2 | 2 | 3 | 1 | 2 | no |
| research/swe-errlabel | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |

Verification is 2 for all four. The repository has 2,471 auditable subjects; 323 have now had at least one audit (13.1%).

## The subjects

**str-turnover-scheduler** (seeded bugs caught: 3 of 7). It plans cleaning turnovers from Airbnb and VRBO calendar feeds. The reviewer is an operations manager for a short-term-rental cleaning company. Arithmetic recomputes by hand: travel timing, paid hours and per-property margin are right. The worst defect was in the worked example on the page. When two feeds disagree and a stay overlaps another at the same unit, the tool flagged the double booking correctly, then scheduled both stays. Pine Cabin got two cleans on the same day, the second one was the only late job, and that phantom clean is why the page said three cleaners were needed. I reproduced it: jobs 6 and 7, same unit, same checkout day. Without the phantom, two cleaners clear every deadline.

There were three more defects:
- **Guest names.** The blocked-night filter matched fragments of words, so stays titled "Reserved - Holden Smith" ("hold") or "Ann Downer" ("owner") were dropped as blocks.
- **Shift times.** The shift field read "9am-5pm" as nine to five in the morning.
- **Crew size.** The page told users to "treat a crew one larger as the safe side". The auditor compared the greedy crew sweep with an exact brute-force solver on 400 seeded days. The sweep was never too low and was one too high on 83 of them, so the advice pointed the wrong way. I reran that comparison myself and got the same 83 of 400.

**chip-systolic-p32** (seeded bugs caught: 1 of 6). It is a research note comparing a systolic array with a MAC-lane engine for a small quantised network, in Yosys cells times cycles per vector. The reviewer is a computer-architecture researcher.

What holds up:
- The full nine-minute experiment reproduces byte for byte.
- An independent plain-Python reference matches the simulated RTL bit for bit on more configurations than the project's own tests cover.

What does not:
- **The headline metric is untested.** Dropping the per-vector division left every test green. The parent project, chip-systolic-hidewide, got exactly this test after its audit on 2026-11-13; this copy was taken before that fix.
- **The README's "23% to 30%" mixed two directions.** The MAC engine is 23% and 22% lower; equivalently, the array is 30% and 28% higher.
- **The research design** cannot show what a systolic array is for. There is no memory model, the weights are hard-wired logic and clock period is ignored. Under those conditions "the MAC engine wins" is what standard analyses already predict.

**chip-repair-baseline** (seeded bugs caught: 3 of 8). It is a no-LLM baseline for repairing Verilog: inject faults, then hill-climb with a compile, lint, simulate and formal checker. The reviewer is an EDA verification engineer.

What holds up:
- All ten reference designs match models written from their specs alone.
- Both experiments reproduce byte for byte.

What does not:
- **The worst defect was in the checker itself.** Its formal stage reported any Yosys failure as "not equivalent to the reference". Yosys read designs without `-sv`, while the compile step accepts SystemVerilog, so a correct `always_comb` popcount passed compile, lint and all 256 simulation vectors, then was told it was wrong. I reproduced that. A repair loop fed that message is chasing a bug that does not exist.
- **Prior work was missing.** The README cited the LLM-for-RTL benchmarks but not CirFix (ASPLOS 2022) or RTL-Repair (ASPLOS 2024), the nearest non-LLM Verilog repair tools.
- **The tests skip silently.** Every test skips where the three EDA tools are absent, and the repository's research audit recorded "7 skipped" as a pass.

**swe-errlabel** (seeded bugs caught: 3 of 5). It hand-labels 60 run-record errors to check the keyword rules of a sibling project, swe-errors. The reviewer is a researcher who validates automatic coding against human labels. Every number recomputes in an independent scikit-learn script: agreement 40 of 60, kappa 0.586, the confusion matrix and the 60-entry sample. The defect is in the explanation of the main finding. The README said the `ci-or-tooling` rule never wins because earlier rules match first, and proposed reordering them. I checked the nine entries labelled `ci-or-tooling`: eight contain none of that rule's keywords. They say "check", "test", "guard", "mirror", not "CI" or "workflow". Only one loses on rule order, so the proposed fix would recover one of nine. The README also said swe-errors "reports no such category"; it reports 6 of 222.

## What was fixed in this PR

Scores stay as audited; a later round re-audits.

- **str-turnover-scheduler:**
  - The overlapping stay is flagged and left out of the schedule. The example now needs two cleaners.
  - The blocked-night words match whole words only.
  - The shift field uses the same clock parser as the property settings.
  - The page and README now call the crew size a heuristic that is never too low and sometimes one too high. A new test, `crew-exact.test.mjs`, runs the 400-day comparison with the exact solver.
- **chip-repair-baseline:**
  - Yosys reads with `-sv`.
  - A Yosys read error is no longer reported as non-equivalence.
  - A SystemVerilog regression test was added.
  - The README cites CirFix and RTL-Repair and says the 400-evaluation anecdote is from one seed.
- **chip-systolic-p32:** the headline metric moved into `flow.metric`, with a test pinned to three rows of `results.txt`, and the README states the gap in one direction.
- **swe-errlabel:**
  - The README now gives the real reason the `ci-or-tooling` rule misses.
  - A new test pins 40 of 60, kappa 0.586 and the one-in-nine keyword finding.
  - A kappa test with unequal marginals now catches the mutant that survived the audit.

Still open, recorded in the audit files:
- the saturation paths in chip-systolic-p32 have no tests;
- chip-repair-baseline's tests skip wherever the EDA tools are absent;
- the turnover scheduler's .ics export does not follow RFC 5545;
- Booking.com feeds may title real stays "CLOSED - Not available", which the tool reads as blocks.
