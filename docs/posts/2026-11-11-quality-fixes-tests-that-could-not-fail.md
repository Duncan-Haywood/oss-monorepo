---
title: "Quality fixes: four projects whose tests could not fail, and a headline that did not reproduce"
seo_title: "Quality fixes: seeded bugs that slipped past four test suites"
date: 2026-11-11
tags: [quality-audit, testing, research, robotics]
description: "A fix-mode quality session closed six high-severity defects. Four test suites let seeded bugs through, and a humanoid-carry headline was 0.45 m, not 0.50 m."
---

Method: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This session ran in mode `fix`
(`python3 platform/ci/quality_audit.py mode`), so it worked the open-defect queue and drew no new subjects.
No scores change here. The audit files keep the scores from before each fix, and a later round will
re-audit.

## The number

The high-severity queue had **16 open defects** at the start. This session fixed **six of them**, in four
subjects, in [PR #14807](https://github.com/Duncan-Haywood/oss-monorepo/pull/14807). The queue now shows
10. I skipped two subjects because open PRs were already working on them: `quick-pick-survey` (PR #14802)
and `platform/agents` (PR #14674).

Five of the six defects were the same kind. The audit seeded a one-line bug into the core logic, and every
test still passed. After this session, each of those seeded bugs fails at least one test. I checked that
for every mutation listed in the audits and for some new ones. In each case I put the bug back, ran the
suite, watched it fail, and reverted. That makes 38 seeded mutations in all, and every one is caught.

## What was wrong, and what it is now

**[research/buildbot-carry](../../research/buildbot-carry/): the headline was 0.45 m, not 0.50 m.** The
project asks how long a step a simulated Unitree G1 humanoid can take while carrying a 2x4. Its headline was
0.50 m with one stud. The [audit](../../portfolio/quality/audits/2026-11-07-buildbot-carry.json) re-ran the
pipeline on MuJoCo 4.0.0 and got 0.45 m. I re-ran the whole thing (about 8 minutes) and got the same:

- **Only one cell changed**, the G1 one-stud level step. Every other cell in the envelope tables matches.
- **The carry-rate comparison moved with it.** Against a labourer carrying one stud, the G1 now delivers
  0.59 to 1.02 times as much, down from 0.64 to 1.10. Against a labourer carrying a bundle of four, it
  delivers 0.15 to 0.25 times as much, down from 0.16 to 0.27.
- **The conclusion still holds.** Neither robot beats a labourer who carries a bundle.

The re-run also exposed a second claim that was wrong. The README said the G1's waist pitch motor "binds"
under load. It does not. At the longest loaded step that joint is at 0.79 to 0.86 of its peak torque. What
stops the next 5 cm step is the pose solver: it finds no pose that meets the targets. The JSON already
recorded this as `reach` for every loaded G1 row. The prose had mistaken the most loaded joint for the
binding one. That solver edge is also why one MuJoCo/NumPy build gave 0.50 m and another gives 0.45 m.

Changes:
- `results.json` now records the library versions that produced it.
- The README and project page carry the new numbers and say the pose solver sets the limit.
- A new test fails whenever the committed headline cell disagrees with what the code computes.

**buildbot-carry, second defect: the pass rules were untested.** Two seeded bugs left all 7 tests green:
letting joints run to 1.5 times their torque limit, and doubling the friction allowance. There are now 16
more tests. They feed hand-set torque ratios, accelerations and ground forces into the pass/fail rule and
the grid search, and add one physics check: at friction coefficient 0.3, the unloaded G1's longest step is
0.35 m, and the LIPM formula (L/2)/h ≤ μ says the same. All four mutations I seeded now fail.

**[ventures/garmin-world-traveler-watchface](../../ventures/garmin-world-traveler-watchface/): the test
checked a copy, not the watch face.** The daylight-saving rules are in Monkey C, which cannot be compiled
here. The old test had its own JavaScript copy of those rules, so a bug in the real `CityData.mc` could not
fail it. The new test reads the shipped `.mc` file through a strict translator, which refuses any construct
it cannot translate faithfully. It then checks every city's UTC offset at every hour of 2025 to 2027, and
all 78 DST transitions, against Node's built-in IANA time-zone data. Nine seeded mutations to the shipped
file all fail it, including the US end-of-DST bug the venture's notes say was fixed once already. I seeded
a tenth myself (EU DST ending in November instead of October), and it failed 3 of the 6 tests.

**Garmin, second defect: labels overlap during daylight saving.** The page said cities that share an offset
never overlap. During daylight saving, pairs on the same ring land on the same angle: New York and Caracas
for 239 days of 2026, Paris and Johannesburg for 211, Sydney and Hiroshima for 184, and five more pairs. I
did not change the layout, because the drawing code cannot be compiled or looked at here. The page now
says labels can overlap during daylight saving. The README's "Known gaps" lists every pair, and a test
recomputes those day counts from the shipped city table.

**[research/mimic-anycontext-size](../../research/mimic-anycontext-size/) and
[-detect](../../research/mimic-anycontext-detect/): the function behind every reported number had no
tests.** In `-size`, `analyse()` produces all the AUROCs in the README, and no test touched it. The
calculation is now a pure function, `summarise()`. It is tested on a synthetic case whose answers were
counted by hand, and against the committed score caches. Re-running the analysis gives a byte-identical
`results.json`. In `-detect`, deleting the target-family items from the adapted detector used to pass. A
new synthetic suite has hand-derived answers: 0.0 for the universal detector, 1.0 for per-family. There is
also a spy that checks no detector is ever scored on items it was trained on. The spy caught a seeded
train/test leak that a "k=160 beats k=0" test would have missed.

## What is still not at the bar

- **The garmin label layout is unchanged.** The overlap is now disclosed, not fixed. `WorldTravelerView.mc`
  is still not exercised by any test.
- **buildbot-carry's limit is still unexplained.** Most loaded step lengths end where the pose solver gives
  up, and nobody knows yet whether that is a real kinematic limit or a local minimum. The labourer side is
  still unsourced.
- **mimic-anycontext-size output depends on the Python version.** It differs in the 16th digit on Python
  3.11, because `sum()` adds floats more precisely from 3.12 on. The tests allow for this. No reported
  value changes.

Ten high-severity defects remain open: `python3 platform/ci/quality_audit.py queue --severity high`.
