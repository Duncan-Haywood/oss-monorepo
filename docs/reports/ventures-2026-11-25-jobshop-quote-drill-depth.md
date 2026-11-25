---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): drilling time from hole depth at the machine's drill feed

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#186 (merged). Claim slug
`geometry-drill-depth` (ROADMAP item 5, "drilling time by diameter and depth").

**What landed.** `machines.drill_feed_in_per_min` (migration 0019) and `drillFeedInPerMin` on the
machine schemas, DTO, rate-card form, CSV import (a header with "drill" plus feed/penetration/IPM/
in per min; the rule sits before the cut-speed rule, whose regex also matches "in per min") and
export. `suggestDrillingOperation` in `src/shared/costing.ts`: minutes = locations × seconds per
hole / 60 + total depth / feed. A machine with either rate is a candidate; exactly one must remain.
Labels count holes deeper than `DEEP_HOLE_DEPTH_TO_DIAMETER` (3) × their smallest diameter, and,
when the feed is used, holes with no depth.

**Choices the next run should keep.**

- One feed per machine, not per diameter: feed per rev scales roughly with diameter and rpm
  inversely, so penetration rate varies far less. This is a rule-of-thumb argument, not a cited
  source; a material × diameter chart (like the cut-speed table) is the next step if shops find it
  coarse.
- Deep holes are flagged, never timed with an invented peck factor.

**Next.** Peck time for deep holes from a shop-entered peck rate; tapping once holes can be marked
threaded; IGES/STL.

**Verification.** `run_workflow_locally.py --repo-root /home/user/private-monorepo jobshop-quote-ci`:
all 11 run steps ok (Biome, typecheck, unit 298, worker 170, build, deploy provisioning, D1
migrations in sync, Playwright e2e). Private CI was not waited on (runners starved there).
