# Agent CLI suite: describe tools in batches (2026-11-03)

Perf track. `ci_profile.py --runs 600`: "Every tool stays callable from the
agent CLI" (Portfolio validate) is 4.0 job-minutes over 45 jobs, the first
item of the previous pass's "not changed" list.

## Reading

`node --test "platform/agents/*.test.mjs"`: 10.5 s wall, 8.9 s of it in one
test that awaited `describe()` for each of 1000+ catalogue tools in turn, so
file reads and module compiles never overlapped.

## Change

The test now runs `describe` in batches of 16 with `Promise.all` and folds the
results in catalogue order, so the failure list and the callable count are
computed exactly as before. No assertion changed.

## Verification

Before: 10.5 s wall, 16 tests pass. After (two runs): `duration_ms` 6345 and
6655, 16 pass, 0 fail. Same assertions, same threshold (95% callable).

## Not changed, ranked

1. Larger batches: gains flatten; module compile is CPU-bound on one thread.
2. Portfolio validate's ~30 short steps (interpreter start each).
3. quick-pick-survey "Simulation tests" (23.5 min / 10 jobs).
