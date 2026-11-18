# Perf: stranded-branch-finder reads every blob id in one batch (2026-11-18)

**Where.** `ventures/stranded-branch-finder/stranded.py`, `landed_by_content`,
called once per candidate branch by `--sweep`. Picked from
`run_venture_tests.py --times 40`: the slowest suite with no perf write-up
(5.6 s). Its profile (`python3 -m cProfile`, 37 tests) was 722 git processes,
344 of them from the tool itself, so the cost was in the product, not only
the tests.

**Profile.** `landed_by_content` ran one `git diff --name-status` and then a
`git rev-parse <ref>:<path>` per changed path (two for a modified path). A
squash-landed branch touching 30 files cost 31 processes; a sweep over a repo
where many branches landed by squash spent nearly all its time spawning git.

**Change.** The blob ids now come from one `git cat-file
--batch-check=%(objectname)` fed every `<ref>:<path>` name on stdin. A name
it cannot resolve answers `<name> missing`, which maps to the same `""` that
`rev-parse -q --verify` gave. If cat-file fails or answers a different
number of lines, the branch is "not provably landed", the conservative
default the function already had.

**Measured.** Bench repo built by a script (bare origin + clone; 40 branches
each adding 30 files and modifying one, squash-landed on main; 10 unlanded
branches), warm probe, `sweep()` wall time and `subprocess.run` count,
3 runs each, 4-core sandbox:

| | wall | git processes | branches found |
|---|---:|---:|---|
| before | 3.17 / 3.23 / 3.47 s | 1348 | w41..w50 |
| after | 0.38 / 0.40 / 0.35 s | 108 | w41..w50 |

**Same answers.** Old and new `landed_by_content` compared on all 54 refs of
the bench (plus a modified-to-other-bytes branch, a deletion and a path with
a space): 0 differ. New test `test_every_changed_path_is_read_from_one_batch`
(three paths, one with a space, one modified to different bytes) passes on
both the old and the new code; suite 38 passed;
`run_venture_tests.py stranded-branch-finder` ok.

**Suite time** barely moves (5.3 s to about the same): the tests' own git
calls (`commit`, `push`, `squash_merge`) dominate, and batching them would
change what is tested.

**Not changed, ranked.**
1. `refresh_probe` runs three `git config` writes every call; skipping them
   when already set saves 3 processes a run (about 15 ms), not worth the
   branching.
2. `check_branch` is ~10 processes, each needed for a different answer.
3. The test fixture already copies a template repo
   (`ci-perf-2026-11-04-git-fixture-template.md`).
