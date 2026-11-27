# Drawing review: a long note is cleaned once, not once per line (2026-11-27)

Perf track, version 0, item 4 ("what visitors wait on"). The perf backlog had
no agent-workable item (P063, P064, P086 are owner rows). Target:
[`ventures/machine-shop-guides/drawing-review.html`](../../ventures/machine-shop-guides/drawing-review.html),
a free front door to bet #2 (AI RFQ-to-quote for job shops,
`portfolio/monetization/bets.md`). The previous pass
([`drawing-review-perf-2026-11-26.md`](drawing-review-perf-2026-11-26.md))
sped up the tokenizer on line-art-heavy drawings. This one measured the
other kind of big drawing: one dense with text (dimension labels, tables,
callouts), where the time is in `readDrawing`, not the PDF reader.

## Reading (before, `fe266b64f`)

Benchmark: the page's invented sample drawing with N extra text runs
(`BT /F1 6 Tf … Tm (d.ddd) Tj ET`, random positions in the views, seeded
LCG) and optionally M random line segments ([`platform/perf/drawing-review-bench.mjs`](../../platform/perf/drawing-review-bench.mjs)), one FlateDecode content stream,
`extractPdfLines` + `readDrawing` with `zlib.inflateSync`, Node 22 on a
4-core cloud container, median of 21.

| drawing | before | after | output hash (both) |
|---|---:|---:|---|
| sample + 1,000 text runs | 8.1 ms | 6.5 ms | `3d11abe2926f277f` |
| sample + 4,000 text runs | 45.3 ms | 17.8 ms | `1e8b61f8de077560` |
| sample + 16,000 text runs | 158.1 ms | 66.1 ms | `e561fafc0d89863a` |
| sample + 60,000 segments + 4,000 text runs | 83.2 ms | 61.2 ms | `12bb55016515e044` |

The hash is SHA-256 of `JSON.stringify([extracted, drawing])`: every field,
note, dimension and question is identical.

## Profile

`node --cpu-prof`, 16,000 text runs, self time summed per function, then
attributed to the caller of `clean` and the `\s+` regex: 448 ms of ~900 ms
total sampled sat under `readNotes`. The note reader appends each
continuation line to the current note with
`cur.text = clean(`${cur.text} ${text}`)`, re-scanning the whole growing
note with `/\s+/g` on every line: quadratic in the note's length. On a dense
sheet the last note runs on through view text in the same column, so one
"note" grows to thousands of pieces.

## Change

`drawing.mjs`, `readNotes`: continuation lines are appended raw
(`cur.text += ` ${text}``) and every note is cleaned once after the scan.
Same result because `clean(clean(a) + " " + b) === clean(a + " " + b)`:
collapsing whitespace runs and trimming the ends does not depend on where
the cuts were. `drawing.test.mjs` pins this with a 200-line note full of
odd spacing, compared against the old clean-after-every-line fold.

## Verification

- `node --test ventures/machine-shop-guides/drawing.test.mjs`: 16 pass.
- `run_venture_tests.py machine-shop-guides`: 254 tests pass.
- Output hashes identical before and after on all four inputs above.

## Not changed (ranked, for the next run)

1. **Accuracy, not speed:** on a dense sheet the last note keeps absorbing
   view text that sits within 400 pt right of the NOTES heading and less
   than 30 pt below the previous line. A real drawing with a view under the
   notes column would show dimension text inside note N, and those pieces
   are then skipped by `readDimensions` (they are in `used`). Worth a fixture
   from a real CAD export before changing the rule; it changes output, so it
   is product work, not perf.
2. `readTitleBlock` computes the `below` candidates by filtering every line
   of the page for every label match (~20 ms at 16,000 runs).
3. The tokenizer and `bytesToBinaryString` items in the 2026-11-26 list
   still stand.
