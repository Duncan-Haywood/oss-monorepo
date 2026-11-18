# Conflict-marker guard: scan 4x faster (2026-11-03)

**Reading.** `ci_profile.py --runs 100`: `Conflict markers` is the largest
job family by minutes (7 jobs, 6.7 min); its heaviest step is "Guard unit
tests" (0.6 min), whose `test_the_repository_itself_is_clean` scans all
~48k tracked files.

**Profile.** `python3 -m cProfile -s cumulative -m unittest
test_check_conflict_markers`: 8.2 s total, of which `Path.resolve()` per file
(to skip the guard's own file) 3.0 s, and a per-line `startswith` pass over
every file 2.0 s.

**Change** (`platform/ci/check_conflict_markers.py`): compare the file name
before calling `resolve()`; skip the per-line pass when none of the marker
strings occur anywhere in the text (a marker starting a line necessarily
contains one). Findings are unchanged; the 11 guard tests pass, including the
seeded-conflict ones.

**Numbers** (same sandbox, warm cache): guard script 4.9 s profiled / ~2.2 s
plain before the pre-check, 1.9 s after; unit tests 8.2 s -> 2.2 s.

**Not changed, ranked.** 1. Checkout is 66-90% of every small job
(`chk%`), the pool-wide cost. 2. The repository-clean test repeats the
workflow step before it; kept, since dropping a test is out of bounds.
