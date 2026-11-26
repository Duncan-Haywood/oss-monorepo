# Drawing review and plan takeoff: the PDF content-stream tokenizer compares char codes (2026-11-26)

Perf track, version 0, item 4 ("what visitors wait on"). The perf backlog had
no agent-workable item (P063, P064, P086 are owner rows). Target:
[`ventures/machine-shop-guides/drawing-review.html`](../../ventures/machine-shop-guides/drawing-review.html),
a free front door to bet #2 (AI RFQ-to-quote for job shops,
`portfolio/monetization/bets.md`). The same `pdf-text.mjs` is vendored into
`pdf-plan-takeoff` (front door to bet #6, residential takeoff) and
`drawing-set-index`, so the fix went into all three.

## Reading (before, `d8a7e398a`)

Weight is not the lever (the page's modules are small). The wait is compute
on the main thread when a shop drops a drawing PDF. A drawing exported from
CAD is mostly line art: arcs, hatching and dimension leaders written as
hundreds of thousands of short `m`/`l`/`S` segments, megabytes of numbers
that the text reader has to step over to find the few dozen lines of text.

Benchmark: the page's own invented sample drawing with N random short
segments added (`x y m x2 y2 l S`, four decimals, a `q … Q` every 500), one
FlateDecode content stream, `extractPdfLines` with `zlib.inflateSync`, Node
22 on a 4-core cloud container, median of 9.

| drawing | content stream | before | after |
|---|---|---|---|
| 50,000 segments | 2.1 MB (0.9 MB file) | 155 ms | 84 ms |
| 200,000 segments | 8.4 MB (3.6 MB file) | 630 ms | 318 ms |

`pdf-plan-takeoff`'s `readSheets` (the geometry pass keeps every segment, so it
tokenizes the whole stream too), 200,000 segments, median of 5: **1,276 ms →
614 ms**, output JSON (20.5 MB) identical by hash.

The tokenizer alone on the 8.4 MB stream, median of 7: 424 ms → 103 ms.
A phone is several times slower than this container, so the before numbers
are seconds of a frozen tab there.

## Profile

`node --cpu-prof`, self time summed per function, 200,000 segments:

| function | before | after |
|---|---|---|
| `tokens` (pdf-text.mjs) | 372 ms | ~100 ms (214 ms with the tables alone, before numbers were parsed in place) |
| `RegExp [\0\t\n\f\r ]` | 82 ms | 0 |
| `RegExp ^[+-]?(\d+…)$` | 20 ms | 0 |
| `bytesToBinaryString` | 110 ms | 91 ms (unchanged code) |
| `textRuns` | 63 ms | 53 ms |

The old loop ran a regex `.test()` on every character to find white space,
`'()<>[]{}/%'.includes()` on every character of every word, then a regex on
every word, then `parseFloat` on a fresh slice.

## Change

`tokens()` in `pdf-text.mjs` (all three copies, same block):

1. White space and delimiters are two 256-entry `Uint8Array` tables indexed
   by `charCodeAt` (the string is a Latin-1 "binary string", so every code is
   below 256; the guard `c < 256` stays anyway).
2. `numberWord()` checks the word against the same grammar as the old regex
   and builds the value in the same pass: an integer mantissa divided by
   10^k. With at most 15 digits both are exact doubles and IEEE division is
   correctly rounded, so the result is the double `parseFloat` returns;
   longer numbers still go to `parseFloat`. Sign is applied last, so `-0`
   stays `-0`.
3. The two identical `(`/`<`/`[`/`/` branches became one; the
   `c === '(' || c === '<' ? v : v` no-op went.

`drawing-set-index/pdf-text.mjs` gains `export { tokens }` for the test.

## Verification

- **Same tokens, same doubles.** New `pdf-tokens.test.mjs` in all three
  ventures keeps the regex tokenizer as a reference and compares with
  `Object.is`: 34 hand-picked edge cases (`-0`, `.5`, `5.`, `-.`, `1e5`,
  20-digit numbers, NUL and form feed, bytes ≥ 0x80), 3,000 seeded fuzz
  strings of PDF syntax and a 20,000-number fuzz. Mutation check: raising
  the exact-division cutoff from 15 to 17 digits fails it.
- **Off-tree, before merging:** 200,000 fuzz strings and 2 million random
  decimals, plus every stream (2,133) of the 60 PDFs in this checkout:
  identical token streams. `extractPdfLines` output (lines mode and runs
  mode) hashed identical on 26 PDFs.
- Suites: machine-shop-guides 228/228, drawing-set-index 19/19,
  pdf-plan-takeoff 25/25.

## Not changed (ranked, for the next run)

1. `bytesToBinaryString` (~90 ms of the 8.4 MB case): string concatenation of
   32 KB `fromCharCode` chunks. `TextDecoder('latin1')` is not a fix: the
   WHATWG "latin1" label is windows-1252 and remaps 0x80–0x9F, which breaks
   the lossless byte mapping. `pdf-parser.mjs` is sync-guarded across six
   ventures, so a change there goes to all six at once.
2. `textRuns` allocates a `num` closure per operator and does
   `operands.shift()` past 64 operands; ~50 ms here.
3. `bank-statement-pdf-to-csv` and `submittal-register` carry an older
   tokenizer (a plain `indexOf('EI')` inline-image skip). Their inputs are
   statements and submittal PDFs, not line art, so the win is small; port the
   new block with the old BI branch if they ever show up in a profile.
4. The reader runs on the main thread. A Web Worker would keep the tab
   responsive on a 50 MB drawing set, but `drawing-set-index` already has
   one and this page's typical input is one sheet.
