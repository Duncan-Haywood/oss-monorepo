# Sales Export To Journal: big exports were read as the wrong platform, and one formatter per amount (2026-11-24)

Perf track, version 0, item 4 ("what visitors wait on"). Both open perf
backlog items (P063, P064) touch workflow files in `.github/CODEOWNERS` and
wait for the owner. The 2026-11-24 module-weight sweep
(`node platform/perf/module-weight.mjs .`) put sales-export-to-journal at
146 kB gzip over 19 files, and no earlier perf pass covered it. Its page weight
turned out to be the wrong lever: automatic detection runs all 17 platform
readers over the dropped file, so every engine is needed on the first press
anyway. The time goes into reading the file, so this run measured that, and
found a correctness bug on the way.

## Reading (before)

Bench: each platform's `sampleReport()` with its data rows repeated until the
file has 5,000 lines, then `convert(text)` (detect, then read). Median of 5,
Node 22, this container.

- `convert` total across the 17 files: **3,432 ms**. PayPal 1,111 ms and
  Shopify 466 ms were the slowest.
- **7 of the 17 large files were detected as the wrong platform**: Fiverr,
  Shopify and Upwork as AdSense, Gumroad and Patreon as KDP, PayPal as Etsy,
  Stripe as Gumroad. Each sample alone detects correctly.

### The detection bug

`detect()` scores each reader at ten points per kept row (plus journals and
reconciled payouts, minus errors), then adds a flat **+400** if the header
carries a word only that platform's export uses. A reader that half-understands
a foreign file keeps every row with a warning ("8 rows no rule recognised"),
not an error, so it ties the right reader row for row. The right reader often
keeps a few rows fewer, because it sets payout and summary rows aside. On a
10-row sample, 400 points decides. On a large file the row gap grows past
400 and the wrong reader wins. Growing one sample at a time, the first wrong
answer came at: Fiverr 270 rows, Patreon 294, Gumroad 301, Upwork 324,
PayPal 330, Shopify 462, Stripe 462. A month of a busy shop is that size.

The Fiverr, Upwork and PayPal flips are partly caused by the bench itself:
repeated rows break those exports' running-balance column, and each break
counts as an error. The Shopify, Stripe and Gumroad readers report no errors
on their repeated files, so those flips reflect what a real large export would
do.

### The profile

`node --cpu-prof` over the PayPal 5,000-row file, run through the Stripe and
Shopify readers (the two slowest on it), summed self time: **774 ms in
`money` (shopify.mjs) and 772 ms in `money` (stripe.mjs)**, against 34 ms for
the next function. Every engine formats amounts with
`Math.abs(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, ... })`.
Called with options, `toLocaleString` builds a new `Intl.NumberFormat` every
time. A reader that misreads a file writes one finding per row, so it formats
thousands of amounts. A second profile over all 17 files then showed
`RegExp: \r?\n` at 797 ms: `signatureBoost` split the whole file, once per
platform, to read its first 40 lines.

## Change

1. **Signature boost scales with the file** (`calc.mjs`): `Math.max(400, base)`
   in place of a flat 400. Any file whose base score is under 400 (about 40
   rows) ranks exactly as before, so every sample and its pinned test is
   unchanged. On a large file a matching signature doubles the score.
2. **One formatter per engine**: `const MONEY_FMT = new Intl.NumberFormat("en-US",
   { minimumFractionDigits: 2, maximumFractionDigits: 2 })`, and `money` calls
   `MONEY_FMT.format(...)`. ECMA-402 defines `Number.prototype.toLocaleString(locales,
   options)` as building that same formatter and formatting with it, so the
   text is the same. The change is in all 17 engines and in the 13
   single-platform ventures they were copied from. Each pair is still
   byte-identical (`cmp`), so no copy has drifted from its source.
3. **Header read once per detect** (`calc.mjs`): `headOf(text)` splits with a
   limit of 40 lines, once, in place of `split().slice(0, 40)` per platform.

## Verification

- **Same answers from the engines.** A script imported the old 17 engines
  (copies of the pre-change files) beside the new ones and compared
  `money(v, cur)` over 20,019 values × 2 currencies (0, −0, ±1, ±1e15, ±0.5,
  ±Infinity, NaN, random magnitudes to 10¹³). It also ran every engine over
  every platform's sample, broken sample and 5,000-row file (17 × 51 inputs),
  comparing `validate` output, the Xero, QBO, IIF and journals CSVs, and the
  findings CSV. 681,513 comparisons, **0 differences**.
- **The detection fix has a test.** `detect.test.mjs` now detects every
  platform's sample at 800 rows. Against the old `calc.mjs` it fails 7 of 17
  (exactly the seven above); with the fix, 88 of 88 pass.
- **Suites.** `python3 platform/ci/run_venture_tests.py` on the 14 touched
  ventures: 14 suites run, 0 failed, plus the site page checks.

## After

| | before | after |
|---|---:|---:|
| 5,000-row files detected correctly | 10 of 17 | **17 of 17** |
| first wrong answer while growing a sample | 270 to 462 rows (7 platforms) | none up to 700 rows |
| `convert` on the PayPal 5,000-row file (median of 5) | 1,111 ms | **288 ms** |
| `convert` on the Shopify 5,000-row file | 452 to 466 ms | **274 ms** |
| `convert`, sum of all 17 files | 3,311 to 3,432 ms | **2,188 to 2,261 ms** (−34%) |

The ranges come from two runs each. The other platforms' times moved within
noise.

## Not changed, ranked for the next run

1. **The same `toLocaleString`-with-options call appears in 314 `.mjs` files**
   across `ventures/` (`grep -rln 'toLocaleString("en-US", { minimumFractionDigits: 2'`).
   It only matters where a function formats thousands of amounts in one go,
   such as findings per row or long reports. The fix is mechanical, and the
   equivalence check above can be reused for it. Vendored pairs exist (for
   example `reseller-books/engines/*`, checked byte-identical against
   `*-profit-analyzer/calc.mjs` by `books.test.mjs`), so change a source and
   its copies together.
2. **Each reader splits and parses the file itself**, 17 times per detect
   (`parsePayouts` and `splitLine`, roughly 150 to 290 ms each across the
   bench). Sharing one parsed table would mean changing the engine API that
   the 13 single-platform tools also use.
3. **Wrong readers keep foreign rows as warnings.** The scaled boost settles
   any file that carries a signature word. A drifted header with no signature
   still falls back to row counts, where "rows no rule recognised" costs
   nothing. Counting those rows against the score is a scoring change worth
   its own test set.
4. **Page weight (146 kB).** Lazy-loading the engines would only delay the
   download to the first press, because detection needs all of them.
5. P063 and P064 remain owner-gated (workflow files).
