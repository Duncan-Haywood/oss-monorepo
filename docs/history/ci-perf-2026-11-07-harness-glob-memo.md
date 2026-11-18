# Perf: agent-permission-harness closure glob scan (2026-11-07)

**Reading.** `ci_profile.py --runs 200`: "agent-permission-harness CI" is 10
jobs, 5.7 job-minutes; its unittest step is the heaviest (1.4 m). The site-builder
and venture-test steps are bigger but have had many passes. P063 (ventures-tests
sparse checkout) is the largest open item but edits `.github/`, which is owner-gated.

**Profile.** `python3 -m cProfile -s cumulative -m unittest discover` in
`portfolio/pipeline/probes/agent-permission-harness`: 94 tests, 18.7 s.
`instruction_closure` is 12.9 s over 17 calls; 20.1 M `re.fullmatch` calls
come from `_expand_prompt_path`, which regex-scanned the whole file index for
every wildcard spec, though the same specs recur across documents.

**Change.** `_glob_over_index` memoises wildcard expansions per index object
(same pattern as `_by_basename`; the memo holds the index so a reused `id()` is safe).

**Verification.** 94/94 tests pass, including the byte-identical report test
and `test_committed_results_file_is_current`. Wall time 18.0 s -> 8.3 s (local,
single runs, same machine).

**Not changed, ranked.** (1) P063 checkout sparse-ing (owner-gated). (2) The
class `setUpClass` in test_harness.py (4.9 s, two subprocesses). (3) Portfolio
Pages "Test the site builder", still the largest consumer.
