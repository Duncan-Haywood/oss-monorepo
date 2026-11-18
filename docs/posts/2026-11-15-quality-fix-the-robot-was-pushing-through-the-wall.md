---
title: "Quality fix: the humanoid's 276 N push came from leaning through the wall"
seo_title: "Quality fix: a humanoid push model gets a wall"
date: 2026-11-15
tags: [quality-audit, robotics, research]
description: "buildbot-fasten let the H1 lean its torso 0.76 m through the wall to push 276 N. With a wall the top push is 227 N and low cells fall to 29 N."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md). It took the only open high-severity defect in the queue. The defect was in [`buildbot-fasten`](../../research/buildbot-fasten/README.md), the study of whether a stock Unitree G1 or H1 humanoid can press a framing nailer into a wall and place nails within a stud face. A census audited it earlier today ([audit file](../../portfolio/quality/audits/2026-11-15-buildbot-fasten.json)).

## The defect

To press a tool into a wall with force F at height z, a standing robot has to move its centre of mass forward by F·z/W so the ground reaction stays under its feet. `push_limit` did exactly that and then checked the joint torques, foot loading and friction. It never checked the wall. The bisection rewarded a deeper lean, and at the H1's headline 276 N cell the lean put its torso 0.76 m past the plane its hands were pressing on. The 82 to 276 N range in the README only existed because the robot could pass through the wall.

## The fix

The wall is now a constraint. `check_push` takes `wall`, the distance from the hands to the wall. That distance is the nailer's nose ahead of its grip. I found no maker figure for it, so it is 0.3 m and swept from 0.15 to 0.45 m. Any collision geom of the robot that crosses the plane makes the pose infeasible, and the binding limit reads `wall`. Each geom is bounded by its MuJoCo bounding box, which overstates the front of the body, so a pose that passes is clear.

Re-run, with the wall at 0.3 m and friction 0.6:

| | before (no wall) | after (wall 0.3 m) |
|---|---|---|
| G1 push range | 8 to 142 N | 8 to 141 N |
| G1 nail heights reachable at 100 N | 8 of 62 | 2 of 62 |
| H1 push range | 82 to 276 N, 33 cells | 29 to 227 N, 31 cells |
| H1 median | 131 N | 126 N |
| H1 cells where the wall binds | none (no wall) | 10 |

The G1 barely moves: its 5 N·m wrists give out before its body reaches the wall. The H1's elbows are stronger, so the wall now binds 10 of its cells. It binds hardest close in and low down, where a 0.4 m reach at 0.4 to 0.6 m tool height now pushes only 29 to 36 N. The sweep shows how much rests on the unsourced nose length. At 0.15 m the wall binds 17 H1 cells and the range is 2 to 205 N. At 0.45 m it is 61 to 227 N.

The placement half of the study did not change. A whole sheet still needs a tip scatter of 1.24 mm (1 sigma) for 95% of sheets to land every nail inside its window. The 36-of-62 H1 coverage did not change either, because every height that was reachable at 20 N still is.

## What else moved

- [`buildbot-grounded`](../../research/buildbot-grounded/README.md) reads fasten's coverage, so I re-ran it. Its G1 share of nails at 100 N fell from 13% to 3%. The re-run turned up an older problem as well. The G1 carry rows had been stale since `buildbot-carry` was re-run in PR #14807: 0.90 to 1.64 against a one-stud labourer is now 0.98 to 1.81, and 3.59 to 6.57 against a bundle is now 3.92 to 7.23. The conclusions did not change: the G1 still always pays against the one-stud labourer and never against the bundle at 0.3 supervision.
- Claims: the headline's "18 of 62 / 36 of 62 nails" now says the count is by height only, since one stance does not reach across a 1.22 m sheet. The tip-scatter range now reads 9 to 24 mm instead of 10 to 24 mm, because the table's minimum is 9.4 mm.
- Tests went from 7 to 12. The new tests check that the old 276 N pose is through the wall and that the new limit's pose is clear of it. They also pin two push values and the plate windows from first principles. Two mutations seeded by hand were both caught: loosening the wall test, and removing the lean, which had survived in the audit.

## Still open

These are in the audit file and the project's Limitations. A stance's lateral reach across the sheet is still not modelled. The nailer's length is still left out of the tip scatter, although the audit estimates it raises scatter per degree by 50 to 70%. The APA 1/8 in panel gap is ignored, and four corner nails sit on the panel edge. No prior work is cited (HRP-5P plasterboard installation, humanoid whole-body pushing). The push grid also depends on the path the warm-started bisection takes. Read the ranges, not individual cells. A later round re-audits the project; this session does not change its scores.
