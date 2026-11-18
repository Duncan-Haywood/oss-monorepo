# container-load-planner: corners remember sizes that can never go there (2026-11-17)

**Reading.** `run_venture_tests.py --times 40` (file timed 2026-11-17 at
1cdd63196): container-load-planner at 10.0 s under 4-job contention, no
earlier perf pass. On an idle core the suite is 3.8 s, so the CI share is
small; the reason to work here is the page, which runs the same packer in the
visitor's browser on every "Plan" click.

**Profile.** A bench (1,600-unit two-line load, `compareOptions` on the sample
cargo, 40 random mixed loads with rotations, layer and load limits), `node
--cpu-prof`, self time summed per function: 6.0 s total, 3.15 s in `tryPlace`,
1.35 s in `packPass`. Counting `tryPlace`'s answers on the same bench: 6.38 M
calls from the corner scan, 0.46 M successes, and of the 5.92 M failures
2.65 M overlapped a placed box, 0.86 M broke a layer limit and 0.04 M touched
the underside of a box: 3.56 M failures that can never turn into a fit later
in the same pass, re-tested on every placement.

**Change** (`calc.mjs`). `tryPlace` returns `DEAD` (0, still falsy) instead
of `null` for those three reasons. The corner scan gives each distinct placed
size an id and, on `DEAD`, sets a flag on that corner for that size; later
scans skip it. Why each is permanent within a pass: boxes are never removed
(overlap, touching the underside), and a corner's supporters and their levels
only grow (layer limit). Too little support and too much load on a box below
stay `null`: a later box can add support or change how load is shared. The
slide-back moves call `tryPlace` at arbitrary points and do not use the memo.

**Verification.** Same output, byte for byte:
- bench fingerprint (sha256 of `JSON.stringify` of every plan) 2f69d44bee122d18 old and new;
- 3 x 150 random loads (1 to 6 lines, every rotation rule, layer and load
  limits, multi-stop, pallets, minSupport 0.5/0.75/1, restarts from
  `suggestRestarts` so the noisy restarts run): fingerprints equal for
  `git show HEAD:calc.mjs` and the new file on all three seeds;
- new test pins 24 mixed loads to the hash the pre-memo packer produced. Red
  check: marking support failures `DEAD` too makes it fail (44 pass, 1 fail);
- `run_venture_tests.py container-load-planner`: 77 tests pass.

| measure | before | after |
|---|---:|---:|
| bench, random mixed loads | 4.15 s | 2.74 s |
| bench total | 5.8-6.0 s | 4.2-4.5 s |
| 150 random loads, three seeds (concurrent pair) | 12.1 / 16.8 / 19.3 s | 9.4 / 13.5 / 14.4 s |
| `node --test *.test.mjs` (idle core) | 3.8 s | 3.4 s |

The 1,600-unit two-line load did not move (0.6 s): its corner scan is 1.66 M
visits that fail the wall check before `tryPlace`, with only 64 k calls.

**Not changed, ranked.**
1. The every-16-placements corner prune (0.31 s of 1.5 s on the big load)
   calls `near()` with a fresh array per corner; a non-allocating cell walk
   would help large uniform loads.
2. The corner scan's wall check on uniform loads: corners near the roof or
   the far wall fail for every size each time; a per-corner "fails the wall
   check for size s" bit is already implied by `DEAD`'s array and could be set
   there too (wall failures are permanent), but it only saves a compare.
3. `slideX`/`slideY` scan every placed box (O(n) per move); a grid lookup
   along the axis would cut it on loads of thousands of units.
