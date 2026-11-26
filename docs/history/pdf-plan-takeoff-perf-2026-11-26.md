# PDF plan takeoff: one tokenizing pass, flat path points, ASCII chunks through TextDecoder (2026-11-26)

Perf track, version 0, item 4 ("what visitors wait on"). The perf backlog had
no agent-workable item (P063, P064, P086 are owner rows). Target:
[`ventures/pdf-plan-takeoff`](../../ventures/pdf-plan-takeoff/), the free front
door to bet #6 (residential takeoff, `portfolio/monetization/bets.md`). It
had no perf pass of its own; the tokenizer it shares was sped up earlier the
same day (`drawing-review-perf-2026-11-26.md`), on an invented drawing.

## Reading (before, `f5e67e8ff`)

Weight is not the lever (35 kB gz of modules). The wait is `readSheets` on
the main thread when a contractor drops a drawing set. This pass measured
real sets: the 14 OpeningDesign drawing sets `drawing-set-index/eval/fetch.sh`
fetches (2.5 to 50 MB, 180 pages), not a synthetic stream.

`readSheets` only, median of 5, Node 22, 4-core cloud container. Two rounds
each, before and after interleaved; the container is noisy (±10%).

| set | file | before (ms) | after (ms) | change |
|---|---|---|---|---|
| k-20160415 (19 sheets, 28.4 MB of content, 5.2 M tokens, 620 k segments) | 7.9 MB | 2,261 / 2,511 | 1,652 / 1,734 | −29% |
| og-20190308 (25 sheets) | 27 MB | 1,339 / 1,338 | 983 / 1,104 | −22% |
| k-20150129 | 4.4 MB | 993 / 1,100 | 605 / 691 | −38% |
| vr-20170410 | 22 MB | 1,099 / 1,103 | 797 / 818 | −27% |
| aa-20180706 (mostly raster tiles) | 50 MB | 657 / 699 | 613 / 605 | −10% |

In the page itself (Chromium via Playwright, the page's own "Read N pages in
X s" line): k-20160415 2.1 s → 1.4 s, og-20190308 1.2–1.3 s → 0.8 s,
vr-20170410 1.0 s → 0.7–0.8 s.

Peak heap + external during `readSheets` (5 ms sampling): k-20160415 140 →
152 MB, og-20190308 152 → 173 MB, aa-20180706 223 → 223 MB.

## Profile (k-20160415, `node --cpu-prof`, self time)

| function | before | after |
|---|---|---|
| `tokens` | 792 ms (two passes) | 404 ms (one pass) |
| `bytesToBinaryString` | 302 ms | ~60 ms (not in the top 14) |
| `pathSegments` + `nums` + `paint` | 548 ms | ~200 ms (`step` + `paint`) |
| `TokenList` build + `run` | — | 288 ms |

Phase timing on the 19 page streams: tokenizing alone 540 ms; `pathSegments`
1,100 ms before (so ~560 ms of its own work on top of tokenizing), ~800 after
the flat-points change alone; `textRuns` ~650 ms (~100 ms on top of
tokenizing).

## Changes

1. **One tokenizing pass for both readers** (`pdf-text.mjs` `TokenList`,
   `runTokens`; `geometry.mjs` `readSheets`, `formTokens`). `readSheets`
   tokenized every page twice: once for line work, once for text. A first
   try that kept the tokens as an array of `{v}`/`{op}` objects gained
   nothing: a million objects kept alive between passes moved the cost into
   the garbage collector (GC 134 → 322 ms). A second try that replayed a
   compact list through a generator gained ~3%: generator resumption cost
   about what tokenizing did. What worked: numbers in a `Float64Array`, the
   70 standard operators as a byte code, other values in one array, and both
   readers walking it with an index loop that calls `value(v)` / `op(name)`.
   `textRuns` and `pathSegments` take a string or a `TokenList`, so
   `extractPdfLines` and every other caller are unchanged. A Form XObject's
   list is kept on the form, so a CAD block placed many times on a page is
   tokenized once instead of once per placement per reader.
2. **Flat path points** (`geometry.mjs` `pathSegments`, `cubic`). Each point
   was a two-element array, and every operator ran
   `operands.slice(-k).map(...)`. Points are now plain numbers; the
   arithmetic is the same expressions in the same order, so the doubles are
   identical.
3. **ASCII chunks through `TextDecoder`** (`pdf-parser.mjs`
   `bytesToBinaryString`, all six vendored copies). A 32 KB chunk with no byte
   above 0x7F is decoded as UTF-8, which for ASCII is the same string, 5×
   quicker than `String.fromCharCode.apply`, and still a one-byte string.
   Other chunks keep `fromCharCode`; the scan stops at the first high byte.
   Tried and rejected: widening to `Uint16Array` and decoding UTF-16LE was
   quicker still on binary chunks (30 MB: 280 → 50 ms) but builds two-byte
   strings: og-20190308's peak went 152 → 295 MB. `TextDecoder('latin1')` is
   windows-1252 (remaps 0x80–0x9F), as the earlier note found.

`machine-shop-guides` and `drawing-set-index` get the same `pdf-text.mjs`
change (their `textRuns` callers pass strings, so behaviour is unchanged);
the other four PDF ventures get the faster `bytesToBinaryString` through the
sync-guarded `pdf-parser.mjs`.

## Verification

- **Byte-identical results on real sets**: `readSheets` output for all 14
  sets (every page's `segs`, `paint`, `widths`, `curve` buffers plus box,
  rotation, images and text runs) hashed identical before and after; the CLI
  `--json` scale report identical on all 14.
- **New `read-once.test.mjs`** (pdf-plan-takeoff): keeps the old
  array-of-points `pathSegments` as the reference and compares, with
  `Object.is`, on 400 seeded fuzz streams with nested forms and images, from
  a string and from a `TokenList`; `TokenList` replays exactly the tokens of
  `tokens(str)` on 300 fuzz streams; `textRuns` gives the same runs from
  either; `bytesToBinaryString` equals the old `fromCharCode` loop on
  ASCII, binary, mixed and chunk-edge inputs, all 256 byte values and a
  subarray view. Mutation checks: dropping `h`'s closing segment fails the
  path test; letting high bytes through the UTF-8 path fails the string test.
- Suites: pdf-plan-takeoff, machine-shop-guides 250, drawing-set-index 19,
  bank-statement-pdf-to-csv 107, pdf-accessibility-tag-check 66,
  submittal-register 38: all pass (`run_venture_tests.py`).
- Chromium: the page reads all three tested sets with no console errors.

## Not changed (ranked, for the next run)

1. **The tokenizer itself** (~400 ms of k-20160415's 1.65 s, 80 ns a token):
   a generator yielding a fresh object per token. A callback tokenizer that
   fills the `TokenList` directly would skip both, but it duplicates the
   reference-pinned tokenizer loop; worth it only with `pdf-tokens.test.mjs`
   extended to pin both.
2. **Forms are decoded per page** (`loadForms` inflates every Form XObject a
   page's resources name, page after page). On these sets zlib is ~30 ms, so
   small; a set with a heavy title-block form on every sheet would show it.
3. **`dimensionMatches`** (~120–150 ms, CLI and the page's verdict) and
   `textRuns`' per-op closure: smaller.
4. **Off the main thread**: a Web Worker would keep the tab responsive while
   a 50 MB set reads; `drawing-set-index` already has one to copy.
