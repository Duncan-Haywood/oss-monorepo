# CI perf, 2026-11-09: concurrency_tax tests build their git fixture once

**Reading.** Wall time of `python3 -m pytest <file>` for every
`platform/ci/test_*.py`, one file at a time (4-core sandbox). The slowest by a
wide margin: `test_concurrency_tax.py`, 58.8 s; the next is 13.8 s.

**Profile.** `--durations`: 12 tests at about 5 s each. Each called
`make_repo`, which runs about 110 `git` subprocesses (a 51-commit PR plus
branches, one commit per process).

**Change.** `make_repo` builds the repository once per process and each test
gets a `shutil.copytree` copy (same technique as
`ci-perf-2026-11-04-git-fixture-template.md`). Real git repositories, nothing
mocked; copies are independent so mutating tests stay isolated.

**Measured.** 59.6 s (19 passed) before, 12.7 s (19 passed) after, same command.

**Not changed / next.** The remaining ~12 s is the one template build (about
5 s) and `test_own_commit_cap_is_inclusive`, which builds its own 51-commit
history. `test_check_conflict_markers.py` (13.8 s) is the next-largest file.
The pool-wide lever is still P063 (CODEOWNERS path, owner approval).
