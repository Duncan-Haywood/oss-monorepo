# CI perf 2026-11-26: 21 tree checks ran twice in every ventures-tests job

Perf track. All three open perf backlog items (P063, P064, P086) are
`"owner": "owner"`, so this run took a fresh pool reading (step 2 of the perf
prompt).

## Reading

`python3 platform/ci/ci_profile.py --runs 600 --top 25`, 2026-11-25T23:08Z to
2026-11-26T00:07Z: 765 jobs, 1279.3 job-minutes. The biggest consumers I could
change:

| workflow | job-min | note |
|---|---:|---|
| CodeQL | 591.7 | `priv-codeql.yml`, owner-reviewed; analyze step 750 s median for JS |
| Portfolio Pages | 180.3 | many passes already (`pages-test-perf-*`) |
| Security gate, CI policy | 210.9 | `priv-*` workflows, owner-reviewed |
| ventures tests | 90.5 | "node --test in each touched venture" 52.9 min |

A ventures-tests job log (job 139582466073, a PR touching open-house-plans and
wall-framing-takeoff) showed where that step goes: the two venture suites were
done at 23:33:32 (42 s), and the step printed "2 suites run" at 23:35:44. The
131 s between is `unwired_checks.run_everything()`, the 299 tree checks and
suites no workflow names, which every ventures-tests job runs whatever it
touches. The 2026-11-20 pass (`ci-perf-2026-11-20-unwired-orphans-and-fetch.md`)
took the same call from about 157 s to about 40 s; the set has grown since.

## Profile

This container, 4 cores, the default 6 workers, Python 3.12 (CI's version; the
bare `python3` here is 3.11, and some checks take a different path under it, so
3.12 numbers are the ones that count):

- pool wall **64.1 s**, 377.6 s summed over items;
- the same 299 items one at a time: **243.4 s**.

243 s over 4 cores is a 61 s floor, so the pool was already close to it; only
less total work could move the wall. No item was large (the top was
`check_py311_syntax.py` at 8.6 s); 125 items took under 0.3 s.

The pairs stood out. 77 `check_X.py` scripts in the pool have a
`test_check_X.py` suite in the pool too, and in about 40 of them the suite takes
as long as the check, because one of its tests runs the check on the whole
tree:

| check | check alone | its suite | the tree test |
|---|---:|---:|---|
| check_parse_sign.py | 3.1 s | 3.2 s | `test_the_tree_is_clean`: the script, no arguments, exit 0 |
| check_test_spawn_cwd.py | 2.6 s | 2.4 s | `test_repository_is_clean`: `main([]) == 0` |
| check_trailing_flag_value.py | 2.2 s | 2.4 s | `test_repository_is_green`: `main([]) == 0` |
| check_se_tax_floor.py | 2.1 s | 2.2 s | `test_tree_is_clean`: `main([]) == 0` |

So the pool scanned the same tree twice for those checks.

## Change

`platform/ci/unwired_checks.py` gains `COVERED_BY_TREE_TEST`: 21 checks, each
mapped to the test in its own suite that asserts exactly what running the check
asserts (`main([]) == 0`; `main() == 0` where `main` takes no argument or only a
defaulted root; or the script run with no arguments and exit 0). The check
waits for that suite:

- suite green: the check is reported `ok` with "covered by test_check_X.py
  (... runs this check on the tree), so not run a second time";
- suite red, timed out or skipped (no pytest, a missing package): the check
  runs after the pool, as before. A skipped suite never hides a check, so the
  CI runner, which lacks pytest, still runs `check_agent_text_on_pages.py`
  itself.

The result list has the same 299 names. `--checks-only` runs every check, since
no suite runs then. A check left out of the map just runs twice, as before.

Each entry was picked with these rules, then checked:

- the named test is the only test in the suite that runs the check on the tree,
  and it asserts exit 0 on the default root (21 found by AST; three more matched
  but were left out because their suites assign to the check module's
  attributes, which could leave the tree test checking something else:
  `check_js_syntax.py`, `check_llms_txt_links.py`, `check_site_fresh.py`);
- the check's `__main__` is `sys.exit(main())` or `sys.exit(main(sys.argv[1:]))`;
- the check gives the same exit code and the same output when run from
  `platform/ci` (where its suite runs) and from the root (where the pool runs
  it): all 21 were identical.

`test_unwired_checks.py` pins it: every entry's test still exists and still
holds its tree assertion (a `main()` form only where `main` takes no argument
list), a green suite covers its check, and a red, skipped or timed-out suite
makes the check run itself.

Not changed: no check, suite or assertion is dropped or edited. The tree test
still runs in every context it ran in before; only the duplicate standalone run
is skipped, and only when that test has just passed.

## Verification

- `python3.12 -m unittest test_unwired_checks` and the same under 3.11: 36
  tests OK (4 new).
- Seeded fault: a staged `ventures/zz-seed/a.test.mjs` with
  `execFileSync(process.execPath, ["cli.mjs"], {})`, run through
  `run_everything()` with the spawn-cwd and parse-sign pairs: the suite went
  red, `check_test_spawn_cwd.py` then ran itself and went red with its own
  message and reproduce line; the green parse-sign pair reported as covered.
  The file was removed afterwards.
- Full `run_everything()` before and after: the same 299 names, the same exit
  code for each, 0 red.

## Numbers (4-core container, Python 3.12, `run_everything()` in-process, wall clock)

| | run 1 | run 2 |
|---|---:|---:|
| before | 64.4 s | 65.4 s |
| after | 58.2 s | 60.2 s |

About 5.7 s (9%) off each run here, 21 tree scans (about 23 s of serial work)
fewer. The CI runner took about twice as long as this container for the same
call (131 s against 64 s), so expect something like 10 s per ventures-tests job
there, at about 37 such jobs an hour.

## Not changed, ranked for the next run

1. **`check_py311_syntax.py`, 8.6 s, the biggest single item.** Under 3.12 it
   tokenizes all 10,886 tracked `.py` files: 9.1 M tokens, of which 5.7 s is
   `TokenInfo._make` and the generator wrapper in `tokenize.py`. Reading
   `_tokenize.TokenizerIter` directly would skip that wrapper but uses a
   private API; a sound prefilter (only files with an f-string holding a
   quote, backslash, `#` or line break inside braces) needs care. Probably
   halves it.
2. **The HTML parses repeated across checks.** `check_insecure_refs.py` and
   `check_tag_balance.py` each run `HTMLParser` over the same 4,512 pages
   (about 10 s each under cProfile). A prefilter for insecure-refs is possible:
   after dropping `xmlns="http://..."` values only 48 pages contain `http://`.
   But that check was hardened by the 2026-11-11 red team, so a skip rule needs
   an argument that it can't hide a loader. I wrote one and did not ship it.
3. **More pairs.** About 20 more suites take about as long as their check but
   phrase the tree test differently (`check_tree(...) == []`, `main(["x"])`,
   a `KNOWN` diff such as `check_main_guard_last.py`). Each needs the same
   equivalence check before it goes in the map.
4. **CodeQL JavaScript analysis, 283.8 job-min an hour, 750 s median.** That's
   the largest consumer in the pool, but `priv-codeql.yml` is owner-reviewed and
   narrowing what a security scan covers is not a perf call to make alone. The
   JS and TS under analysis is about 134 MB; generated data modules
   (`ventures/einvoice-preflight/*-data.mjs`, `local-site-studio`'s
   `process/archive/*.ts`) and one vendored library
   (`ventures/einvoice-preflight/plain/fontoxpath.esm.js`, 325 KB, fits the
   config's own "vendored third-party code is left out" rule) are candidates
   for `paths-ignore`, to take to the owner with a measurement.
