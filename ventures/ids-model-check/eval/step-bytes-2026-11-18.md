# STEP read from the file's bytes, not one string (2026-11-18)

The flagship row ended with "next: the parse's own 512 MB": on main at
`92a89d4f7`, the smallest V8 heap that parses the 219 MB federated model was
512 MB, and the heap kept after parsing was 273 MB. The rest was the file
itself. `readModel` decoded the file into one JavaScript string, and the lazy
STEP records read their arguments from that string, so all 219 MB stayed on
the heap for as long as the model was checked.

## What changed

- **`step.mjs`: `parseStep(bytes)`.** Given a `Uint8Array` (a Node `Buffer`,
  or a browser `File`'s `arrayBuffer()`), the scan walks the bytes: the same
  `#n = TYPE (` match, `/* comments */` and complex instances stepped over,
  `DATA;` found as `\bDATA\s*;` was. A record's arguments are decoded to a
  short string of their own (`Buffer.utf8Slice` in Node, `TextDecoder` in a
  browser) when they are first read, and the `Reader` runs on that string.
  Records are cut at ASCII bytes (`;`, `'`, `(`, `/*`), which never occur
  inside a UTF-8 multi-byte character, so a record decoded alone holds the
  same characters as the whole file decoded and sliced. The record's end is
  found again on each read rather than kept (4 bytes on each of 3.7 million
  entities). Error positions are byte offsets in the file. A string still
  reads as before.
- **`ids.mjs`: `Model` takes bytes.** ifcXML is detected from the first
  800 bytes and decoded as before (its reader needs the text).
- **`node.mjs`: `readModel` returns `{ name, bytes, text }`**, with `text` a
  getter that decodes on demand, so existing callers still work.
  `unzipModel(..., { bytes: true })` returns the unpacked bytes. `cli.mjs`
  and `ci-cli.mjs` pass `bytes`; `stepLines` (CI annotation lines) reads
  bytes too, so the CI runner no longer keeps the model's text beside it.
- **The page and the editor** keep the model as bytes and post them to the
  worker, which used to receive (and copy) the whole text.

## Same reports

`eval/heap-compare.mjs` parses a model once and checks it against the three
starter IDS files and the 65 public ones (`eval/fetch-audit-corpus.sh`),
`maxFailed: 1000`, hashing every report with `seconds` removed. Main is
`origin/main` at `92a89d4f7` unpacked with `git archive`. Models from
`opensourceBIM/IFC-files` at `cb96c50` (fetch steps in
`model-attr-codes-2026-11-17.md`); the federated models are built with
`eval/federate.mjs` as in `heap-200mb-2026-11-17.md`.

| model | hash, main | this change |
|---|---|---|
| HHS MEP, 40 MB | 63d54c450396b124 | 63d54c450396b124 |
| Schultz Residence | d5ac74b30dac25ed | d5ac74b30dac25ed |
| HHS architect, 13 MB | 71013000710cb0a8 | 71013000710cb0a8 |
| federated, 219 MB | 26a1e121748f0f57 | 26a1e121748f0f57 |

Every report is identical. (19 of the 68 IDS files raise an error on these
IFC2X3 models on both sides; same as main.) `step-bytes.test.mjs` parses
text and bytes side by side: the sample model, eager and lazy, comments,
complex instances, `\X2\` and `\S\` escapes, raw UTF-8 (ü, 日本, an emoji),
a 17-digit entity number, files cut short inside a record and a comment, and
`.ifc`, `.ifcxml` and `.ifczip` through `readModel`.

## Memory

`sh eval/min-heap.sh <dir> <model> STEP LO HI [script ids...]`: the smallest
`--max-old-space-size` at which the script finishes. `eval/parse-only.mjs` by
default; `eval/heap-compare.mjs` with the IDS files for a full check. These
eval scripts now pass `read.bytes ?? read.text`, so main gets its text.
`node --expose-gc eval/retained-heap.mjs`: heap kept after parsing, the
file's text excluded. Node v22.23.5, 4 vCPU, single runs.

| model | smallest heap to parse, main | this change | kept after parse, main | this change |
|---|---:|---:|---:|---:|
| HHS MEP (16 MB steps) | 112 MB | 64 MB | 51 MB | 53 MB |
| HHS architect (16 MB steps) | 48 MB | 32 MB | 21 MB | 22 MB |
| Schultz Residence (16 MB steps) | 64 MB | 48 MB | 35 MB | 36 MB |
| federated, 219 MB (16 / 32 MB steps) | 512 MB | 304 MB | 273 MB | 277 MB |

The federated model, full check:

| | main | this change |
|---|---:|---:|
| smallest heap, three starter IDS (32 MB steps) | 544 MB | 352 MB |
| smallest heap, all 68 IDS (64 MB steps) | 640 MB | 448 MB |
| 68 IDS wall time (one run, another job running) | 23.0 s | 23.6 s |

The kept heap grows 1-4 MB: a string read from a record (a GlobalId, a name)
is a V8 slice of that record's decoded string, which it keeps alive; before,
it was a slice of the file's string, which was kept anyway.

Speed: the checks decode a record each time they read one that is not kept
(geometry, property values). On HHS MEP with all 68 IDS, three alternating
runs: main 1.98, 2.13, 1.98 s; this change 2.19, 2.07, 2.16 s (about 5%
slower). The same run with a plain `Uint8Array` and `TextDecoder` (the
browser's path) took 2.20-2.34 s.

## Files past V8's string limit

A JavaScript string holds at most 536,870,888 characters, so main could not
read a STEP file larger than that at all. A 670 MB federated model (the 219 MB
one's nine exports, three times over; 11,013,837 entities):

| | main | this change |
|---|---|---|
| `node cli.mjs fed650.ifc samples/coordination-basics.ids.xml --json` | `error: Cannot create a string longer than 0x1fffffe8 characters` in 0.4 s | report in 13.9 s (7 specifications) |

On this change it parses in 8.1 s and keeps 768 MB after parsing; the
smallest heap that parses it is 832 MB, and 896 MB with the three starter
IDS files (64 MB steps). Built with `eval/federate.mjs fed650.ifc` and the
nine files of the 219 MB model's command, listed three times.

## The page

`node eval/page-smoke.mjs <dir> architect.ifc` in Playwright's Chromium
against `python3 -m http.server 8765 --bind 127.0.0.1`: the sample button, a dropped `.ifczip`, `.ifcxml`
and the 13 MB HHS architect `.ifc` each give a report (49, 49 and 224,884
entities), the editor's "Open a model" lists the sample's classes, and the
console shows no errors.

## Not done

- ifcXML is still decoded to one string (its reader is text-based), so the
  500 MB string limit still applies to ifcXML.
- The bytes-path `Reader` decodes each record to a string; a reader over the
  bytes themselves would skip that copy, at the cost of a second reader to
  keep in step with the first.
