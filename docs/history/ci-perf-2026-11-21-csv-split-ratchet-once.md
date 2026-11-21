# CI perf 2026-11-21: the CSV split ratchet scans the tree once, not 31 times

Perf track, prompt 0. Both open perf backlog items (P063, P064) touch
workflow files and wait for the owner, so this run took a fresh reading of
`unwired_checks.run_everything()`, the pool of 271 checks and suites every
ventures-tests job runs after its venture suites.

## Reading

Every item of the pool timed on its own, one at a time, through the pool's own
runners (a scratch script that builds the same `work` list as
`run_everything` and times each `runner(*args)`), on this 4-core container:

- 271 items, **264.2 s** of serial work, all green.
- Two at a time the same items summed 315.5 s, and some items read far
  slower than they are: `check_posts.py` read 15.8 s in the pool and is
  0.12 s alone, `test_check_hidden_unicode.py` 16.7 s against 2.0 s alone.
  Pool timings rank contention as much as cost; take a ranking from a
  serial run.

Serial top ten (seconds): `test_csv_thousands_split.py` 7.4,
`platform/distribution/hub/content.test.mjs` 6.2, `check_third_party.py` 5.1,
`check_tag_balance.py` 4.8, `portfolio/ledger/test_no_duplicate_yaml_keys.py`
4.6, `test_research_archive.py` 4.4, `platform/distribution/desktop.test.mjs`
4.3, `portfolio/pipeline/test_corpus_dupes.py` 4.3, `check_insecure_refs.py`
4.2, `check_link_names.py` 4.2.

## Profile and cause

`python3 -m cProfile -s cumulative -m unittest test_csv_thousands_split`:
12.3 s under the profiler, 31 calls to `flagged()`, each a sorted glob of
`ventures/*/*.mjs` and a read of every file. `test_known_list_only_shrinks`
wrote `sorted(f for f in KNOWN if f not in flagged())`, so the scan ran once
per KNOWN entry (29), plus once in each of the other two tests.

## Change

`flagged()` is wrapped in `functools.cache` and returns a `frozenset`, so a
caller cannot mutate the cached set. One scan per process. Nothing else
changed: same globs, same regexes, same KNOWN list, same three tests.

## Verification

- `python3 -m unittest test_csv_thousands_split`: 7.4 s before (serial
  pool reading; 12.3 s under cProfile), **0.34 s** after (bash `time`),
  3 tests OK.
- Fault seeding, both directions: a new `ventures/zz-perf-probe/calc.mjs`
  with `.split(",")` and `replace(/,/g` fails
  `test_no_new_comma_split_parsers` naming it; appending
  `function splitCsvLine(){}` to `ventures/slot-keeper/slot.mjs` (a KNOWN
  entry) fails `test_known_list_only_shrinks` naming it. Both files restored.
- A grep of `platform/ci`, `portfolio` and `prompts` for the same shape (a
  scanning function called inside a filter over a list) found no other case.

Pool effect: about 7 s less serial work in each ventures-tests job (264 to
257 s); the pool runs six at a time, so its wall drops by roughly a sixth of
that plus whatever this item held up at the tail.

## Not changed, ranked for the next run

1. **`check_tag_balance.py` (4.8 s)** is real work: `html.parser` over
   8,216 pages, 12.7 s under cProfile in `goahead`/`parse_starttag`. A
   regex tag tokenizer would be faster but must be shown equal on every
   page, including comments, `<script>` bodies and CDATA.
2. **`test_research_archive.py` (4.4 s)** spends 3.3 s waiting on ~300 git
   subprocesses that build fixture repos; the git fixture template from
   `ci-perf-2026-11-04-git-fixture-template.md` may apply.
3. **The node suites in `platform/distribution`** (hub/content 6.2 s,
   desktop 4.3 s, ios 3.6 s) have not been profiled.
4. The contention reading above: on a 4-core runner the pool's six workers
   oversubscribe; the `--jobs` question in
   `ci-perf-2026-11-20-unwired-orphans-and-fetch.md` still stands.
