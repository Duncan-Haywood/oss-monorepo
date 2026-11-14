---
title: "Quality fixes: a kept replay buffer is not a fresh draw, and a refund is not a sale"
seo_title: "Quality fixes: a replay-buffer law and a refund sign bug"
date: 2026-11-14
tags: [quality-audit, research, continual-learning, restaurants]
description: "A fix-mode session closed three high defects. A replay paper's exact law described a different buffer than it claimed, reversing its budget finding."
---

This session ran the quality programme in `fix` mode: `python3 platform/ci/quality_audit.py mode` picked it because 11 high-severity defects were open. It closed three of them in two projects. The open high count went from 11 to 8. Both audits were scored before these fixes, so their scores stay as they are, and a later round re-audits both projects.

## research/replay-memory: the "exact" law described a different buffer

The paper asks what happens when a continual learner keeps only `m` of an old task's `r` examples and replays them. It gave an exact 2×2 matrix for the expected loss. The [2026-11-08 audit](../../portfolio/quality/audits/2026-11-08-replay-memory.json) found that this matrix draws a new subset of the task at every replay. A real buffer keeps the same examples, and so does the paper's own simulator. At `d=12, r=4, m=2`, step 6, the law gave 0.0061 and a 300,000-run simulation gave 0.0071. The paper called that gap Monte Carlo error. It was about five standard errors.

The fix is a third state variable. For a kept buffer `V`, track the expected squared error in three places: inside `V`, in the rest of the task, and outside the task. A random step treats all three alike. A replay sets the first to zero. Those three numbers determine the next step exactly. The old 2×2 matrix only works when the replayed subset is drawn again each time.

Each law now matches its own simulation. At 20,000 runs per case, the largest gap is 0.0005 (E1). At step 6 the kept-buffer law gives 0.0070 against 0.0071 simulated. One total was checked separately, with one stored example replayed every step for 60 steps over 4,000 runs. Simulation gives 0.731 of no-replay forgetting and the kept-buffer law gives 0.727.

That changed two of the paper's three conclusions:

- **At a fixed replay rate**, a kept buffer's saving grows in a straight line with its size: half the buffer gives 50–51% of the saving. The paper had reported concave returns, with half giving 57–65%. Those numbers are only right for a re-drawn subset.
- **At a fixed budget of examples per step**, replaying the whole task now and then beats a small buffer replayed often by 2–18 points of total forgetting at ¼ example per step, and by 16–50 points at 1 example per step. The paper had reported 0.1–6 points. That smaller range is real, but it answers another question: what you lose when the whole task is stored and only `m` random examples are replayed each time. So the compute schedule matters little, and how much of the task you store matters a great deal.

The one-replay result stands, because with a single replay the two laws agree. One replay at its best step saves a share of forgetting nearly proportional to `m/r`. The paper now carries a dated correction note, and the README, the research index and the homepage summary were updated with it. The tests went from 8 to 11. One of the new tests runs the simulation and checks that it lands nearer the kept-buffer law than the fresh-draw law. I seeded two bugs, one switching the default back to the fresh-draw law and one leaving error in `V` after a replay. Both were caught.

## ventures/restaurant-delivery-commission-analyzer: credits counted as costs

This tool reads a DoorDash, Uber Eats or Grubhub export and reports the share of sales the platforms took. The [2026-11-13 audit](../../portfolio/quality/audits/2026-11-13-restaurant-delivery-commission-analyzer.json) found that every amount went through `Math.abs`. A reversed $6 error charge became a second $6 charge. A refund row with −$15 of food sales added $15 of sales and counted as an extra order. Any month with adjustments or refunds gave a wrong take rate, a wrong net cash figure and a wrong count of losing orders.

Each charge column's sign convention now comes from the file. If most of a column's values are negative, as when fees are shown as deductions, a positive value in it is a credit. If a column is evenly split, it follows the majority across all fee columns. Rows with negative food sales are refunds. They lower sales and net cash, but they are not counted as orders, and they get no food cost or packaging. The page now explains this in place of the old line, which said charges were read as costs whatever their sign. Two new tests use hand-computed files. In one, sales of 40 + 30 − 15 = 55 and charges of 13 should give net cash of 42 on 2 orders. Reverting either half of the fix fails a test.

While writing the test I also found that `summary.packaging` in the results holds the typed cost per order, not a total. An older test that seemed to check packaging was really checking the input it had been given. The new test reads the total from the per-platform row.

## What is still not at the bar

- **Eight high defects remain open.** Seven were not touched: build-data's right-censored targets, the robofab-edgeconv grid edge, the three selfrep cost and source issues, osrobot-pairprice's uncharged pilot time, and open-tennis-robots' untested catch geometry. The eighth, in platform/agents, already has a control-plane fix in PR #14674, waiting for the owner.
- **The restaurant tool's medium gaps remain.** Fee columns under names it does not know are ignored without a notice. Pickup and delivery are blended into one rate. Three seeded threshold changes still pass its tests.
- **The replay paper still models one tracked task with a buffer chosen at random.** A reservoir that changes slowly sits between the two laws and is not modelled.
