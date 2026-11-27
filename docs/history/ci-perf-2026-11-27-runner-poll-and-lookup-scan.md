# CI perf, 2026-11-27: the venture runner's poll tick and the inherited-key scan

Perf track run (`prompts/perf/prompt-0.md`). Target: the `ventures tests`
workflow (`ventures-tests.yml`), which runs on every venture pull request.

## Reading

`python3 platform/ci/ci_profile.py --runs 600 --steps 25` (715 jobs,
2026-11-27 00:30 to 01:18 UTC): `ventures tests / changed-ventures` ran 32
jobs in that window; its "Runner unit tests" step
(`python3 -m unittest test_run_venture_tests`) had a **15 s median** and
6.6 job-minutes, the second-heaviest non-`priv-*` step after the suites
themselves. The heavier items (CodeQL, Security gate, CI policy, the Pages
workflows) are `priv-*` and owner-gated, and the Pages test suite,
`make-gallery.mjs` and `Portfolio validate` have had several passes each
(`pages-test-perf-*`, `ci-perf-2026-11-16-shed-gallery-parallel-once.md`,
`ci-perf-2026-11-25-validate-sparse.md`).

## Profile

`python3 -m cProfile -s cumtime -m unittest test_run_venture_tests`, 4-core
cloud container:

- **11.6 of 20.4 s in `time.sleep`**: `run_one()` polled its child with
  `while p.poll() is None: ... time.sleep(0.2)`, so every suite waited up to
  0.2 s after it exited. Tests timed one by one sat on exact multiples of 0.2
  s (0.21, 0.41, 0.81 s).
- **4.8 s in `inherited_keys.scan_slugs`** over two calls (the all-zero
  `--since` test lints all 1,445 ventures twice). Of one 1.46 s pass,
  `scan_text` was 0.96 s: `LOOKUP` (`\b([A-Z][A-Z0-9_]+)\[...`) took 0.58 s
  over the 31.7 MB of files that declare a map, and `MAP_DECL` (anchored
  `^` under `re.M`) 0.35 s over all 57.7 MB. Python's `re` skips quickly
  only to a literal prefix; a pattern starting with `\b` or `^` is tried at
  every position. A first attempt, one alternation regex of the file's own
  map names, gained nothing (0.94 s) for that reason.

## Change

1. `run_venture_tests.run_one`: `p.wait(timeout=0.2)` (catching
   `TimeoutExpired`) in place of `time.sleep(0.2)`. The deadline and
   fail-quiet checks still run every 0.2 s; the loop now leaves as soon as
   the child exits.
2. `inherited_keys.scan_text`: the same two patterns, searched from a
   literal. `_map_names` matches `const\s+NAME\s*=...{` and checks the line
   start (and an optional `export\s+`) by hand; `_lookups` finds each of the
   file's map names with `str.find(NAME + "[")`, checks the word boundary
   and matches the `ident.key]` tail. `LOOKUP`'s other matches were always
   discarded, and no two matches can overlap (a lookup's brackets hold no
   `[`), so the results are the same. `MAP_DECL` and `LOOKUP` stay as the
   definition.

## Verification

Same answers:

- `scan_text` old vs new on every engine file of every venture (5,186
  files): 0 differ; `_map_names` vs `set(MAP_DECL.findall())`: 0 differ.
- `python3 platform/ci/inherited_keys.py --list` from main's copy and this
  one: byte-identical (`cmp`), 413 lines. `inherited_keys.py`: "0 new
  unguarded lookup(s) in 1445 venture(s)", exit 0.
- New test `test_the_fast_search_finds_what_the_plain_patterns_find` pins
  both against the plain patterns on edge strings (prefixes `X`, `$`, `_`,
  `1`, `é`; indented, `fooconst`, `exportconst`, `xexport`, `export\n`,
  tab and `\r\n` declarations; adjacent lookups) and 40 real files.
  Mutation check: removing the word-boundary test, the line-start test after
  `export`, or the "needs whitespace after export" test each fails it (the
  last only after the `exportconst` case was added, which this run did).
- `python3 -m unittest test_run_venture_tests`: 50 pass;
  `test_inherited_keys`: 13 pass.

Times, bash `time`, same container, warm:

| | before (main) | after |
|---|---:|---:|
| `unittest test_run_venture_tests` (3 runs) | 17.15 / 17.03 / 17.06 s | 12.51 / 12.61 / 12.63 s |
| `unittest test_inherited_keys` (2 runs) | 3.05 / 3.15 s (12 tests) | 1.54 / 1.60 s (13 tests) |
| `inherited_keys.py --list` (2 runs) | 1.61 / 1.57 s | 0.72 / 0.74 s |
| `scan_text` over 5,186 files | 0.96 s | 0.18 s |

On Actions, `ON_ACTIONS` skips the local page checks (about 2.7 s of the
remaining local time), so the CI step should fall from about 15 s to about
10 s per `ventures tests` job; the next `ci_profile.py --steps` reading will
say. Every real venture run also gains up to 0.2 s per suite step, and a
full or all-zero-`--since` run about 0.9 s of lint.

## Not changed, ranked for the next run

1. **`test_an_all_zero_base_means_every_venture` (4.6 s locally)**: it runs
   `main` over all 1,445 ventures twice with `has_tests` mocked, so it pays
   for `skip_note` (1.4 s: `test_commands` called 105k times through
   `python_run_elsewhere`), the inherited-key lint and, off Actions, the
   page checks. Mocking those would narrow what the test covers; caching
   `test_commands` per slug inside one `main` is the clean option.
2. **`engine_files`** walks every file with `rglob("*")` and filters after
   (0.35 s warm per full pass); an `os.walk` that prunes dot, build,
   `node_modules` and `eval` directories would keep the same list.
3. The two hung-suite tests (2.0 s and 1.9 s) and the fail-fast one (1.2 s)
   wait on deliberate timeouts; leave them.
4. CodeQL (429 job-minutes in the window), Security gate and CI policy
   checkouts remain the pool's largest consumers and are `priv-*`.
