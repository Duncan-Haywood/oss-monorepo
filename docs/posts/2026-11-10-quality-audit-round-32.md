---
title: "Quality audit round 32: one of four sampled subjects meets the bar"
seo_title: "Quality audit round 32: one of four sampled subjects meets the bar"
date: 2026-11-10
tags: [quality-audit, evaluation, testing, research]
description: "Interleave-twin meets the bar; the garage-door bid calculator, tile layout planner, qual-induce and the quick-pick-survey flagship do not. Defects inside."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix. Seed 2026-11-10.

## The number

**One of the four uniformly sampled subjects meets the bar** (two ventures, two research projects; with n = 4 the interval is very wide, Wilson 95% roughly 5% to 70%). The flagship, drawn by rotation and reported apart, does not. The bar: correctness, claims and verification all 3 or more, and a median of 3.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | meets bar |
|---|---|---|---|---|---|---|---|---|
| `research/interleave-twin` | 3 | 3 | 3 | 3 | 3 | 2 | 2 | yes |
| `ventures/garage-door-bid-calculator` | 3 | 3 | 3 | 3 | 2 | 3 | 3 | no |
| `ventures/tile-layout-planner` | 3 | 3 | 3 | 3 | 2 | 3 | 3 | no |
| `research/qual-induce` | 3 | 3 | 1 | 2 | 2 | 2 | 2 | no |
| `ventures/quick-pick-survey` (flagship) | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |

## Subjects and worst defects

- **interleave-twin** (meets). 10 tests pass; `run.py` regenerates `results.txt` byte for byte; the auditor recomputed copies-needed counts and a deadline case with numpy and a 2e6-chain Monte Carlo. Seeded mutations were caught. Worst defect: the result is classical Gilbert-Elliott and interleaving theory, sound but not new, and the "real" link is itself a simulation.
- **garage-door-bid-calculator.** 120 tests pass, three tickets recomputed in Python to the cent. Worst defect: the headline 35% spring travel flag had no boundary test; changing `>=` to `>` passed every test. llms.txt also pointed at a retired host.
- **tile-layout-planner.** 44 tests pass; five hand cases matched. Worst defect: the sitemap, robots.txt and canonical links used relative URLs, so the SEO files did nothing. The default wall gap is 0 with no mention of perimeter movement joints.
- **qual-induce.** Worst: two of three seeded mutations survived the 7 tests (choosing the coverage code on the held-out half was not caught). The README said excess NMI over chance was "0.10 to 0.15 at every size"; its own table shows 0.04 to 0.15, rising with k. The stability column scores the second codebook on the half it was fitted on. The full run took 7m46s, not 1.5 minutes.
- **quick-pick-survey** (flagship). The maths is right (Glicko-2, DerSimonian-Laird and Davidson Bradley-Terry agree with independent code to 6+ digits), but three seeded mutations in exactly that maths all survived 304 tests, and the Glicko-2 "published value" test only checked a range. The site claimed chess.com's ratings are built on Glicko-2, which no file backed.

## Fixed in this round

- garage-door: boundary test at exactly 35% of price (the `>` mutation now fails); llms.txt host.
- tile-layout-planner: absolute placeholder URLs in sitemap, robots and canonicals, tests updated; llms.txt host.
- qual-induce: README range and runtime now match the table and the measurement. The stability and coverage-null defects remain open.
- quick-pick-survey: a pinned single-game Glicko-2 test checked against an independent implementation; the chess.com claim removed; llms.txt host. The Davidson and DerSimonian-Laird mutations still survive and are not yet pinned.

## What is not at the bar

Four of five fall short on `claims` or `verification`, the same pattern as recent rounds: the maths is usually right, but the tests would not notice if it stopped being right, and a page says one thing more than a file backs.
