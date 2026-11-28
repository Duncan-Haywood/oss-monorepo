# Drawing review: the PDF tokenizer calls back instead of yielding objects (2026-11-28)

Perf track, version 0, item 4 ("what visitors wait on"). The perf backlog had
no agent-workable item (P063, P064, P086 are owner rows). Target, again:
[`ventures/machine-shop-guides/drawing-review.html`](../../ventures/machine-shop-guides/drawing-review.html),
the free front door to bet #2 (AI RFQ-to-quote for job shops,
`portfolio/monetization/bets.md`), after the 2026-11-26 pass
([`drawing-review-perf-2026-11-26.md`](drawing-review-perf-2026-11-26.md))
halved it. Front-door weights were checked first and are not the lever:
every machine-shop-guides and pay-app-guides page is under 40 kB gz of
modules (`module-exclusive.mjs`), and the build already writes
modulepreload links.

## Reading (before, `937f5c14d`)

Same benchmark as the 2026-11-26 note: the page's invented sample drawing
plus N random short `m`/`l`/`S` segments (a `q … Q` every 500), one
FlateDecode content stream, `extractPdfLines` with `zlib.inflateSync`, Node
22 on a 4-core cloud container. Old and new modules loaded in one process
and run interleaved, so both see the same machine noise.

`node --cpu-prof`, self time over 9 reads of the 200,000-segment drawing:

| function | ms |
|---|---|
| `tokens` (generator) | 810 |
| garbage collector | 474 |
| `bytesToBinaryString` | 299 |
| `runTokens` | 183 |
| `step` (textRuns) | 109 |

The scan itself was already tight (char-code tables since 11-26). What was
left was the shape: `tokens()` was a generator yielding a fresh `{ v }` or
`{ op }` object per token, and `runTokens` unwrapped each again: five
million short-lived objects on a large drawing, plus the generator protocol.

## Change

`pdf-text.mjs` (the same block in machine-shop-guides, pdf-plan-takeoff and
drawing-set-index, and residential-takeoff's `apps/wall-framing-takeoff`, whose
`pdfsync.test.mjs` pins it byte for byte to pdf-plan-takeoff's; the 11-26
note missed that fourth copy, and CI caught it): the loop became `scanTokens(str, value, op)`, which calls
the reader's callbacks directly. `runTokens` and `TokenList` use it.
`tokens(str)` stays, now returning the array of `{ v }` / `{ op }` that the
tests compare against the regex reference.

Tried and dropped (measured slower, so not shipped):

- **`operands.length = 0`** instead of `operands = []` after each
  operator: V8 trims the backing store on the shrink, so every push grows it
  again. `readSheets` went 334 → 338 ms with it, 305 ms without.
- **Interning one- and two-character operator words** through a 65,536-slot
  array: the sparse array went to dictionary mode; 199 → 236 ms median.

## After

Medians of 31 (200k) and 41 (50k) interleaved reads, two separate runs each:

| drawing | before | after |
|---|---|---|
| 200,000 segments (8.5 MB stream, 3.7 MB file) | 210 / 202 ms | 158 / 186 ms |
| 50,000 segments | 52 / 55 ms | 43 / 44 ms |

About a fifth off the drawing review's read. `pdf-plan-takeoff`'s
`readSheets` (200,000 segments, median of 21) did not move outside noise
(321 → 334, 348 → 336 ms): its path reader and text reader each walk a
`TokenList`, and the tokenizing pass is a smaller share there.

## Verification

- **Same output.** Every one of the 68 PDFs in this checkout read with the
  old and new modules: `extractPdfLines` in lines mode, in runs mode, and
  `readSheets`, hashed: 204 of 204 identical. The benchmark drawing's output
  hashes the same before and after in both modes.
- The `pdf-tokens.test.mjs` reference comparison (34 edge cases, 3,000 fuzz
  strings, 20,000 numbers) now runs through `scanTokens`, since `tokens()`
  is built on it; `read-once.test.mjs` pins `TokenList` and the string path
  of `runTokens` to `tokens()`.
- Suites: machine-shop-guides 319/319, pdf-plan-takeoff 41/41,
  drawing-set-index 19/19, residential-takeoff passing (`run_venture_tests.py`).

## Not changed (ranked, for the next run)

1. **The scan loop itself** (~70 ms of a 200 ms read): char-code tables
   and in-place number parsing already. Further wins need a different
   representation (scanning the bytes rather than a binary string), which
   touches `pdf-parser.mjs` and its sync guard across six ventures.
2. **`bytesToBinaryString`** (~32 ms per read): the ASCII fast path landed
   on 11-26; the rest is the compressed file's own bytes, which are mostly
   above 0x7F and go through `fromCharCode`.
3. **`binaryStringToBytes`** (~8 ms): a char loop over each raw stream to
   hand it to the inflater; keeping the original bytes and slicing them by
   offset would remove it, but `decodeStream`'s signature is shared by six
   ventures.
4. A Web Worker for the read: the page's input is usually one sheet, so
   the main thread holds for well under a second on this container; still
   the step for a phone and a multi-sheet set.
