# ifcXML read from the file's bytes, not one string (2026-11-18)

The flagship row ended with "next: ifcXML from bytes (one string still,
capped near 537 MB)". Earlier today STEP stopped being one string on the heap
(`eval/step-bytes-2026-11-18.md`), but `Model` still decoded an ifcXML file
to one JavaScript string before reading it. The streaming reader
(`eval/lazy-ifcxml-2026-11-18.md`) re-reads lazy geometry from that string,
so the whole file stayed on the V8 heap for as long as the model was
checked, and a file past V8's 536,870,888-character string limit could not
be opened at all.

## What changed

- **`xml.mjs`: `parseXmlBytes(bytes, opts)`**, and `parseXml` hands a
  `Uint8Array` to it. The same reader, written over bytes: every byte it
  looks for (`<`, `>`, `/`, `=`, quotes, `!`, `?`, ASCII white space) is
  ASCII, which never occurs inside a UTF-8 multi-byte character, so each
  element name, attribute value and text run is decoded on its own
  (`Buffer.utf8Slice` in Node, `TextDecoder` in a browser) and holds the same
  characters as the whole file decoded and sliced. `spans` give byte offsets
  and error messages say "at byte N".
- **`ifcxml.mjs`**: `parseIfcXml(bytes, ...)` passes the bytes to the XML
  reader, and a lazy geometry entity is read again from
  `bytes.subarray(start, end)`. `ifcXmlSchemaId` and `looksLikeXml` decode
  only the file's head.
- **`ids.mjs`**: `Model` no longer decodes an ifcXML file. `readModel`
  already returned bytes, and the page and editor already post bytes to the
  worker, so the CLI, the CI runner and the page all take the new path with
  no change of their own.

One difference from the string reader: white space inside a start tag is
ASCII white space. The string reader's `\s` also took Unicode spaces there,
which XML does not allow in a name.

## Same reports

`ifcxml-bytes.test.mjs` parses text and bytes side by side: every ifcXML model
written out in `ifcxml.test.mjs` (both layouts, Annex E forms, B-spline
grids), the sample, the nested IFC4 layout of the sample, lazy and eager, as a
Node `Buffer` and as a plain `Uint8Array` (the browser's path); a file with a
byte order mark, raw UTF-8 (ü, ß, 日本, an emoji), entities, CDATA and a
comment; 120 files cut short at even steps plus seven malformed fragments
(same tree, or the same error apart from its position); and spans checked
against the bytes they point at.

`eval/heap-compare.mjs` parses a model once and checks it against the three
starter IDS files and the 65 public ones (`eval/fetch-audit-corpus.sh`),
`maxFailed: 1000`, hashing every report with `seconds` removed. Main is
`origin/main` at `9b468871f` unpacked with `git archive`. Models are
`opensourceBIM/IFC-files` at `cb96c50` (fetch steps in
`model-attr-codes-2026-11-17.md`) written as ifcXML with
`eval/step-to-ifcxml.mjs`; the federated one is `eval/federate.mjs` over HHS
MEP, MEP2, architect and construction, as in `lazy-ifcxml-2026-11-18.md`.
Node v22, 4 vCPU, single runs.

| model (ifcXML) | hash, main | this change |
|---|---|---|
| HHS MEP, 152 MB | 25778f0868d882d1 | 25778f0868d882d1 |
| Schultz Residence, 93 MB | 02e80c6ff34126ed | 02e80c6ff34126ed |
| federated, 374 MB | 646c4d8e79496acc | 646c4d8e79496acc |

Every report is identical (19 of the 68 IDS files raise an error on these
IFC2X3 models on both sides, as on STEP).

## Memory and time

All 68 IDS files, one process: heap at the checks (sampled every 20 ms),
peak RSS, wall time.

| model | main | this change |
|---|---|---|
| HHS MEP | 659 MB heap, 912 MB RSS, 6.9 s | 337 MB, 626 MB, 7.4 s |
| Schultz Residence | 367 MB, 559 MB, 4.1 s | 211 MB, 394 MB, 3.9 s |
| federated, 374 MB | 1,527 MB, 2,040 MB, 23.4 s | 805 MB, 1,351 MB, 20.0 s |

Parse only (`node --expose-gc eval/retained-heap.mjs`): heap kept after the
parse. On main this includes the decoded file, since `Model` decoded it.

| model | kept, main | this change | parse, main | this change |
|---|---:|---:|---:|---:|
| HHS MEP | 327 MB | 177 MB | 5.9 s | 4.9 s |
| Schultz Residence | 177 MB | 84 MB | 3.0 s | 3.0 s |
| federated, 374 MB | 774 MB | 403 MB | 14.7 s | 13.6 s |

Smallest `--max-old-space-size` that finishes (`sh eval/min-heap.sh`):

| model | main | this change |
|---|---:|---:|
| HHS MEP, parse (16 MB steps) | 336 MB | 192 MB |
| Schultz Residence, parse (16 MB steps) | 192 MB | 112 MB |
| federated 374 MB, parse (32 MB steps) | 800 MB | 448 MB |
| federated 374 MB, all 68 IDS (64 MB steps) | 832 MB | 448 MB |

The federated ifcXML now checks against all 68 IDS files in the same heap
the 219 MB STEP model needed (448 MB, `step-bytes-2026-11-18.md`). Time is
within run-to-run noise: the per-run decodes cost about what decoding one
large string and its garbage collection used to.

## Files past V8's string limit

A 680 MB ifcXML (`eval/federate.mjs` over HHS MEP, MEP2, architect,
construction, MEP and MEP2 again, then `eval/step-to-ifcxml.mjs`; 2,953,678
entities):

| | main | this change |
|---|---|---|
| `node cli.mjs fed7.ifcxml samples/coordination-basics.ids.xml --json` | `error: Cannot create a string longer than 0x1fffffe8 characters` in 0.4 s | report in 25.6 s |

All 68 IDS files: 35.4 s, 1,662 MB heap at the checks; the smallest heap
that parses it is 832 MB (64 MB steps).

## The page

`node eval/page-smoke.mjs <dir> architect.ifcxml` in Playwright's Chromium
against `python3 -m http.server 8765 --bind 127.0.0.1`: the sample button, a
dropped `.ifczip`, `.ifcxml` and the 53 MB HHS architect written as ifcXML
each give a report (49, 49 and 224,884 entities, the last in 3.5 s), the
editor's "Open a model" lists the sample's classes, and the console shows no
errors. `node --test *.test.mjs`: 250 pass, 0 fail.

## Not done

- The XML reader decodes each text run, including the white space between
  tags, to a string; skipping white-space-only runs where no reader looks at
  them would save garbage, at the cost of a rule about which elements' text
  matters.
- No public ifcXML file is larger than 0.6 MB; the large files here are real
  STEP exports written in xBIM's IFC2X3 layout, as in
  `lazy-ifcxml-2026-11-18.md`.
