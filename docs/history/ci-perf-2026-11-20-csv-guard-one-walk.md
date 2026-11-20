# CSV formula guard: one walk, split exporter regex (2026-11-20)

Perf track. P063 and P064 are still owner-gated (workflow files), so this run
took item 1 of the "not changed" list in
`ci-perf-2026-11-20-paired-check-prefilters.md`: `check_csv_formula_guard.py`,
the slowest of the five paired checks after that run, paid inside
`unwired_checks.run_everything()` by every ventures-tests job.

## Reading

This 4-core container, warm page cache, bash `time`:

| | before | after |
|---|---|---|
| `python3 platform/ci/check_csv_formula_guard.py` | 2.83 / 3.32 s | 0.85 / 0.89 / 0.84 s |
| `python3 -m unittest test_check_csv_formula_guard` (from `platform/ci`) | 2.60 s (14 tests) | 0.90 s (16 tests) |

`python3 -m cProfile -s tottime` of the check before: 4.28 s under the
profiler, of which `re.Pattern.search` 1.43 s own time over 7,229 calls
(almost all `EXPORTER` on every `.mjs`), and about 1.3 s in pathlib (`rglob`
`_select_from`, `_iterate_directories`, `relative_to`, `parse_parts`): three
scans, eleven `rglob` calls, 26,515 file reads. After: 1.14 s under the
profiler, 2,437 regex searches (0.37 s), 18,447 reads, one `os.walk`.

## Cause

1. `EXPORTER` is one alternation whose branches start with `function`, `\b`
   and `export`. Python's `re` only skips ahead with a literal prefix, so it
   tried all three branches at every character of every `.mjs` under
   `ventures/`.
2. `scan`, `scan_weak` and `scan_shape` each ran `rglob` per pattern (1 + 3 + 5
   walks of the 270 k-entry tree, building and `relative_to`-ing a `Path` for
   every match) and read the `.mjs`/`.js`/`.html` files two or three times.

## Change

- `is_exporter` tests the branches separately, each behind a substring it must
  contain (`"Csv"`, then `"toCsv"` or `"export"`); the `export` branch now starts
  with a literal and gets the fast prefix scan. `EXPORTER` stays as the
  reference.
- `_sources(root, exts)`: one `os.walk` that prunes `SKIP_PARTS` directories
  and reads each file once. `scan_all` computes the three result lists in one
  pass; `main` uses it. `scan`, `scan_weak`, `scan_shape` keep their
  signatures and per-scan skip rules (`scan` skips `*.test.mjs`, the other two
  any name with `.test.`).

## Verification

- All three scans on the real tree dumped to JSON before and after: `cmp`
  identical (355 unguarded exporters, 0 weak, 0 shape).
- `is_exporter` against `EXPORTER.search` on every one of the 18,446
  `.mjs/.js/.html/.ts/.tsx` files under `ventures/`: 0 mismatches.
- New tests: `test_split_exporter_matches_the_alternation` (20 edge cases,
  including `xtoCsv =`, `parseCsv`, `Csv(`, newlines inside `export function`)
  and `test_scan_all_matches_the_three_scans` (a fixture with `node_modules`,
  `dist`, `.test.mjs`, `.test.helper.mjs`, `.ts`, `.tsx`, `.html`, nested
  dirs; asserts `scan_all == (scan, scan_weak, scan_shape)` and the expected
  entries). Like `rglob`, `os.walk` does not follow symlinked directories
  (checked against Python 3.11's `_RecursiveWildcardSelector`); `ventures/`
  has no symlinks today.

## Not changed, ranked for the next run

1. **The other four paired checks** still walk with `sorted(root.rglob("*"))`
   (0.4 to 0.7 s each, item 2 of the previous list); the `_sources` shape here
   ports directly.
2. **What is left here** is 0.37 s of regex on the files that contain `Csv`,
   mostly `GUARD` (case-insensitive alternation); a lowercase-literal prefilter
   (`"/^[="`, `"^[=@]"`, `"injection"`) would gate it the same way.
3. P063 and P064 remain owner-gated.
