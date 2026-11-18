# CI perf, 2026-11-18: open-house-plans checks a candidate before building it

Perf track, prompt 0. Both open perf backlog items (P063, P064) touch
`.github/workflows/` and wait for the owner. The runner reading
(`ci_profile.py --runs 600`) put `node --test in each touched venture` at
73 job-minutes, the largest landable step, and the suites with many perf
write-ups (league-schedule, shift-roster, shed-designer) had passes under way.
`run_venture_tests.py --times` listed open-house-plans at 39 s with one pass
(2026-11-13), whose "not changed" list named `buildSkeleton` and `fitRow`.

## Reading

4-core container, node 22.23.5.

- `suite_file_times.py open-house-plans`: engine.test.mjs 15.1 s of 23.3 s.
- `node --cpu-prof engine.test.mjs`, self time: `buildSkeleton` 2.2 s,
  `cleanSimple` 1.7 s, GC 1.5 s, `fitRow` 1.5 s, `buildWalls` 0.9 s.
- The search's own counts, over a 900-brief sweep (6 bedroom counts × every
  bath option × 3 garages × accessible or not × 3 styles × 2 priorities):
  19,908,180 candidates evaluated, 1,867,158 feasible. **Nine in ten
  candidates fail a constraint**, and the commonest failures ("row does not
  fit", "hall meets kitchen", "e1 - e0 < 3") were checked only after the
  garage, mudroom, great room and (split plans) primary suite had been built:
  rooms with ids, polygons through `clean`, links.

## Change

`layout.mjs` gains `skeletonGate(p, prog)`: every constraint `buildSkeleton`
had, in the same order, computed from the parameters alone (all of them are:
the geometry is a function of `p`). It returns the failure reasons exactly as
`buildSkeleton` counted them (a suite's own reason and then `"!suite"`), or
the two wing rows already ordered and fitted. `buildSkeleton` calls it first,
records the reasons in `why` and returns null; otherwise it builds the rooms
using the fitted rows. The mid-build `fail(...)` checks are gone, so there is
one copy of each constraint.

`fitRow(row, L)` is pure and the search asks for the same rows at the same
lengths across every depth, `df` and `wetAt`, so the gate reads it through a
`Map` memo (cleared past 50,000 keys so a long browser session stays bounded).
Callers only read the widths.

## Verification

- 900-brief sweep hashing every returned design (JSON) and the `why`
  failure-reason counts: `5f35c133…a6691` before and after, with identical
  evaluated/feasible totals. Sweep time 65.3 s → 39.0 s.
- `designFiles` for three briefs (the full plan set: SVG sheets, IFC, files):
  same SHA-256 before and after.
- `verify/sensitivity.mjs`: byte-identical output (`cmp`).
- New test in `engine.test.mjs` pins the evaluated, feasible and per-reason
  failure counts of three briefs, recorded from the code before this change.
- `node --test` in the venture: 42 pass, 0 fail.

## Numbers

| | before | after |
|---|---|---|
| `node --test engine.test.mjs`, 3 runs | 14.38, 14.46, 15.96 s | 10.58, 9.65, 10.32 s |
| median | **14.5 s** | **10.3 s** |
| `design({beds:4, baths:2.5, garage:2})`, median of 7 | 93 ms | 71 ms |

(The new golden test adds about 0.3 s to the after column; the before column
ran the same test file against the old code.)

## Not changed, ranked for the next run

1. **`buildSkeleton` + `score` for the ~9% feasible candidates** are now most
   of the search. Stage A builds the full room list only to score it; a score
   from parameters would need an equivalence test against `score`, which
   reads room polygons in several places.
2. **`cleanSimple`** on every `rect()` room: rectangles from `rect()` are
   already counter-clockwise with distinct corners, so a `room()` path that
   skips `clean` for them is exact, but `clean` copies the points and callers
   may rely on the copy.
3. `framing.test.mjs` and `catalogue.test.mjs` (about 3.5 s each) had no
   profile this run.
4. P063 and P064 remain owner-gated (workflow files).
