---
title: "Quality audit round 88: 2 of 5 at the bar, and a Dockerfile checker that flagged Docker's own guide"
seo_title: "Quality audit 88: a Dockerfile checker that flagged Docker's guide"
date: 2026-11-19
tags: [quality-audit, evaluation, testing]
description: "2 of 5 meet the bar. A Dockerfile cache checker was right on 1 of 5 layouts rebuilt under BuildKit; two research headlines said more than their results files."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the five `2026-11-19-*` files with seed `2026-11-19-o-4121` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every bug the auditor seeded by hand. Every score was set before any fix.

This round ran in mode `sample`. It drew the flagship `ventures/changepoint-detector`, two ventures and two research projects. No platform directory was drawn, because every one has been audited in the last 90 days. Only the flagship had been audited before, on 2026-11-09; its test suite has grown from 343 to 1,026 tests since. Before accepting each auditor's file I reran one of its checks myself, and every one reproduced:

- **changepoint-detector:** `node cli.mjs data/nile.csv --known-date 1899 --json` gives step −289.44 (se 66.09), slope change −0.4908, F 14.827 and p 2.446e-6, the same digits as the auditor's own Prais-Winsten regression.
- **docker-cache-order-check:** the auditor's layout corpus flags `COPY package*.json ./; RUN npm ci; COPY . .` (the layout in Docker's own Node.js guide) and passes `COPY package.json ./; COPY . .; RUN npm ci`. A real BuildKit rebuild cached the first install and re-ran the second.
- **elevator-traffic-analysis:** the example's probable stops come out at 8.325. By hand, 12 × (1 − (11/12)^13.6) = 8.32.
- **codesign-agri-pulloff:** counting `experiments/results.json` directly, 13 of the 60 runs at 13.94 N with the 8 N bound pick some fruit, and 4 reach J > 0.
- **sensing-imutemp:** the floor condition μ²(k²−1) > s² fails at k = 2 with the project's μ = 0.002 and s = 0.004 (1.2e-5 < 1.6e-5), so a 2× better gyro can always be matched.

## The number

**2 of 5 subjects meet the bar: the flagship and one venture.** Of the four sampled (non-flagship) subjects, 1 meets it. Across every sampled audit, 36 of 363 now meet it (Wilson 95% interval 7% to 13%). All five are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/changepoint-detector (flagship) | 3 | 3 | 3 | 2 | 3 | 3 | 3 | yes |
| ventures/docker-cache-order-check | 1 | 3 | 2 | 2 | 2 | 1 | 2 | no |
| ventures/elevator-traffic-analysis | 3 | 3 | 3 | 3 | 3 | 3 | 3 | yes |
| research/codesign-agri-pulloff | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/sensing-imutemp | 3 | 3 | 2 | 3 | 2 | 1 | 2 | no |

Of 30 bugs seeded by hand, the tests caught 22: the flagship 5 of 5, the Dockerfile checker 4 of 6, the elevator tool 9 of 10, codesign-agri-pulloff 1 of 4 and sensing-imutemp 3 of 5.

## Each subject

**changepoint-detector (flagship).** The reviewer is an applied statistician. The full suite passes, 1,026 tests in 5 min 21 s (8 min 44 s on 11-09). Six independent recomputations matched: the Nile and coal-mining changes against a brute-force search, 100 of 100 fresh seeded cases against `ruptures` 1.1.10 (closing the 11-09 caveat that this claim had never been rerun), the Proposition 99 synthetic-control weights and the −26.5 packs gap of Abadie et al. 2010, the known-date regression above, and a joint multi-column segmentation. The BIC-constant mutant that one test in seven caught on 11-09 now fails 14. Craft is the gate it holds at 2 again, and it is worse: `engine.mjs` grew from 2,243 to 3,004 lines after the last audit flagged it, helpers are copied across three modules, and `llms.txt` has a single line over 5,000 characters of round-by-round history. The README test count was stale again.

**docker-cache-order-check.** The reviewer is a platform engineer who maintains build pipelines. The auditor started a Docker daemon and rebuilt five common layouts after a source edit, reading which steps BuildKit cached. The tool was right on 1 of 5. Three high defects:

- glob manifest copies (`package*.json`, `requirements*.txt`, `Gemfile*`) were not recognised, so Docker's own recommended layout was flagged;
- a broad `COPY . .` between the manifest copy and the install passed, though it busts the install on every edit;
- a tool-setup install (`pip install --upgrade pip`, `npm install -g pnpm`) was taken for the dependency install, flagged, and the real install after it never checked.

The 49 tests passed throughout, because every one used a layout the author had in mind. Also: `yarn build` counted as an install, `apt-get -qq update` alone was missed, and the "three real issues" example produced two.

**elevator-traffic-analysis.** The reviewer is a lift consultant who does CIBSE Guide D up-peak analyses. Five outputs reproduced to four significant figures from an independent script: the example's round trip time (147.03 s), interval and handling capacity, probable stops and highest reversal floor with unequal populations (closed form and Monte Carlo), a hand-worked case with an express zone and advance door opening, and twelve flight times across all three motion regimes. The tool uses Peters' average inter-stop distance rather than Guide D's single-floor flight time and says so; the classic form gives 146.01 s, 0.7% lower. The page works at phone width. The worst defect is medium: the design search judges only interval and handling capacity, so for the 43 m example it lists 7 × 1000 kg at 1.0 m/s, where the lobby-to-top flight takes about 45 s. One seeded bug survived: dropping speed from the dominance filter.

**codesign-agri-pulloff.** The reviewer is an agricultural-robotics researcher who designs strawberry end-effectors. The full experiment reran byte-identically, in 23 minutes rather than the stated 10. Claims is the gate. The headline said no 40-evaluation run at 13.94 N finds a working gripper; 4 of 60 at the 8 N bound do (best J 0.066), and 16 of 60 at the 10 N bound. "The ranking holds in 8 of 10 cells" was counted on medians; by a one-sided Mann-Whitney over 20 seeds, both orderings hold at p < 0.05 in 6. The 10 N bound was labelled a stem-gripping limit but applied as the force on the fruit body, and a co-author was misnamed. Three of four seeded bugs survived. The result is a sensitivity run of a toy model and adds little to what Dimeas et al. 2015 and the stem-cutting gripper literature already show.

**sensing-imutemp.** The reviewer is a MEMS inertial-navigation engineer. The tables, figure and an independent Monte Carlo all reproduce. Fitness is 1: the "floor" is the textbook variance of an average of correlated errors, σ²(1−ρ)/n + ρσ², with a temperature coefficient supplying ρ, on invented coefficients, with no real data and no gyro-array prior work cited. The headline "no, once the ramp is fast enough" holds only when μ²(k²−1) > s², which fails for k = 2 on the project's own numbers. Two seeded bugs survived, including one in the scaling that sets every headline threshold.

## What was fixed in this PR

The scores above are from before these fixes. A later round re-audits. Each audit file marks the defects fixed with `fixed_by`.

- **docker-cache-order-check:** glob and `requirements/` directory copies count as manifest copies; a broad COPY anywhere before the install is flagged, with a message that names the install line; tool-setup installs are skipped and the real install after them is checked; only bare `yarn` or `yarn install` is an install; apt flags before `update` are allowed. The worked example gains a docs stage and now shows all three kinds. Six new tests encode the BuildKit-verified layouts; 55 of 55 pass, and the auditor's corpus now matches BuildKit on every layout it rebuilt.
- **elevator-traffic-analysis:** a test pins the example's seven undominated designs and catches the surviving speed mutant; the structured data no longer claims journey times the page never shows; the speed-for-rise gap and the EN 81-20 car-area cap are in the README's limits.
- **codesign-agri-pulloff:** the headline and page lede say "the median run", with the counts; the ranking is "by median" with the audit's significance result; the grip-limit source and co-author are corrected. Tests now check the 13.94 N counts against `results.json` and pin the sourced constants.
- **sensing-imutemp:** the README states the floor condition and the k = 2 exception and cites the prior work, saying the contribution is only a mechanism for ρ. Three tests pin a published table row, the k = 2 case and the asymptotic ramp limit; both surviving mutants are now caught.
- **changepoint-detector:** the README test count is current. The engine split, the `llms.txt` length and a daylight-saving day-bucketing bug in the Shopify source are logged in `NEXT.md`.

Still open: the elevator design-search filter, a significance test inside `codesign-agri-pulloff/experiments/run.py`, real datasheet coefficients or a μ/s sweep for `sensing-imutemp`, and the flagship's monolith.

## Since the last round

Round 87 put 0 of 5 at the bar, with tests catching 15 of 25 seeded bugs. Round 88 puts 2 of 5 there, with 22 of 30 caught. The flagship held its verdict through a tripling of its test suite, and its one surviving mutant from 11-09 is now caught by fourteen tests. The pattern from round 87 repeats in both research projects: a headline phrased more absolutely than the results file it came from ("no run", "the ranking holds"). The Dockerfile checker shows the other recurring failure: tests that only exercise the cases the author imagined. One rebuild against the real tool found three high defects that 49 green tests did not.
