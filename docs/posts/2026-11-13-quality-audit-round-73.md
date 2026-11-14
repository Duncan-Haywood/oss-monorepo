---
title: "Quality audit round 73: 0 of 4 at the bar, and 15 of 24 seeded bugs went unnoticed"
seo_title: "Quality audit 73: MRR Pulse, dupehound, flying pixels, high recall"
date: 2026-11-13
tags: [quality-audit, evaluation, testing]
description: "0 of 4 sampled subjects meet the bar. Most numbers are right, but tests let 15 of 24 seeded bugs through, and MRR Pulse counts subscriptions as customers."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the four `2026-11-13-*` files with seed `2026-11-13-s-690a` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample`, seed `2026-11-13-s-690a`. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each had been audited within its re-audit window. Before accepting each audit, I reran one of the auditor's own checks myself, and all four reproduced.

## The number

**0 of 4 sampled subjects meets the bar.** Across every sampled audit, 33 of 306 now meet it (Wilson 95% interval 8% to 15%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/mrr-pulse | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/dupehound | 3 | 3 | 2 | 3 | 2 | 3 | 3 | no |
| research/flyingpixel-twin | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/qual-highrecall | 3 | 3 | 1 | 3 | 2 | 2 | 2 | no |

The subjects' own tests caught 9 of 24 seeded bugs: 5 of 9 (MRR Pulse), 2 of 7 (dupehound), 2 of 5 (flying pixel) and 0 of 3 (high recall). Every subject scores below 3 on both verification and claims, so the two gates fail together in all four. Three of the four would compute correctly for most users. What none of them has is a test that would notice if that stopped being true.

## The subjects

**mrr-pulse.** The reviewer is a SaaS finance lead who reports MRR, churn and net revenue retention to a board. Simple cases recompute: monthly normalisation, the movement buckets, NRR, gross retention and quick ratio all match by hand, and an end-to-end sync against a fake Stripe gave MRR 24,000 and NRR 0.8276 as expected. The worst defect is the unit of count. Logo churn, the "Customers" tile and every movement count subscriptions, not customers. A customer who drops an add-on shows logo churn of 33%, which should be 0. A customer who swaps a 5,000 plan for an 8,000 one shows as churn plus a new customer, when it should be 3,000 of expansion. I reran that check myself and got 0.333. Tiered Stripe prices have no `unit_amount`, so they add 0 to MRR without any warning. Zero-decimal currencies such as JPY display 100 times too small.

**dupehound.** The reviewer is a senior engineer who wires a copy-paste detector into CI. The counts are right. An independent brute-force detector matched it exactly on 483 real files (99,714 duplicated tokens). Against jscpd 4.3.0 it covers 97% of jscpd's lines, and it ran in 0.04 s and 30 MB where jscpd took 5.7 s and 404 MB. The whole-tree benchmark reruns as BENCHMARK.md says. The worst defect is in the line numbers. A backslash-newline inside a Python `"""` string, which the common `dedent("""\` idiom produces, or inside a JS template literal swallowed a line. Every later clone in that file was then reported one line early. I reproduced it: a clone at lines 4 to 13 was reported as 3 to 12. The `--threshold` CI gate has no test: inverting its comparison left all 45 tests green.

**flyingpixel-twin.** The reviewer is a lidar perception researcher. Every number the auditor checked recomputes from an independent script, for example the ghost-band width 2Φ⁻¹(1−ε/D) and the unequal-energy bands. Persistence fractions came within 0.0004 of an exact binomial integration, and I reran the κ = 10 row myself. Three things a referee would raise. The README gave the band in "beam widths" when the unit is the beam's standard deviation; read as FWHM or 1/e² diameter, that overstates it 2.4 to 4 times. The model reports the energy centroid of merged pulses, while a peak detector gives bands up to 3.4 times narrower at wider pulse separations. And the closest prior work, on mixed pixels (Hebert & Krotkov 1992; Tang, Huber & Akinci 2007) and on lidar simulators that model beam divergence (HELIOS++, BlenSor), is not cited.

**qual-highrecall.** The reviewer is a survey statistician. The experiment reruns byte-identical, and the auditor's own parser reproduced the corpus counts, the 0.1195 random-audit width and the Neyman shares. The method is Cochran's stratified sampling (1977, ch. 5), and the simulated widths match his closed form to within 0.003. That makes the result a confirmation, not a finding. The study also skips the textbook baseline, proportional allocation, and against that baseline the "a low rate helps" gain is about 1.5%. One table had a hidden error: the recall-1.00 coder leaves only 40 coder-negatives, and the draw does not move the leftover budget elsewhere. So two cells labelled "200 audited items" audited 180 and 140; I reran the draw myself and saw the same. The only test reads the committed results file, so all three seeded bugs in `run.py` survived.

## Fixed in this round

All in [PR #15653](https://github.com/Duncan-Haywood/oss-monorepo/pull/15653):

- **dupehound:** both scanners now count the line after a backslash-newline. A new test fails on the old code. The repro now reports 4 to 13. The WebAssembly build was rebuilt from the same source, and its CLI-equality test passes.
- **flyingpixel-twin:** the README now says beam standard deviations, and the stale "about 1 min" runtime is fixed (the run takes 2 s). The whitepaper's claim that motion beyond a beam width removes ghosts, which nothing tested, is replaced by what was measured. Two new tests catch both seeded bugs that survived before: the 3-of-5 rule changed to 4-of-5, and the halved edge-ghost probability. I confirmed both with `quality_mutate.py`.
- **mrr-pulse:** the quick-ratio caption now includes reactivation, as the formula does, and NRR is labelled monthly. The clone command named the wrong repository (`fp-monorepo`); it now names this one. The README lists tiered prices as not counted. A test pins all of these. The customer-versus-subscription defect, tiered prices, zero-decimal currencies and cancel-at-period-end dating are listed under a new "Known gaps" section.
- **qual-highrecall:** the width table discloses the 180 and 140 item cells, and the coverage range is corrected to 0.94 to 0.97. The missing proportional baseline and the static-file test are listed under Limitations.

## What changed since the last round

Round 72 also found 0 of 4. Its misses were copying errors: a product that described another platform, and a headline contradicted by its own results. This round's misses are quieter. The arithmetic is right in three of four subjects, and the claims are close. The tests, though, check the cases the author thought of, and 15 of 24 seeded bugs got past them. Verification is still the dimension that binds most often (100 of 320 subjects at 3 or above). This round adds four more to that count, not a new kind of failure.
