# CI perf, 2026-11-20: four tree scans whose regex `re` could not skip ahead in

Perf track, `perf/0`. Both open perf backlog items (P063, P064) touch
workflow files and wait for the owner, so this run took a fresh reading of
the unwired-checks pool (`platform/ci/unwired_checks.py`, `run_everything()`),
which every ventures-tests job runs whatever venture it tests.

## Reading

Each of the pool's 267 items timed one at a time (a scratch wrapper around
`unwired_checks.run_mixed(work, jobs=1)` that prints each item's wall time),
4-core container. The pool total was 368 s of serial work. The top items
outside those already worked on today:

| item | pooled reading | alone, `time`, warm |
|---|---|---|
| `test_check_hidden_unicode.py` | 20.6 s | 5.9 s |
| `check_third_party.py` | 11.5 s | 11.6 s |
| `check_irs_table_figures.py` | 6.9 s | 6.7 s |
| `test_check_form_clobbering.py` | 6.8 s | 5.1 s |
| `check_hidden_unicode.py` | 5.9 s | 5.1 s |
| `check_form_clobbering.py` | (under 3 s) | 2.6 s |

The pooled figures for the hidden-Unicode test ran next to this run's own
profiling scripts, so the "alone" column is the one to compare against.
(`check_posts.py` read 16.5 s in the pool but 0.13 s alone: it was waiting on
the same contention, not slow.)

## Profiles and causes

All four are one cause in different clothes: a scan over the whole tree
whose cost sat in a regex Python's `re` has to try at every character.
`re` only jumps ahead (in C) when a pattern starts with a literal or a
character class; a pattern that starts with a lookbehind, or with a
case-insensitive alternation, gets no such prefix.

1. **`check_hidden_unicode.py`** (`cProfile`): `findings_in_text` 3.5 s own
   time of 6.1 s. The files that are not pure ASCII hold 225 M characters
   (13,152 files: em dashes, curly quotes, accents), and `PATTERN.finditer`
   walked every one of them; 46 files have a match at all.
2. **`check_third_party.py`**: `scan_file` 20.3 s cumulative under the
   profiler, 32.1 M `re.Pattern.search` calls: nine searches (copyright,
   SPDX, eight licence banners) on each of 3.57 M lines of code.
3. **`check_irs_table_figures.py`**: `numbers()` 5.9 s own time of 6.6 s.
   `NUM` starts with `(?<![\w.$])`, so it is tried at all 148 M characters
   of shipped venture files.
4. **`check_form_clobbering.py`**: `check_tree` read every page's sibling
   `.js`/`.mjs` files (about 30,000 reads) before knowing whether any control
   on the page hides a form method; almost none do.

## Change

1. `check_hidden_unicode.py`: `UTF8_PATTERN`, the same characters as their
   UTF-8 bytes, searched over the file's bytes with the ASCII bytes deleted
   (`data.translate(None, bytes(range(128)))`). Every byte of a multi-byte
   UTF-8 character is >= 0x80, so deleting ASCII leaves each character's
   bytes whole and in order; on valid UTF-8 a byte match is exactly a
   `PATTERN` match. `read_text(..., candidates_only=True)` (used by `scan`)
   returns None when there is none, and only those files reach the str path.
   A non-UTF-8 file was skipped before and is skipped now.
2. `check_third_party.py`: one search of the whole text per pattern says
   which patterns can match any line; the per-line loop runs only those. None
   of the patterns can span a line break (no `\s`, no anchors), so a line's
   match is a match in the text and the signals are the same. Two necessary
   conditions make the whole-text searches cheap too: `COPYRIGHT` (2.6 s over
   the 190 MB of code) is tried only when `©` or the word `copyright`
   (1.1 s) is in the file, and the CC non-commercial banner only when one of
   its two literals is (`in`). The stale-glob loop calls fnmatch's compiled
   matcher directly (`re.compile(fnmatch.translate(g)).match`, which is what
   `fnmatchcase` does after a cache lookup).
3. `check_irs_table_figures.py`: `NUM_FAST` starts with the class `[\d$]` and
   asserts NUM's lookbehind on the character before it, `(?<![\w.$].)`; a `$`
   is followed by NUM's number, a digit starts it. Its match without the `$`
   is NUM's group 1.
4. `check_form_clobbering.py`: `clobbered_calls` takes the page's modules as
   a string or a function, and calls the function only once a control is
   known to hide a method.

## Verification

- `check_hidden_unicode.py --list`, `main`'s code against this branch's:
  `cmp` identical (144 findings in 33 files).
- `check_third_party.py --signals`: identical (45 lines, 44 signals).
- `check_irs_table_figures.py --json`: identical at the default `--min-hits`
  (0 findings) and at `--min-hits 1` (2 findings). Over all 10,620 shipped
  files, `NUM_FAST` and `NUM` give the same list of numbers, and 200,000
  random strings over `0-9 $ , _ . a - space newline` agreed.
- `check_form_clobbering.py`: 0 findings both ways; its suite passes.
- New tests: `test_utf8_pattern_matches_the_same_characters` (every code
  point, with and without the ASCII bytes deleted) and
  `test_prefilter_skips_only_files_without_a_hit`;
  `test_whole_file_prefilters_keep_every_line_signal` (passes on `main`'s
  code too, so it pins the old behaviour);
  `test_fast_number_pattern_matches_num` (edge cases and 20,000 seeded random
  strings); `test_modules_are_read_only_when_a_control_hides_a_method`.
  No test or assertion was removed or loosened.

## After (same box, same session, `time`, one run each, warm cache)

| item | before | after |
|---|---|---|
| `check_hidden_unicode.py` | 5.1 s | 1.6 s |
| `test_check_hidden_unicode.py` (21 -> 23 tests) | 5.9 s | 2.6 s |
| `check_third_party.py` | 11.6 s | 4.3 s |
| `test_check_third_party.py` (23 -> 24 tests) | TP_TEST_BEFORE | TP_TEST_AFTER |
| `check_irs_table_figures.py` | 6.7 / 6.9 s | 2.5 s |
| `check_form_clobbering.py` | 2.6 s | 0.8 s |
| `test_check_form_clobbering.py` (15 -> 16 tests) | 5.1 s | 2.0 s |

POOL_AFTER

One-off wall times on a shared 4-core box, not medians.

## Not changed, ranked for the next run

1. **`test_csv_thousands_split.py`** (9.0 s alone, 3 tests): now the
   longest Python item in the pool after these.
2. **`content.test.mjs`** (`platform/distribution/hub`, 7.4 s pooled) and
   `test_accounting_negatives.mjs` (5.6 s): the longest node items.
3. **`check_insecure_refs.py`** (5.2 s pooled): not profiled yet. The same
   question applies to every tree scan: does its first regex start with a
   literal or a class? `re.compile(p)` then `re._compiler._compile_info` is
   the place to look; a leading lookbehind, `(?i)` alternation or `^` with
   `re.M` all mean a try at every character.
4. **`Feeder.check` in open-tennis-robots** (7 to 16 s cold per process):
   profiled here, 130 cold `_hose_curve_range_3d` grid searches at 41 ms
   each; the lru caches already serve every repeat, so the lever is the grid
   search itself, which has a bit-identical constraint.
5. P063 and P064 remain owner-gated (workflow files).
