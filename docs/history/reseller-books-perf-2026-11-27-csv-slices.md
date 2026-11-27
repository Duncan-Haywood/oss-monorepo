# Reseller Books: CSV fields copied a run at a time, plain amounts read directly (2026-11-27)

Perf track, version 0. Reseller Books is the front door to bet #5 (reseller
profit and Schedule C books, `portfolio/monetization/bets.md`). The
2026-11-24 pass (`reseller-books-perf-2026-11-24.md`) ranked "`parseCsv`
builds every field one character at a time" first among what it left.

Other options looked at first and set aside this run: the bet front-door
pages (pay-application, lien-waiver, retainage, CNC quote) are 7 to 11 kB
gzip, so their weight is not a lever. The einvoice-preflight and
ai-bookkeeper suites have no hot file when each file is timed on its own
(slowest 1.4 s and 3.5 s, wall 27.6 s and 49.7 s). On the runner pool,
`error-rate-disclosure CI` spends 71% of each job on a full checkout, but
its `harness.analyse(REPO)` reads the whole tree, so a sparse checkout
would change what it measures.

## Reading (before)

The bench from the 2026-11-24 note (six sample files grown to 5,000 lines
each, `buildBooks` 11 times, median; the hash covers `JSON.stringify` of the
result, `toCsv` and `summaryText`), at `c2647e853`:

- median 443 ms and 423 ms over two runs, hash `830d739a95782be2`.

`node --cpu-prof` of the same bench, self time: GC 18.4%, `parseNumber`
(whatnot.mjs) 6.2%, `parseCsv` 5.2% + 3.3% + 2.3% + 1.1% + etsy across the
engines (about 12%).

## Change

Ten files: the five analyzers' `calc.mjs` (ebay-transaction-report,
etsy-statement-profit, poshmark-sales-report, whatnot-sales-report,
shopify-payout-profit) and their verbatim copies in
`ventures/reseller-books/engines/`. The copies stay byte-identical, which
`books.test.mjs` checks.

1. **`parseCsv`**: the same state machine, but a run of plain characters is
   copied with `src.slice(from, i)` when a quote, delimiter or line end
   ends it, not appended one character at a time. Line counting is
   unchanged.
2. **`parseNumber`** (Poshmark and Whatnot): a trimmed cell matching
   `^\d+(\.\d+)?$` (or `^\d+(,\d+)?$` in a decimal-comma file) is read with
   `Number` straight away when the result is finite. Anything else, or a
   non-finite result, takes the old path.

## Verification

- **Same answers.** The bench hash is `830d739a95782be2` before and after.
  The new `ventures/reseller-books/parse-csv-equivalence.test.mjs` keeps the
  old parser and the old `parseNumber` as references. It checks every
  engine against them on 4,000+ seeded random inputs each: quotes, doubled
  quotes, CR, LF, CRLF, BOM, blank lines, three delimiters, the
  non-enumerable `line` on each row, and for numbers, signs, brackets,
  currency, `e`, and 400-digit overflow (`Object.is`, so NaN and -0 count).
- `run_venture_tests.py` on reseller-books and the five analyzers: 6 suites,
  239 tests, 0 failed.

## After

Same bench, three runs: median 357, 356 and 341 ms (parseCsv alone first,
three runs: 383, 397, 378 ms). That is **about 430 to about 350 ms, −18%**,
for building the books from six 5,000-line exports.

## Not changed, ranked for the next run

1. **The same character-at-a-time `parseCsv` is in 54 files** across
   `ventures/` (`grep -rl 'let row = \[\], field = "", quoted = false, line = 1, start = 1;'`).
   The change above can be applied to each of them, with the reference test
   pointed at each one. Of those, only the bet front doors are worth doing.
2. **GC is still the largest single item** (18% before). Most of it comes
   from the per-row objects in `normalizeReport`/`normalizeRows` and from
   the regex `replace` calls in `detectDecimalComma`, which runs over every
   cell.
3. `detectDelimiter` still splits the whole file to read 8 lines (from the
   2026-11-24 list).
