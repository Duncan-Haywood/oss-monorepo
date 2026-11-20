# CI perf 2026-11-20: literal prefilters in five tree checks and their tests

Perf track, prompt 0. Both open perf backlog items (P063, P064) touch workflow
files and wait for the owner, so this run took item 1 of the "not changed"
list in `ci-perf-2026-11-20-unwired-orphans-and-fetch.md`: the paired checks
whose `check_X.py` and `test_check_X.py` each cost several seconds. Both run
inside `unwired_checks.run_everything()`, which every ventures-tests job pays
for whatever venture it tests.

## Reading

Each script alone, this 4-core container, two runs, wall seconds (`date`
before and after `python3 platform/ci/check_X.py`, and
`python3 -m pytest -q platform/ci/test_check_X.py`):

| check | check before | check after | test before | test after |
|---|---|---|---|---|
| plan_limits_2026 | 6.48 / 6.43 | 1.28 / 1.30 | 6.84 | 1.96 |
| agent_text_on_pages | 6.68 / 7.15 | 1.22 / 1.17 | 6.10 | 1.24 |
| open_range_messages | 5.01 / 4.36 | 0.56 / 0.49 | 5.40 | 0.82 |
| dst_day_step | 4.44 / 4.01 | 1.28 / 1.13 | 5.47 | 1.52 |
| csv_formula_guard | 4.31 / 4.07 | 2.72 / 2.62 | 3.80 | 3.06 |
| **sum** | **26.5** | **6.9** | **27.6** | **8.6** |

About 39 s of serial work less in each `run_everything()` call (54 s to 15.5 s
for these ten items). The tests still scan the real tree; they are faster
because the scan is.

## Profile

`python3 -m cProfile -s tottime platform/ci/check_X.py`: in every one the time
was a single regex run over every file or every line of the 87 MB of venture
HTML or 139 MB of venture code.

- **plan_limits_2026**: `re.split` on 1.9 M lines (2.8 s) and 2.4 M searches
  (2.5 s), though a segment is only scanned further if it names 2026.
- **agent_text_on_pages**: `PHRASE.finditer` over each page, 6.7 s. The pattern
  starts with an alternation and is case-insensitive, so sre tries it at every
  position.
- **open_range_messages**: `findall` 207 k times (3.8 s): one
  `\b(\w+)\s*=\s*-?Infinity` per file and one `between ${...}` per line.
- **dst_day_step**: `DAY_CONST.search` per file, 2.9 s. Its last alternative
  starts with `\b`, so the joined pattern has no literal or charset prefix and
  sre tries every position. Split into its alternatives, the four numeric ones
  start with literals and take 0.11 s each.
- **csv_formula_guard**: 1.9 M per-line regex calls in `scan_shape` and
  `scan_weak`.

## Change

Each check now tests a literal its pattern cannot match without, before the
regex:

- `check_plan_limits_2026.py`: skip a file, then a line, without `2026` before
  splitting it into segments (`segments(text, need="2026")`).
- `check_agent_text_on_pages.py`: every alternative holds `session` or
  `egress`. A plain `in` test on `text.lower()` decides, unless the page holds
  one of the four non-ASCII characters that `re.I` folds onto an ASCII letter
  (U+0130, U+0131, U+017F long s, U+212A Kelvin; found by testing every code
  point against each letter), in which case the regex runs as before.
- `check_open_range_messages.py`: skip a file without both `Infinity` and
  `between ${`, and a line without `between ${`.
- `check_dst_day_step.py`: `DAY_CONST` is now built from `_DAY_NUMBERS` and
  `_DAY_NAMES`, and the whole-file test is `has_day_const()`, which tries the
  numeric alternatives one at a time and the names only when the file holds
  `DAY`, `msPerDay` or `dayMs`. `_arith_hit` still uses `DAY_CONST` on a line,
  since it needs the leftmost match.
- `check_csv_formula_guard.py`: both `EXEMPTION` and `GUARD_TEST` start with
  the literal `/^[=`, and `guard_shape` reports only through `GUARD_TEST`, so
  `scan_shape` and `scan_weak` skip files and lines without it.

## Verification (same answers)

- Old and new scripts (old copies placed at the same depth so `ROOT` matched)
  over the whole tree: output byte-identical (`cmp`) for all five. The tree is
  clean, so this alone proves little.
- A seeded corpus: 3,000 random venture files, each also with 3 and 10 hit
  snippets inserted at random positions, plus snippet-only texts (12,000 texts
  a check, 3,400 to 8,900 of them with hits), including `ſ`, `İ` and the Kelvin
  sign inside "session"/"egress". Old and new `scan_text` / `agent_text` /
  `scan` gave equal results on every text. For the CSV check, 220,000 lines
  (20,000 seeded) showed no finding on a line without `/^[=`, and `scan`,
  `scan_weak` and `scan_shape` on a temp root of 400 seeded files gave the same
  232 and 679 entries. 0 differences in all.
- All five test files pass (37 tests), as does
  `test_checks_refuse_empty_root.py`.

## Not changed, ranked for the next run

1. **csv_formula_guard** is now the slowest of the five (2.6 s): it reads the
   tree three times (`scan`, `scan_weak`, `scan_shape`, the last over five
   globs). One walk and one read per file would cut most of what is left.
2. **The remaining walk cost** in all five: `sorted(root.rglob("*"))` builds
   and sorts 270 k `Path`s (0.4 to 0.7 s each). An `os.walk` with directory
   pruning of `node_modules` would skip most of that.
3. The rest of the "not changed" list in
   `ci-perf-2026-11-20-unwired-orphans-and-fetch.md` (the research homepage
   publish test, oversubscription, longest-first order) still stands.
