# agent-permission-harness: `_file_index` on os.scandir (2026-11-07)

**Metric:** wall time of `python3 -m unittest discover -p 'test_*.py'` in
`portfolio/pipeline/probes/agent-permission-harness` (94 tests), the largest
step of the "agent-permission-harness CI" workflow (2.8 job-min over 20 jobs
in the 600-run reading).

**Before:** 11.9 s (cProfile: `instruction_closure` 5.9 s over 17 calls, each
calling `_file_index`; ~260k `posix.stat` calls, 220k `pathlib` parses).
**After:** 3.9 s, same machine, same command (`time`, one run each; user time
4.8 s to 3.4 s).

**Change:** `_file_index` called `os.path.isfile` on every file and
`Path.relative_to` on every directory. It now walks with `os.scandir`, whose
entries report `is_dir`/`is_file` from the directory read, and builds relative
paths by string. Symlinks are still followed for files and never descended for
directories; pruned dirs are skipped.

**Verification:** the old and new functions return the identical sorted list
for this repository (51,274 entries, `==` on the lists); all 94 tests pass.

## Not changed (ranked)
1. P063 venture checkout (needs owner: CODEOWNERS path).
2. `instruction_closure` still reads each doc once per call; 17 calls re-walk
   the same tree by design ("a tree changed between closures is seen").
3. Portfolio Pages "Test the site builder" remains the largest job (62 min).
