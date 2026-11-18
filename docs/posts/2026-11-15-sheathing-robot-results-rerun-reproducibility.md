---
title: "We re-ran a robot-sheathing paper's experiments: two had drifted"
date: 2026-11-15
tags: [buildbot-sheathing, construction-robotics, reproducibility, monte-carlo, automation-in-construction]
seo_title: "Do a simulation paper's results still reproduce? A re-run check"
description: "Re-running 12 experiments behind our sheathing-robot paper found two whose committed numbers came from older code. What moved, why, and the new check."
---

The `buildbot-sheathing` programme asks whether a robot can hang a 4x8 sheet of wall sheathing and land all 62 nails on the studs. Its paper for *Automation in Construction* quotes 190 numbers, and a script already checks that each one matches the results file it came from. Nothing checked that those results files still match the code. Shared modules had been edited by eight milestones since some of them were written.

So this step added `reproduce.py`. It runs any experiment with one command, and `--check` re-runs experiments in a temporary copy and compares each results file with the committed one, character for character, with only wall-clock timings masked.

**What we re-ran.** Twelve experiments: the ten that need only numpy (about six minutes together) and two wall limit-analysis experiments that need scipy (about 15 minutes). Two more scipy experiments were started and stopped at the session's time limit. The MuJoCo and Drake simulations and the hour-long cyclic runs were not re-run in this step.

**Two had drifted. Neither was a bug.**

- **The whole-cycle experiment (milestone 5).** Its best single-2x pipeline came back at 0.5814 clean sheets, not the committed 0.5833. Bisecting over the five commits that touched the simulator showed that milestone 5's own commit still gives 0.5833 exactly, and that every commit from milestone 9 onward gives 0.5814. Milestone 9 had rewritten one function to add a new option. In doing so it drew two random tilts in the opposite order from the same generator. The distributions are identical but the draws are not.
- **The remedies experiment (milestone 12).** Three values moved in the third decimal (0.549 to 0.548 missed nails a sheet). Milestone 14 had changed how a mean is computed: the same quantity, rounded differently.

**What moved in the paper.** Two doubled joint studs with one read a stud now give 99.94% clean sheets, not 99.97%. The break-even cost of a missed nail is $6.47, not $6.51 (5–95%: $5.17 to $7.83). The largest loss from firing through the nailer's recoil is 7.39 points, not 7.64. Each new value is well inside the Monte Carlo interval the old one was quoted with, and no hypothesis changes its verdict.

**The check had a blind spot.** The number checker tied "0.9997" to its results line, but not the same number written as "99.97%". So the stale figure sat in the abstract, a highlight, the discussion and the conclusion, and nothing failed. Four new checks bind the percentage form. Earlier posts on this programme that quote 99.97% describe the code as it was when they were written.

**After the refresh,** every re-run experiment reproduces its committed file. Still open before submission: authorship, two standards' editions, and putting the remaining pushover, MuJoCo, Drake and cyclic experiments through the same check. Code, paper and log: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
