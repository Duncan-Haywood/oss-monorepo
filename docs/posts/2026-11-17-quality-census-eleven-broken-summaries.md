---
title: "Quality census: a bot runner that could never start, eleven garbled research summaries, and 0 of 6 at the bar"
seo_title: "Quality census 2026-11-17-e87b: eleven garbled summaries, 0 of 6"
date: 2026-11-17
tags: [quality-audit, evaluation, testing]
description: "Six never-audited subjects, none at the bar. One sed slip had garbled eleven research summaries; an agent runner failed on its own flags every run."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The date-seeded mode draw put this session in `census` mode (seed `2026-11-17-e87b`). Census mode sweeps subjects nobody has audited yet, so its scores stay out of the sampled share. That share is still **33 of 306** (Wilson 95% 8% to 15%).

Each subject's audit is its `2026-11-17-<subject>.json` file in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file holds every check and every seeded bug, and all scores were set before any fix. For each subject I reran at least one of the auditor's key findings myself before accepting the audit. Those reruns are named below.

## The number

**0 of 6 meet the bar. Five of the six are finished** (completeness 3). The six projects' own tests caught **18 of 32** hand-seeded bugs. Verification failed the gate (scored 1 or 2) in five of six, and claims failed it in all six.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/mann-kendall-trend | 3 | 3 | 3 | 3 | 2 | 3 | 2 | no |
| research/market-routing | 3 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| research/buildbot-torquewall | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/ambient-startcount | 2 | 3 | 1 | 2 | 2 | 1 | 1 | no |
| research/eda-deepdraw | 2 | 3 | 1 | 2 | 1 | 1 | 1 | no |
| ventures/ubuntu-agent-server | 1 | 2 | 1 | 2 | 1 | 1 | 2 | no |

Coverage: 381 of 2,489 subjects have now had at least one audit (15.3%).

## The subjects

**ventures/mann-kendall-trend: one gate short of the bar.** The auditor wrote an independent implementation in numpy and scipy from Gilbert (1987), Hirsch and Slack (1984), Hamed and Rao, and Yue and Wang. It matched every statistic on the three Potomac River files to 1e-9: S, the tie-corrected variance, Sen's slope with its interval, and the seasonal covariance. The tool's own tests caught 8 of 9 seeded bugs, the best result in this batch. The worst defect was in the default test. The Yue-Wang correction applied its variance factor even when the lag-1 estimate was negative, and short series often give a negative estimate. Trend-free white noise was then called a trend 10.6% of the time at 8 readings and 11.1% at 10, against a nominal 5%. I reran that simulation myself and got the same figures. The size study behind the default began at 50 readings, so it never saw the problem. That is fixed here: the factor is floored at 1, and rejection on white noise falls to 3% to 5%. A test fails on the old code, and the size study now includes 10 and 20 readings. The FAQ said small samples get an exact p-value. Only the uncorrected row does, and the FAQ now says so. Still open: quarterly data are not auto-detected as seasonal, and an "NA" cell makes the whole column unreadable.

**research/market-routing: the headline is a tuning artefact.** Every number the auditor recomputed is right: the LMSR worst-case loss b ln n, the quadratic market's loss bound, and the Hedge regret bound from Cesa-Bianchi and Lugosi. I reran the loss check and the switching experiment (10 s). The headline said the quadratic market "keeps sparse, low-regret routing where LMSR becomes diffuse". It compared the two markets at the same liquidity b, but that b is a different learning rate for each market. The script prints two rows the README dropped. In them, LMSR at b = 0.1 has regret 74.3 with 1.1 active experts, and the quadratic market has 74.1 with 1.0. Tuned separately, they tie. The README, the abstract and the homepage card now say the advantage is lower sensitivity to b, not a better router. Also fixed: a trade bundle of the wrong length silently shrank the market state. Tests now pin the switching regret, which was untested, and both loss-bound constants. Still open: fixed share (Herbster and Warmuth) is cited but never run, and Propositions 1 to 3 restate Abernethy, Chen and Vaughan (2013).

**research/buildbot-torquewall: right numbers, overgeneralised headline.** The 990-case MuJoCo sweep reran byte-identical in 1,055 s. The auditor's own static calculation of the waist moment agreed with the sweep to within 1.7%. The headline said "the G1's wall is one joint: the waist pitch". That holds for one carry pose at peak torque limits. This repository's own [`buildbot-holdheat`](../../research/buildbot-holdheat/) finds that a pose search lowers the peak ratio and moves the binding joint. It also finds that no load is sustainable at this pose if the motors' continuous rating is half of peak or less. The headline is now scoped to the pose, and both caveats are listed as limitations. Also fixed: the limits table now lists every limit that gets scaled, the tally label no longer says "fail only on torque" for cases that also fail balance, and a new test covers `best()`, where a seeded bug had survived.

**research/ambient-startcount: fits that hit the iteration cap were counted as local optima.** The study's measure is the share of draws in which a fitting strategy reaches the best optimum. The auditor reran six null-cell draws. In them, 23 of 24 grid fits stopped at the 2,000-iteration cap. At a 50,000 cap, 12 of the 21 recorded misses disappear. So "more starts keep finding better optima; 8 is not enough" is mostly an iteration-budget effect. The README now says so. The project's homepage card was garbled: one sentence was pasted into itself four times. That led to the next finding.

**Eleven research cards were corrupted the same way.** In `sed`, an `&` in the replacement text stands for the matched text, so a replacement meant to write `4&ndash;5` wrote `4<old phrase>ndash;5` instead. A search for entity names with no `&` in front found the same corruption in eleven research summaries. One of them, `appeal-panels`, carried 70 KB of other projects' HTML ahead of its real text. All eleven are repaired here. I checked each restored figure against the project's README or `results.txt`. For example, chip-digits' "79&ndash;82% at W3" matches its 0.789 to 0.817, and simdesign-meshmargin's "17&ndash;35% mass cost" matches its mass table. The research homepage build now fails on an entity with no `&` and on page markup inside a summary. I checked that it flags every one of the old corruptions.

**research/eda-deepdraw: its one explanation was wrong.** The 0-in-n bound is right: an independent Clopper-Pearson calculation gives 0.002338 falling to 0.000141. The project's one anomaly, mutant `del@122`, "fails" 10 vectors short of the draw. The project read this as truncated output. I reran the auditor's check: all 2,000 rows are printed. The mutant deletes `done <= 0;`, so `done` is X for the first 10 vectors, and latency is 1 cycle instead of 20 on every vector. The checker's numeric-only regex skips the X rows and reports the row count. So this is a real detection at vector 0. The follow-up project `eda-biasdraw` "confirmed" truncation with the same regex. Both pages are corrected here. The checker itself and `analyse.py`'s truncation class are still wrong; they are listed under Known gaps. Three of four seeded bugs survived, because the tests read the committed log rather than running the code.

**ventures/ubuntu-agent-server: its Claude runner failed on every run.** With this box's Claude Code 2.1.326, `claude -p --output-format stream-json` exits with "requires --verbose" before doing any work. I reran it and got that error. The runner passed exactly those flags. It now passes `--verbose`, and a test pins it. The worst open defect: in `dry_run` mode the runner adds no "done" label. The same issue is cloned, run and commented on again at every 10-minute poll, up to 144 times a day. Also open: no task creates the `agent:*` labels the runner needs, and `process_issue`, which holds the dry-run and secret-scan gates, has no test. These are listed under Known gaps in its README. The README's test count, CI path and retired hosting note are corrected.

## What the six have in common

The arithmetic holds up: three subjects reproduced with no wrong output found. What fails is the step from numbers to claims. Two subjects compared things on unequal terms: one liquidity value for two learning rates, and one pose read as a general result. Two read an artefact of their own tooling as a finding: an iteration cap and a parsing regex. The tests mostly check the author's own committed numbers, so 14 of 32 seeded bugs survived, most of them in the experiment scripts that produce the headline. The fix earlier rounds proposed still applies: pin each headline output with a test against a source the author did not write. This round adds a second one: before explaining an anomaly, look at the raw output.

## Fixed in this round

Everything below is in [PR #16857](https://github.com/Duncan-Haywood/oss-monorepo/pull/16857). The scores above stay as audited, and a later re-audit will check the fixes.

- mann-kendall-trend: the Yue-Wang factor is floored at 1 (with a size test), the size study covers 10 and 20 readings, and the FAQ claim is scoped.
- market-routing: the tie at tuned b is stated, wrong-length bundles are rejected, and three tests pin hand-computed values.
- buildbot-torquewall: the headline is scoped, the holdheat caveats are added, the limits table and tally label are corrected, and `best()` has a test.
- ambient-startcount: the iteration-cap confound is stated, and a test covers `best_of_first`.
- eda-deepdraw and eda-biasdraw: `del@122` is now described as a real detection.
- ubuntu-agent-server: the runner passes `--verbose`, the README is corrected, and Known gaps are listed.
- Research homepage: eleven corrupted summaries are repaired, and the build now rejects that kind of corruption.
