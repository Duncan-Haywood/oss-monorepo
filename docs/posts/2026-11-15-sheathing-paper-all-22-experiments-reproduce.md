---
title: "All 22 experiments behind our sheathing-robot paper now reproduce, but one needs an older Drake"
date: 2026-11-15
tags: [buildbot-sheathing, reproducibility, drake, mujoco, construction-robotics]
seo_title: "Re-running every experiment in a robotics paper: what broke"
description: "We re-ran the last ten experiments behind a robot-sheathing paper. Eight matched exactly, one table drifted, and current Drake cannot run one."
---

The `buildbot-sheathing` programme asks whether a robot can hang a 4x8 sheet of wall sheathing and land all 62 nails on the studs. Its paper for *Automation in Construction* quotes 194 numbers. The [previous step](2026-11-15-sheathing-robot-results-rerun-reproducibility.md) added `reproduce.py --check`, which re-runs an experiment in a scratch copy and compares the fresh results file with the committed one, character for character. Twelve experiments went through it, and two had drifted. This step ran the other ten: the MuJoCo and Drake contact simulations and the wall pushover and cyclic-loading runs, about 2 h 20 min on four CPUs.

**Eight matched exactly** apart from wall-clock lines: the ledger seat (m3), the humanoids (m3b), the bowed sheet edge (m6b), the frame and soft-nail limit analyses (m15, m16), the wall pushover (m19), the CUREE cyclic runs (m20) and the strength-degrading nails (m21).

**The current Drake can't run m6.** The Drake cross-check compares two contact solvers, SAP and TAMSI. Drake 1.58.0, the version `pip` installs today, rejects `discrete_contact_approximation="tamsi"`. The experiment was committed under 1.51.1, and its `results.json` records that version. With `pip install drake==1.51.1` in a separate environment it runs. Nothing else in the project uses TAMSI, and the Drake tests and m6b pass on 1.58. The pin is now written into `reproduce.py`, the module docstring and the paper's data-availability statement. On 1.58 the run still stops with Drake's own error, but `reproduce.py --list` now names the version it needs.

**m6 also drifted, for a cause we had already traced.** One m6 table re-runs the 24 ledger pipelines with each engine's seated error. Its "no residual" column now equals the refreshed whole-cycle table (m5) line for line. So this is the same cause the last step found: a later milestone drew two random tilts in the opposite order. The paper's one number from that table, the worst gap between Drake and MuJoCo in clean-sheet rate, moves from 0.06 to **0.05 points**. The pre-registered bar was 10, so the verdict is unchanged.

**Two bookkeeping finds.** In m9, one missed-nail mean printed as 0.48 and now prints as 0.47. The JSON shows why: the old formula, (1 − mean hit) × 62, gave 0.47500000000000164, and the per-sheet sum gives exactly 0.475. That's floating-point error at a rounding edge, and the paper doesn't quote the value. In m21, a diagnostics file ended in the word `DONE`, a wait marker an earlier session's shell had echoed into it. The script never prints it.

**The check needed two fixes too.** m6 reports seconds per seat as a bare table column, and three experiments end with `wall time N s`. Neither matched the timing patterns the checker masks, so a faster machine looked like a failed reproduction. Both patterns are now masked, with tests.

**What this means for the paper.** Every results file it quotes has been re-run from the committed code, and 194 of 194 quoted numbers match. Still open before submission: authorship, two standards' editions, and a tested end-nail strength. Code, paper and log: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
