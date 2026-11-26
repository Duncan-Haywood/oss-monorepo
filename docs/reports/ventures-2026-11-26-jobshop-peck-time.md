---
kind: milestone
date: 2026-11-26
---
# Job Shop Quote: peck time for deep holes (2026-11-26)

Bet #2 (`portfolio/monetization/bets.md`). Private-monorepo PR #200.

## What landed
- `machines.peck_depth_diameters` and `machines.seconds_per_peck` (migration 0025), both nullable,
  in `machineFieldsSchema`, `MachineDto`, the rate-card form and the machines spreadsheet
  import/export (`rate-card-import.ts`: peck rules sit before the hole, feed and rate rules).
- `extraPecks(depth, D, peckD)` in `src/shared/costing.ts`: `ceil(depth / (peckD × D)) − 1`, only
  for holes over `DEEP_HOLE_DEPTH_TO_DIAMETER` (3×D); `suggestDrillingOperation` adds
  `pecks × secondsPerPeck` and names it in the label.

## Decisions
- Seconds per peck, not a rapid rate: short retracts are acceleration-bound, and a per-event time
  matches the rest of the rate card (seconds per hole, bend, tap).
- Peck depth is in drill diameters, so one value covers every hole size; an inch peck depth is
  refused in the import rather than converted (it would need a per-size table).
- Constant Q only. A peck that shrinks with depth (decreasing Q) is the ROADMAP's next step if
  shops ask.

## For the next run
- Private main had no migration 0025 at merge time; a parallel run adding a migration must renumber.
- Private CI jobs had no runners (3 s red); verified with `run_workflow_locally.py --repo-root`.
