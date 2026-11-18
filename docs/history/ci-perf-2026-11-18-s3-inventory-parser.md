# Perf, 2026-11-18: s3-storage-class-savings reads a million-row inventory 4x faster

Perf track, `perf/0`. Both open perf backlog items (P063, P064) touch `.github/`
(owner-gated). The previous run's "Not changed" list
(`ci-perf-2026-11-18-lineup-cost-scratch.md`, item 3) named two unprofiled
mid-tier suites: garmin-world-traveler-watchface `citydata.test.mjs` and
s3-storage-class-savings `engine.test.mjs`. This run took the second, because its
slow path is the same one a visitor's browser runs on a real S3 Inventory.

## Reading

- `node --test engine.test.mjs`, idle 4-core container: **5174, 4947 ms**. Two tests
  are 4.7 s of it, the two that parse 1,000,000 rows ("small objects lose money",
  2216 ms; "a size filter turns the best action...", 2462 ms).
- Scratch benchmark (1,000,010 rows, header plus one-line rows; not committed):
  `parseCsv` 1470 / 1299 ms, `parseInventory` 3465 / 3440 ms, `analyze` 168 ms.
- `node --cpu-prof` self time: **garbage collector 3166 ms**, `parseCsv` 871,
  `parseInventory` 468, its per-row `get` closure 185, `analyze` 108.

## What the time was

1. `parseCsv` built every field one character at a time (`field += c`), so each
   field was a chain of one-character cons strings for the collector to walk and
   flatten.
2. `parseInventory` materialised the whole table (a million five-string arrays)
   before reading it, so every row survived into the old generation.

## Change (`ventures/s3-storage-class-savings/engine.mjs`)

- A private `eachCsvRow(text, onRow)` scans with `charCodeAt` and **slices** each
  run of plain characters from the text; inside quotes it jumps to the next `"`
  with `indexOf`. A quote anywhere still toggles quoting, CRLF still counts once,
  a leading BOM is still skipped once and blank rows are still dropped, exactly as
  the char-by-char reader did.
- `parseCsv` is `eachCsvRow` collecting rows (same export, same output).
- `parseInventory` consumes rows as they are read instead of from a stored table,
  with the same header detection and the same per-field `trim()` and tests.

## Verification

- Differential fuzz (scratch, not committed): 200,000 random inputs built from
  quotes, doubled quotes, commas, CR, LF, CRLF, BOMs, headers in several orders,
  `IsLatest`/`IsDeleteMarker` values, negative and padded sizes, plus edge cases
  (`null`, `undefined`, `""`, lone and unterminated quotes, a quote mid-field):
  `parseCsv` and `parseInventory` `deepEqual` to the old engine on every one.
- The million-row benchmark's report (`analyze` output plus sample rows) hashes to
  the same SHA-256 (`aed87e82...`) before and after.
- All 33 tests in the venture pass (`node --test *.test.mjs`).

## After

| measure | before | after |
|---|---:|---|
| `parseInventory`, 1M rows (2 runs) | 3465, 3440 ms | 873, 826 ms |
| `parseCsv`, 1M rows (2 runs) | 1470, 1299 ms | 712, 702 ms |
| `node --test engine.test.mjs` (wall) | 5174, 4947 ms | 2482, 2496, 2525 ms |
| the two million-row tests | 2216, 2462 ms | 1135, 1131 ms |

## Not changed, ranked for the next run

1. **What's left in the two million-row tests** is mostly the fixture: the test
   builds the million-line CSV with `Array.from` and `join` (about 0.5 s each) and
   then `parseInventory` takes about 0.4 s. Sharing one built string between the
   two tests would save about 0.5 s, but each test would no longer stand alone.
2. **`Date.parse` per row.** Real inventories have mostly distinct timestamps, so
   a memo would only help synthetic input. Not done.
3. **garmin-world-traveler-watchface `test/citydata.test.mjs`, 5.2 s**: "effective
   offset equals the IANA offset at every hour of 2025-2027" is 3.7 s and the DST
   transition test 1.2 s. Not profiled; the hourly sweep against `Intl` is likely
   the cost and is what the test is about, so check the comparison loop, not its
   coverage.
4. P063 and P064 remain owner-gated (workflow files).
