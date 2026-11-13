# Venture suites: open-house-plans' polygon clean-up skips the work for plain rooms (2026-11-13)

Perf track, prompt 0. Both open perf backlog items (P063, P064) change workflow
files and wait for the owner, so this run took item 3 of "Where to look": the
slowest local step a session waits on, here the venture suites.

## Reading: every venture suite

`python3 platform/ci/run_venture_tests.py --slowest 40 --no-elsewhere`, this
container (4 cores), 2026-11-13: 1,350 suites, 0 failed. The slowest, in
seconds with four suites at once:

| venture | s | perf passes before this one |
|---|---:|---|
| changepoint-detector | 604.5 | several |
| league-schedule-generator | 532.4 | several (287 s in the morning reading: contention) |
| shed-designer | 520.3 | several |
| shift-roster-builder | 442.8 | several |
| ai-bookkeeper | 143.5 | 2026-11-13 (.xls padding) |
| wall-framing-takeoff | 140.5 | 2026-11-12, 2026-11-13 (x2) |
| clothing-design-studio | 54.1 | none |
| open-house-plans | 53.6 | none of its own |

The top six have all had passes today or yesterday. open-house-plans had none,
and alone it took 36 s, 26 s of which is one test, "every program from a studio
to five bedrooms gets a sound design" (150 calls to `searchDesigns`). The same
search runs in the browser when a visitor asks for a plan.

## Profile

A bench script (scratch, not committed) runs those 150 briefs with `keep: 3`
and hashes `JSON.stringify` of every result. Old code: 23.7 to 25.9 s, hash
`8d4fc4513e421223`.

`node --cpu-prof`, self time: `clean` (geom.mjs) **7.4 s**, `buildSkeleton`
2.5 s, GC 1.8 s, `fitRow` 1.7 s, `estimate` 1.1 s, everything else under 1.1 s.
One three-bedroom search calls `clean` 106,708 times: 100,972 four-corner
rectangles and 5,736 six-corner L-shaped bedrooms. Making `clean` return its
input unchanged (to bound the gain, not as a fix) took that search from 107 ms
to 76 ms warm.

Why: every room passes through `clean`, which copies the points with
`for...of` and destructuring, then runs a restart-on-removal loop with `%`
indexing to drop collinear corners. A `rect()` or `cutCorner()` never has any,
so the loop always runs a full pass and changes nothing.

## Change

`ventures/open-house-plans/geom.mjs`: `clean` first tries `cleanSimple`, one
indexed pass that returns `null` as soon as it sees a repeated corner (wrap-around
included, with the general path's own tolerance or stricter) or a
straight-through vertex, and otherwise copies the points in order or reversed
by the same signed area the general path computes, summed in the same order.
In exactly the cases where it returns, the general path would copy the points
unchanged and orient them the same way, so the output is identical; every
other polygon goes to the old code, now exported as `cleanGeneral`.

New `geom.test.mjs` pins the two together on 20,000 random polygons on a
coarse half-foot grid (3 to 8 corners, both orientations, repeats, spikes,
collinear runs, near-duplicate closing corners) plus rectangles, a zero-width
rectangle and an L-shaped bedroom, and checks the output never aliases the
caller's arrays. Two mutations of the fast path (drop the repeat check; reverse
on `s <= 0`) each fail it.

## After

| measure | before | after | how |
|---|---:|---:|---|
| bench, 150 briefs | 23.7 / 25.9 s | 15.9 / 16.5 s | two runs each, alternating, same hash `8d4fc4513e421223` |
| open-house-plans suite | 36.4 s | 25.1 / 25.7 s | `time python3 platform/ci/run_venture_tests.py open-house-plans` |

The before suite run had the new test file present (untracked files survive
`git stash`) and failed only that file, which needs the new export; the other
six files ran the old code, so 36.4 s is the old timing within about 0.2 s
(the new file takes 0.2 s).

## Not changed, ranked for the next run

1. **`buildSkeleton` (2.5 to 2.9 s self) and GC (1.6 s).** Stage A of
   `searchDesigns` builds a full skeleton (every room object, id string and
   link) for each candidate only to score it; most never reach stage B. A
   score computed from the parameters, or rooms built lazily, would cut both,
   but `score` reads room polygons in several places, so it needs a careful
   equivalence test, not a quick edit.
2. `fitRow` (1.7 s): it re-derives the same row widths for the same
   `(row, L)` across `df` and `wetAt` variants. A memo keyed on the row and
   length is likely safe; check that callers never mutate the returned array.
3. clothing-design-studio (54 s in the sweep) has had no perf pass.
4. The top four suites are still most of the sweep's suite-seconds.
5. P063 and P064 remain owner-gated (workflow files).
