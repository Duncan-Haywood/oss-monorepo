# Perf: the storage-guard checker scans tokens, not characters (2026-11-14)

Perf track, prompt 0. The two perf backlog items (P063, P064) are owner-gated
workflow edits, so this run took a fresh reading of the runner pool.

## Reading

`python3 platform/ci/ci_profile.py --runs 200 --top 15` (2026-11-14, 186 jobs,
166.5 job-minutes): after the Pages builder tests and the ventures tests, the
heaviest named step was **"Storage-guard checker unit tests", 3.8 job-minutes
over 11 Portfolio validate jobs** (about 21 s a job). The checker itself
(`check_storage_guard.py`, run as the step before it) costs about as much
again but is not broken out because it shares a job.

This container (4 cores), `time`:

| | before | after |
|---|---|---|
| `python3 platform/ci/check_storage_guard.py` (checker + node contract) | 16.7 s | **3.6 to 3.7 s** (3 runs) |
| `check_tree(ventures)` alone | 16.1 s | **2.8 s** |
| `python3 -m unittest test_check_storage_guard` (41 tests) | 17.5 to 21.9 s | **5.0 to 5.1 s** (3 runs) |

`python3 -m cProfile -s tottime check_storage_guard.py`: 47.5 s under the
profiler, of which **`unguarded_reads` 23.9 s self / 39.6 s cumulative** over
9,421 calls, 134 million `str.startswith` calls (10.8 s) and 71 million `len`
calls. The function walked every character of every page script in Python,
testing `startswith("try")` and `startswith("localStorage")` at each one, to
track which braces are `try` blocks. It ran 9,421 times for 5,826 scripts
because `unguarded_typeof` and `inline_reads` each call it, and each re-ran
`_strip` on the same text.

## Change (`platform/ci/check_storage_guard.py`)

1. **Token scan.** One regex, `[{}]|(?<![\w$])try(?![\w$])|\blocalStorage\b`,
   visits only the characters the walk acts on. The four tokens cannot start
   inside one another, so left-to-right matches visit the same positions in
   the same order as the per-character loop. The `try` boundary is the old
   `_IDENT` test (`[\w$]` on either side); the read is the old `READ`. A
   running count of open `try` braces replaces `any(stack)`, and line numbers
   are counted incrementally instead of `count("\n", 0, i)` from the start.
2. **Memo.** `_strip` and the walk are `lru_cache(16)` keyed by the source
   text, so the second and third callers for one script reuse the result.
   `unguarded_reads` still returns a fresh list.
3. **Fast path.** A script whose source does not contain `localStorage` has
   no read, no `typeof localStorage` and no default parameter reading it
   (stripping only blanks text out, so it cannot create the word); the walk,
   `default_param_reads` and `bare_storage_args` return empty without
   stripping. Most of the 5,826 scripts take this path.

## Verification

- Old module (copied before the edit) against new, every script of every page
  under `ventures/` (5,826): `unguarded_reads`, `unguarded_typeof`,
  `inline_reads`, `default_param_reads` equal on every one; `check_tree` equal.
- 200,000 random strings over `{`, `}`, `try`, `tr`, `y`, `$`, `_`, quotes,
  `//`, `/*`, `*/`, backslash, `é`, `localStorage` with identifier characters
  glued on either side: `unguarded_reads` and `inline_reads` equal.
- `python3 -m unittest test_check_storage_guard test_check_form_clobbering`:
  51 tests OK (`check_form_clobbering.py` imports `_strip`).

## Not changed (ranked, for the next run)

1. **`usage_contract.mjs`** (node, under 1 s of the 3.6 s) imports 1,057
   counters; fine as is.
2. **`_DEFAULT_PARAM` and the `bare_storage_args` call regex**, the next
   items in the profile (1.1 s and 0.7 s before the fast path); after it they
   only run on scripts that mention `localStorage`.
3. **The unit tests** now spend most of their 5 s on the tests that call
   `main()` on the real tree (checker plus contract); sharing one run across
   them would save about 3 s more but changes test structure, so left alone.
