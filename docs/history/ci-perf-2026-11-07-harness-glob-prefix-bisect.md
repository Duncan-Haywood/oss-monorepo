# agent-permission-harness: bisect the glob scan by literal prefix (2026-11-07)

**Reading.** `ci_profile.py --runs 300`: agent-permission-harness CI, 13 jobs,
unittest step 1.9 min (heaviest). Local `python3 -m unittest discover -p
'test_*.py'` in `portfolio/pipeline/probes/agent-permission-harness`: 15.4 s
wall. cProfile: 13.5 million `re.fullmatch` calls plus 44 739 generator
resumes in `_glob_over_index`, about 3.5 s of profile time, on top of the
per-closure index builds.

**Cause.** The earlier memo (`ci-perf-2026-11-07-harness-glob-memo.md`) made
each distinct wildcard spec scan the index once per index object, but each
closure builds a fresh index, so each test still scanned the whole list for
every distinct spec.

**Change.** Every match of a wildcard spec starts with the spec's literal text
before its first `*` (`_glob_regex` escapes all other characters). The memo now
also keeps a sorted copy of the index and runs the regex only over the
`bisect` slice that has that prefix. Results are still sorted.

**Verification.** `harness.py --json` output before and after: byte-identical
(`cmp`). 94 tests pass. Unittest wall time 15.4 s to 5.7 s, same machine,
single run each (`time`). The CLI run itself went 1.5 s to 1.1 s.

**Not changed (ranked).** 1. P063 (sparse checkout in `ventures-tests.yml`),
a control-plane edit that needs the owner. 2. `_file_index` still walks the
tree once per closure (0.3 s tottime, 18 calls); caching across closures would
hide tree changes the docstring promises to see.
