# CI perf, 2026-11-21: the research-archive test fixture is built once and copied

Perf track, `perf/0`. Both open perf backlog items (P063, P064) touch
workflow files and wait for the owner, so this run took item 2 of the
"not changed" list in `ci-perf-2026-11-21-csv-split-ratchet-once.md`:
`platform/ci/test_research_archive.py`, which the unwired-checks pool runs in
every ventures-tests job.

## Reading and profile

`python3 -m cProfile` over `unittest test_research_archive`: 3.9 s total,
3.35 s of it in `select.poll` waiting on 311 subprocesses. `strace -f -e
trace=execve` counted 1,070 successful execs. Two causes:

1. **Fixture rebuilt per test.** The 11 `Branches` tests each ran nine git
   commands in `setUp` (three `init`, `add`, `commit`, `rev-parse`, two
   `push`, `clone`) to get the same upstream, origin, work tree and clone.
   This is the pattern `ci-perf-2026-11-04-git-fixture-template.md` fixed in
   `test_unlanded_work.py`.
2. **Housekeeping children.** Every fetch, push and commit started a
   `git gc --auto` and a `git maintenance run --auto` child (44 and 43 per
   run) that has nothing to pack in a one-file repository. In this cloud
   sandbox `commit.gpgsign=true` is set globally, so each fixture commit also
   ran the signing program (24 per run); CI runners do not sign.

## Change

`test_research_archive.py` only:

- `Branches.template()` builds the four repositories once per process;
  `setUp` copies them with `shutil.copytree` and runs one
  `git remote set-url origin` so the clone points at its own origin copy.
  Real repositories and real refs throughout, nothing mocked.
- The test's git `ENV` sets `gc.auto=0`, `maintenance.auto=false` and
  `commit.gpgsign=false` through `GIT_CONFIG_COUNT`. `research_archive.py`
  itself is unchanged and still runs with whatever config the caller has.

## Verification

- All 18 tests pass.
- Mutation: with the `set-url` line removed, 3 tests fail (they push to or
  read from origin), so the repoint is load-bearing and each test still gets
  its own origin.

## Measured

Wall time of `python3 -m unittest test_research_archive` (`date +%s.%N`
around it), 4-core sandbox:

| | before | after |
|---|---|---|
| signing as the sandbox has it (3 runs / 5 runs) | 3.61, 3.62, 4.15 s | 1.58 to 1.94 s |
| signing off on both sides, the CI-like comparison (3 runs) | 2.32 to 2.43 s | (same as above) 1.58 to 1.94 s |
| successful `execve`s (strace) | 1,070 | 612 |

The honest CI-side figure is about 0.6 s per job (roughly 25%); the larger
local saving is mostly signing, which only agent sessions pay.

## Not changed, ranked for the next run

1. **`check_tag_balance.py` (4.8 s)**: still the largest item; a regex
   tokenizer must be shown equal to `html.parser` on every page.
2. **The node suites in `platform/distribution`** (hub/content 6.2 s,
   desktop 4.3 s, ios 3.6 s): not profiled yet.
3. **Other git-fixture tests** that set `ENV` from `os.environ` inherit a
   session's `commit.gpgsign` and gc settings the same way; a shared helper
   in `platform/ci` would let each opt out in one line.
   `grep -ln 'GIT_AUTHOR_NAME' platform/ci/test_*.py` lists the candidates.
