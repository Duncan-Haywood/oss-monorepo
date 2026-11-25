---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): the PDF reader decodes every standard non-image filter

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#183 (merged). Its CI job got no runner (3 s, no logs), so every step of `payapps-ci.yml` was run locally: `biome ci` (one existing warning), `pnpm typecheck`, unit tests (520 passed), worker tests (280 passed), `pnpm build`, `scripts/provision.test.mjs` (4 passed). No schema change.

**What landed.** The roadmap's "Backup packets, part 3: LZW-compressed object streams", widened to
every non-image filter in ISO 32000-1 section 7.4. `decodeStream` (`src/shared/pdf/reader.ts`) knew
only FlateDecode. A file using ASCIIHexDecode, ASCII85Decode, LZWDecode or RunLengthDecode lost all
its text in the SOV import and opening-balance fill (`extractText` swallowed the error per stream and
returned zero runs). A file with LZW object or cross-reference streams was refused by the packet as
"damaged: its page list could not be found". Page content streams themselves are copied into the
packet byte for byte, so only object/xref streams mattered there.

**Design choices to keep.**

- Decoders live in `src/shared/pdf/filters.ts`, beside `inflate`. Each takes `maxBytes` and throws
  `InflateLimitError` past it, so the reader's existing 64 MB budget covers them. Malformed data
  throws `FilterDataError`, which `decodeStream` rethrows as `PdfSyntaxError`, the type the reader's
  recovery and the text extractor already handle.
- LZW: a fixed 4096-entry table of (prefix, suffix, length), MSB-first codes, `/EarlyChange` 0 or 1.
  Data that ends without code 257 keeps what was decoded (as pdf.js does).
- Predictors moved to one `predict()` helper used by Flate and LZW: PNG 10-15 as before, plus TIFF 2
  for 1/2/4/8/16 bpc. Bad predictor parameters (Colors outside 1-32, bpc not in that list) now throw.
- Image-only filters (DCT, JPX, JBIG2, CCITT) are not decoded: nothing reads image samples.

**Verification.** New `src/shared/pdf/filters.test.ts` (the spec's own LZW example, Python
`base64.a85encode` vectors, round trips through `test/unit/lzw-encode.ts` across every code length
and a table reset, hostile codes and bombs); a text test with ASCIIHex, RunLength and ASCII85+LZW
content; a reader test with LZW object and xref streams (TIFF predictor) and an ASCIIHex+LZW page,
built by an `lzw` flag on `compressedPdf` in `pdf-merge.test.ts`. Both integration tests fail on the
old reader. By hand: five fixtures from an independent Python encoder; poppler reads all five; old
reader: no text from four, the fifth refused; new reader: all five without recovery, 93 runs each,
packet pages differ from originals only in the 5 stamp rows (pdftoppm at 50 dpi). The fixture
script was not committed (the TypeScript tests cover the same cases).

**Next, from the roadmap.** HEIC from Chrome/Firefox (a WebAssembly decoder), saving a packet
order, OCR for scanned SOV PDFs.
