# White space between XML elements skipped (2026-11-18)

The flagship row's next item was "skip white-space-only text runs in the XML
reader", left open by `eval/ifcxml-bytes-2026-11-18.md` ("Not done"). The
reader decoded every text run to a string, including the line break and
indentation between tags, and appended it to the open element's `text`. On an
ifcXML model that means one decode and one string append per element. Worse,
the `<uos>` element holding every entity stays open for the whole file. So
its `text` grew into a rope of one piece per entity, held until the file
ended, even though no reader ever looks at it.

## What changed

`xml.mjs`, both readers (string and bytes):

- Once an element has had a child element, a text run of only XML white space
  (space, tab, CR, LF) inside it is skipped. The bytes reader checks the bytes
  and never decodes the run.
- White space the element held before its first child is dropped when that
  child starts.
- A per-depth flag records "has had a child", because the ifcXML reader's
  `onClose` removes each entity from its parent as it closes, so
  `children.length` falls back to 0.
- An element with no child element keeps its text exactly (`<Name> </Name>` is
  still one space at the XML level). Text with anything else in it, CDATA
  sections and character references (`&#32;`) are kept as written.

The only text this drops is white space between elements. Every reader of
`.text` in the checker either reads elements with no children (`ifcxml.mjs`
values, IDS `simpleValue`, `fix.mjs` dates) or only asks whether the text has
non-white-space in it (`structure.mjs` `hasText`, `ids.mjs` info fields). The
one change in meaning is mixed content, text and elements side by side, which
neither IDS nor ifcXML uses: it now loses only the white-space-only runs
between elements. `structure.mjs` quotes such text with its white space
collapsed, so the quote is unchanged.

`xml-whitespace.test.mjs` covers both readers: leaf text kept, parent
indentation dropped, CDATA and `&#32;` kept, a child removed by `onClose`
still counting, and the indented sample model reading the same as itself with
every run of white space between tags removed (args and shallow args, lazy and eager).
`node --test *.test.mjs`: 262 pass, 0 fail.

## Models

The same real exports as `eval/ifcxml-bytes-2026-11-18.md`:
`opensourceBIM/IFC-files` at `cb96c50` (HHS Office MEP and Schultz Residence),
written as ifcXML with `eval/step-to-ifcxml.mjs`, plus the federated model
(`eval/federate.mjs` over HHS MEP, MEP2, architect and construction, then
`eval/step-to-ifcxml.mjs`, 374 MB, 1,623,230 entities).

`step-to-ifcxml.mjs` writes one entity per line with no indentation, but real
exports are indented (every xBIM test file in `eval/xbim`, for one). So each
file was also run indented, through the new `eval/indent-xml.mjs`: every
element on its own line, two spaces per level, leaf text untouched. HHS MEP
grows from 152 to 185 MB, Schultz from 93 to 113 MB, federated from 374 to
455 MB.

Main is `origin/main` at `29a15c065`, unpacked with `git archive`. Node
v22.23.5, 4 vCPU, single runs unless noted.

## Same reports

`eval/heap-compare.mjs`, all 68 IDS files (3 starter and the 65 public ones
from `eval/fetch-audit-corpus.sh`), `maxFailed: 1000`, each report hashed
with `seconds` removed:

| model | main | this change |
|---|---|---|
| HHS MEP, flat | 8ada0722d8343e8e | 8ada0722d8343e8e |
| HHS MEP, indented | 8ada0722d8343e8e | 8ada0722d8343e8e |
| federated, flat | c273964046439ba3 | c273964046439ba3 |
| federated, indented | c273964046439ba3 | c273964046439ba3 |

Every report is identical, and indenting a model does not change its report
on either side. (The HHS MEP hash differs from the one in
`ifcxml-bytes-2026-11-18.md` because main has gained checks since; both
sides here are today's.)

## The reader alone

`node --expose-gc eval/xml-reader-cost.mjs <checker dir> file` runs the bytes
reader with every element below the root dropped as it closes, the way the
ifcXML reader drops each entity. Best of three runs, and the highest heap
above the starting point seen across them (sampled every 20,000 closed elements):

| file | elements | main | this change |
|---|---:|---|---|
| HHS MEP, flat, 152 MB | 3,289,614 | 1.81 s, 40 MB | 1.58 s, 2 MB |
| HHS MEP, indented, 185 MB | 3,289,614 | 2.32 s, 53 MB | 1.89 s, 2 MB |
| Schultz, indented, 113 MB | 1,985,408 | 1.44 s, 39 MB | 1.22 s, 2 MB |
| federated, flat, 374 MB | 8,072,098 | 4.44 s, 72 MB | 4.24 s, 4 MB |
| federated, indented, 455 MB | 8,072,098 | 6.36 s, 106 MB | 4.49 s, 4 MB |

The 40-106 MB on main is the `<uos>` rope: one piece per entity, held until
the file ends. With it gone, the reader's own working heap is a few MB at any
file size, and the reader is 5-29% faster.

## Smallest heap that finishes

`sh eval/min-heap.sh`, `--max-old-space-size` searched in the steps shown:

| model, script | main | this change |
|---|---:|---:|
| HHS MEP flat, parse (16 MB steps) | 192 MB | 192 MB |
| HHS MEP indented, parse (16 MB) | 208 MB | 192 MB |
| federated flat, parse (32 MB) | 448 MB | 416 MB |
| federated indented, parse (32 MB) | 480 MB | 416 MB |
| federated indented, all 68 IDS (64 MB) | 512 MB | 448 MB |

Indentation no longer costs heap: an indented file parses in the same heap as
the same model written flat.

## Whole checks

The same `heap-compare.mjs` runs, wall time for the parse and all 68 IDS
files:

| model | main | this change |
|---|---:|---:|
| HHS MEP, flat | 8.6 s | 9.4 s |
| HHS MEP, indented | 9.5 s | 9.0 s |
| federated, flat | 27.5 s | 26.2 s |
| federated, indented | 28.8 s | 26.0 s |

The parse is a small share of a 68-IDS check, so these move within
run-to-run noise (the flat HHS MEP row went the other way). The heap sampled
at the checks (every 20 ms) is not a fair comparison either: with less
garbage the collector runs later, so the sampled peak lands at different
points (federated flat 781 MB on main and 913 MB here; the smallest-heap
search above, 512 to 448 MB, is the real limit).
`retained-heap.mjs` (heap kept after the parse): unchanged on every model
(HHS MEP 177 to 176 MB, Schultz 84 to 84, federated 404 to 403). The rope was
dropped with `<uos>` at the end of the file on main too.

## The page

`node eval/page-smoke.mjs <dir> schultz-indented.ifcxml` in Playwright's
Chromium against `python3 -m http.server 8765 --bind 127.0.0.1` (the browser
takes the `TextDecoder` path): the sample, the dropped `.ifczip` and
`.ifcxml`, and the 113 MB indented Schultz model (424,819 entities, 7.2 s)
each give a report, the editor opens a model, and the console shows no errors.

## Not done

- The ifcXML reader reads an all-white-space string as `""`
  (`ifcxml.mjs` `attrValue`), unlike STEP, where `IFCLABEL('  ')` stays two
  spaces. That was so before this change and is unchanged here. XML Schema's
  `xs:string` keeps white space, so the STEP reading looks right, but no real
  file has shown the case yet.
- IfcTester's narrower bare `\w` (`eval/xsd-regex-2026-11-18.md`) is still
  open.
