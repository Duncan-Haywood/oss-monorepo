# The check as an HTML report (2026-11-21)

**Question.** A BIM manager who checks a consultant's model has to send the
result back. The page offered BCF (for the BIM tool), CSV and JSON, none of
which a project manager or a consultant's lead opens and reads. Can the
checker write one file a person reads, that is complete and correct on real
exports and real IDS files, and stays a sane size when a specification fails
hundreds of thousands of elements?

## What landed

`html-report.mjs` (`htmlReport(report, opts)`), the page's *Download report
(HTML)* button (usage event `html_report_downloaded`) and
`node cli.mjs model.ifc spec.ids --html report.html`. One file, no external
fonts, scripts or images; light and dark; prints with every section opened.
Contents: verdict, model and IDS, a per-specification table (applicable, pass,
fail, pass rate), three tallies (the requirements that fail most, failures by
IFC class, the elements failing the most specifications), duplicate GlobalIds,
and each specification's failing elements with GlobalId and reason. A small
inline script adds a filter over element rows and opens sections for print;
the report reads fully without it.

## Setup

- IDS: the 65 public files `eval/fetch-audit-corpus.sh` fetches (64 read; 5
  pairs are IDS read errors, the one unreadable file on 5 models).
- Models: HHS Office architect, construction and MEP and OpeningDesign's
  Schultz Residence from `opensourceBIM/IFC-files` at `cb96c50` (fetch steps in
  `model-attr-codes-2026-11-17.md`), plus `samples/tiny-house.ifc`.
- `node --max-old-space-size=8192 eval/html-report.mjs MODELS eval/corpus/real [OUT]`
  writes each report, reads it back and compares it with the report object.

## Result

| Model | Pairs | Failing pairs | Failure rows written | Pairs with a mismatch | Largest report |
| --- | ---: | ---: | ---: | ---: | ---: |
| hhs-architect.ifc | 64 | 61 | 31,597 | 0 | 2446 KB |
| hhs-construction.ifc | 64 | 60 | 18,773 | 0 | 2278 KB |
| hhs-mep.ifc | 64 | 58 | 27,567 | 0 | 2053 KB |
| schultz.ifc | 64 | 61 | 20,566 | 0 | 2159 KB |
| tiny-house.ifc | 64 | 62 | 800 | 0 | 154 KB |

- 320 pairs, 2,535 specifications. Failure rows: 99,303 expected, 99,303
  written; 0 specification sections with another row count.
- The summary table's Fail column equals the exact failing count on all 320
  pairs (11,614,492 failing results in all).
- 14,488,028 reasons, every one filed under a requirement its specification
  lists (0 left over), so the "Where to start" tally has no catch-all row.
- 0 files with unbalanced `table`, `tr`, `tbody`, `details` or `summary` tags.
- Size: mean 153 KB, largest 2.39 MB. Rendering: mean 51 ms; slowest 8.7 s,
  HHS MEP against the Dutch NL-BIM Basis ILS (5,321,789 failing results), after
  a 27.0 s check of the same pair.
- Page (Chromium, sample model): the button downloads
  `tiny-house-ids-report.html` with the same verdict as the page, no page
  errors. On a 390 px viewport no element outside a table's own scroller is
  wider than the screen.

## What the first run found

Writing every row failed: on HHS MEP, 66 specifications across the corpus
fail more than 1,000 elements, the largest 665,224 (a specification with no
entity facet applies to every entity), and joining the rows passed
JavaScript's 512 MB string limit (`RangeError: Invalid string length`). So
each specification writes its first 1,000 failing elements (`maxRows`) and
says "Showing 1,000 of N failing elements"; all 66 carry that note. Counts and
tallies use every listed failure.

The first tally pass took 17.4 s on that pair (sets per class, arrays of spec
names per element). Plain counters with spec names fetched only for the 25
elements shown brought it to 7.3 s, and checking the separator character
before `startsWith` in `requirementOf` to the 8.7 s total above; most of what
remains is garbage collection of a report object holding 14 million strings.

## Limits

- The tallies count listed failures: a report checked with `maxFailed` (CI)
  says so in the file.
- Not yet read by a consultant or a BIM manager; whether the three tallies are
  the ones they want is a question for a real user.
- English only.
