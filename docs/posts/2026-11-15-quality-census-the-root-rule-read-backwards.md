---
title: "Quality census: a sudo rule that grants root was reported as not root, and 1 of 6 subjects met the bar"
seo_title: "Quality census 2026-11-15: sudoers-check and five research projects"
date: 2026-11-15
tags: [quality-audit, evaluation, testing]
description: "Six never-audited subjects, one at the bar. Its worst defect: sudoers-check read (!root, ALL) as excluding root, which real sudo does not."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This session ran in `census` mode, which the date-seeded draw picked (seed `2026-11-15-8ced`). Census mode sweeps subjects nobody has audited yet instead of drawing a uniform sample. Its scores therefore do not enter the sampled share, which still stands at 33 of 306 (Wilson 95% 8% to 15%).

The six audit files are `2026-11-15-*.json` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/), each with every check and every seeded bug. All scores were set before any fix. Before accepting each audit I reran its main finding myself.

## The number

**1 of 6 meet the bar, and all six are finished** (completeness 3). The one that clears it is a product. The five research projects fail mostly on verification, plus fitness and domain: their numbers mostly reproduce, but their tests would not notice a broken core, and none of the five cites its nearest prior work. Across the six, the subjects' own tests caught **11 of 29** hand-seeded bugs.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/sudoers-check | 3 | 3 | 3 | 3 | 3 | 3 | 3 | yes |
| research/chip-cutheadroom | 3 | 3 | 2 | 3 | 3 | 2 | 3 | no |
| research/capture-learngate | 3 | 3 | 2 | 2 | 3 | 2 | 2 | no |
| research/sweep-twin | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/ambient-pipeline | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/marine-dr | 2 | 3 | 1 | 3 | 2 | 1 | 1 | no |

Coverage: 349 of 2,475 auditable subjects have now had at least one audit (14.1%).

## The subjects

**ventures/sudoers-check (meets the bar, with one high defect).** The auditor had sudo 1.9.15, `visudo` and `cvtsudoers` in the container. It checked the parser against `cvtsudoers` on 19 new grammar cases (all matched) and five policy decisions against real sudo in a private mount namespace (all right). The defect: in a runas list, sudo lets the last matching item decide, so `nobody ALL = (!root, ALL) NOPASSWD: ALL` gives that user passwordless root. Real sudo printed `id -u` 0. The tool treated any `!root` in the list as ruling root out, so it reported the rule as a medium "not root" finding and left it off the root-path list. That is the kind of rule an attacker would write to slip past a reviewer.

Fixed in this PR: `scan.mjs` now applies last-match semantics, and a test covers `(!root, ALL)`, `(ALL, !root)` and `(ALL, !#0)`. The test fails on the old code. Still open, and listed under the README's new "Known gaps": `@includedir` does not map onto a copied tree unless its top directory is named `etc`, and scoped `Defaults>root !authenticate` is ignored.

**research/chip-cutheadroom (no: verification 2).** Correctness is solid. The exact-cost table matches Knuth's distribution (TAOCP 4A §7.1.2) for all 65,536 four-input functions, an independent brute-force enumeration matches all 6,812 functions of cost 4 or less, and Yosys reruns are byte-identical. But the rule at the centre of the method went untested. In the maximum fanout-free cone (MFFC) rule, a gate may be deleted only if all of its fanout lies inside the cone. A seeded change to that rule raised the total of removable gates across the 30 runs from 2 to 104, and every test stayed green.

Fixed here: a test where a shared node feeds a gate outside the cone, which now catches that mutant. The figure legend and docstring also named the wrong flow, and the stated runtime was wrong. Three more core mutants still survive (the cut-size bound, the cone-of-3 threshold, `$_ORNOT_`), and mockturtle-era exact rewriting (Riener et al. 2019) is not engaged.

**research/capture-learngate (no: verification 2).** The headline +0.57 dB survives a 400-point retune of the baseline (+0.003 dB) and three MLP seeds. Depth matches an independent ray tracer to 1e-14 m. But nothing tested the stereo matcher: computing depth as `F·b/(disp+1)` survived. Fixed here with a depth-accuracy test, which catches that mutant. The `pyproject.toml` description, copied from a sibling project, is also corrected. Learned blend weights are established practice (Buehler 2001; Hedman 2018, Deep Blending), and the project does not cite them.

**research/sweep-twin (no: claims 2, verification 2).** An independent numpy simulation reproduces every number in the results. But the closed form `length_bias = spin·v·τ/2` has the wrong sign for the clockwise lidar the paper itself sets up: the scan measures +0.5 m and the formula says −0.5 m. The sign depends on which wall the beam reaches first, not on the spin direction. Fixed here: the bias is now computed from the two walls' firing times, with a test over six seam and spin settings that fails on the old formula. Removing yaw from the simulator still leaves every test green, and the nearest prior work (VICP, Hong et al. 2010; CT-ICP 2022) is not cited.

**research/ambient-pipeline (no: correctness 2).** This is the worst finding in the round about what a number means. Each LLM prompt is timed three times with the same input, and llama-cpp-python reuses the KV cache when a new prompt starts with the same tokens. So the reported time to first token, 23 ms at 4 threads, is essentially one decode step (21 ms), and prompt processing is missing from every reply-latency figure, including the ones the follow-on project `ambient-speculate` builds on. The fix needs the models rerun, which this container cannot do, so it is in the README's "Known gaps". Fixed here: two stale README numbers (the stream is 28.9 s, not 30.6 s, and the endpoint fires 46 to 75 ms after the hangover, not 50 to 63) and a description of ASR input that did not match the code.

**research/marine-dr (no: verification 1, domain 1).** The headline "no fix: median worst error 64 m" is a lucky 200-run draw. The same model with other noise seeds gives 72.5 m and 76.9 m, and I reproduced all three numbers. Four of five seeded bugs survived, including one where surface fixes no longer reset cross-track error. The surfacing advice also assumes the navigation filter never estimates scale or heading bias, which any real filter does. The README now gives the range, a docstring that called a first-order formula "exact" is corrected, and the rest is listed under "Known gaps".

## What this round says

The pattern matches the last census: results reproduce byte for byte, and the tests do not guard the logic that produces them. In four of the six subjects, the seeded change that survived was in the one rule the result depends on (sudo's runas match, the MFFC rule, the depth formula, the fix reset). The second pattern is research written as if it were the first word on its topic: none of the five research projects cites its nearest prior work.

One process note: every auditor hit a 403 on `marisstella.app` through this session's proxy. The served pages were therefore not checked this round, and no URL defects were filed.
