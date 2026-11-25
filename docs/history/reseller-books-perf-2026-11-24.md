# Reseller Books: each Poshmark and Whatnot file was parsed twice (2026-11-24)

Perf track, version 0, item 4 ("what visitors wait on"). Both open perf
backlog items (P063, P064) touch workflow files in `.github/CODEOWNERS` and
wait for the owner. The 2026-11-24 module-weight sweep put reseller-books at
55 kB gzip over 7 files, and no earlier perf pass covered it. The page weight
is small; the wait is in building the books from a seller's exports, so this
run measured that.

## Reading (before)

Bench (the script is at the end of this note):
the six files from `sampleFiles()` (eBay, Etsy statement, Poshmark, Whatnot,
Shopify transactions, Shopify orders), each with its data rows repeated until
the file has N lines, then `buildBooks(files, { costs })`. 11 runs, median,
Node 22, this container. The result, `toCsv` and `summaryText` are hashed so
before and after can be compared.

- N = 5,000 lines per file (30,000 lines): about 230 ms.
- N = 20,000 lines per file (120,000 lines): **922 to 929 ms** (three runs).

`node --cpu-prof` at N = 20,000, self time summed per function over 5 builds:
GC 844 ms, then the five engines' `parseCsv` (Shopify 376, Whatnot 213, eBay
200, Poshmark 192, Etsy 107 ms), then `detectDecimalComma` and the channel
readers. Two things in `books.mjs` itself showed up:

1. **`itemChannel` parsed every Poshmark and Whatnot file twice**: once for
   `normalizeRows` and once more, inline, for `detectDecimalComma`. Both read
   the table without changing it (checked: neither writes to the table or its
   rows).
2. **`detectKind` split each whole file into lines to look at its first 15,
   and `headerTokens` split it again to find the first non-empty line**
   (`RegExp: \r?\n`, 128 ms over the 5 builds).

## Change (`ventures/reseller-books/books.mjs` only)

1. `itemChannel` parses once and hands the same table to both calls.
2. `detectKind` uses `split(/\r?\n/, 15)` in place of `split(...).slice(0, 15)`;
   the split limit returns exactly the same first 15 pieces.
3. `headerTokens` looks for the first filled line in the first 15 lines and
   falls back to the whole file only when all 15 are blank, so its answer is
   the same in every case.

The vendored engines are untouched, so `books.test.mjs`'s byte-identity check
against the five source analyzers still holds.

## Verification

- **Same answers.** The bench hash of `JSON.stringify(result) + toCsv + summaryText`
  is identical before and after at both sizes (`39ab5dad…` at 5,000 lines,
  `51bdd0de…` at 20,000).
- **New test** in `books.test.mjs`: every non-eBay sample still detects after 20
  leading blank lines (the fallback path), and a Poshmark file repeated 50 times
  reads 50 times the orders.
- `python3 platform/ci/run_venture_tests.py reseller-books`: 31 tests, 0 failed,
  plus the site page checks.

## After

| N = 20,000 lines per file, median of 11 | before | after |
|---|---:|---:|
| run 1 | 929 ms | 854 ms |
| run 2 | 922 ms | 840 ms |
| run 3 | 928 ms | 773 ms |

About **10% (770 to 850 ms against 920 to 930 ms)**, runs interleaved old/new.
Small, because the double parse covered only two of six channels. At
realistic sizes (a few thousand rows) a build is already well under a
quarter-second; this is a modest win, recorded honestly.

## Not changed, ranked for the next run

1. **`parseCsv` builds every field one character at a time** (`field += c`),
   in all five engines. It is about a fifth of the build plus much of the GC.
   A slice-based parser would need to change the five source analyzers
   (`ebay-transaction-report-analyzer`, `etsy-statement-profit-analyzer`,
   `poshmark-sales-report-analyzer`, `whatnot-sales-report-analyzer`,
   `shopify-payout-profit-analyzer`) and their copies here together, with a
   fuzzed equivalence check over quotes, CR/LF and the non-enumerable `line`.
2. **The engines' `detectDelimiter` splits the whole file** to read its first
   8 non-blank lines. Same vendoring constraint.
3. **`money` here and in the Poshmark/Whatnot engines** calls
   `toLocaleString` with options (a new `Intl.NumberFormat` per call). It is
   not hot in this tool: findings are not written per row.

## Bench script

`node bench.mjs <absolute path to ventures/reseller-books> <lines per file>`

```js
const dir = process.argv[2] || "/home/user/oss-monorepo/ventures/reseller-books";
const target = +(process.argv[3] || 5000);
const b = await import(dir + "/books.mjs");
const s = b.sampleFiles();
function grow(text) {
  const l = text.split("\n");
  const h = l.findIndex((x) => (x.match(/,/g) || []).length > 5);
  const head = l.slice(0, h + 1), body = l.slice(h + 1).filter(Boolean);
  const out = [...head];
  while (out.length < target) out.push(...body);
  return out.join("\n");
}
const files = s.files.map((f) => ({ name: f.name, text: grow(f.text) }));
const times = [];
let r;
for (let i = 0; i < 11; i++) { const t = performance.now(); r = b.buildBooks(files, { costs: s.costs }); times.push(performance.now() - t); }
times.sort((a, b) => a - b);
console.log("median ms", times[5].toFixed(0), "all", times.map((t) => t.toFixed(0)).join(" "));
const csv = b.toCsv(r), sum = b.summaryText(r);
const { createHash } = await import("node:crypto");
console.log("hash", createHash("sha256").update(JSON.stringify(r) + csv + sum).digest("hex").slice(0, 16));
```
