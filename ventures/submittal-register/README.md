# Submittal register

Drop a construction project manual (spec book) PDF and get a **submittal
register**: every Part 1 submittal requirement, by specification section,
typed (product data, shop drawings, samples, certificates, O&M data,
warranties) and phased (action, informational, closeout), exported as CSV.
Runs in the browser with no upload, or as a CLI. MIT licensed, no
dependencies.

Live: https://marisstella.app/submittal-register/

## Why someone would use it

On every commercial job, a general contractor's project engineer (or a
subcontractor's PM) builds the submittal log by reading each section of a
300 to 1,000 page project manual and typing every "Product Data: ...",
"Shop Drawings: ..." and "Warranty: ..." line into a spreadsheet. It takes days
on a mid-size project and it is where missed submittals start.

What people use today:

- **By hand in Excel or Google Sheets**, from a log template. Free, slow,
  error-prone.
- **Spec-reading features inside paid construction platforms**, such as
  Autodesk Construction Cloud's AutoSpecs (from its Pype acquisition) and
  Procore's submittal builder. They are sold as part of platform
  subscriptions, which small GCs, subcontractors and owners' reps often don't
  have, and the book goes to the vendor's servers.

What this does differently: free, nothing uploaded (the PDF is read in the
browser tab), self-hostable, an open algorithm whose accuracy is measured and
published below, and a CSV that drops into whatever tool the team already
uses. It is not a full submittal workflow (review stamps, routing,
transmittals); it builds the starting log.

## What it reads

- **CSI SectionFormat books**: `SECTION 09 91 23 - INTERIOR PAINTING`,
  `PART 1 - GENERAL`, articles like `1.3 ACTION SUBMITTALS`,
  `1.4 INFORMATIONAL SUBMITTALS`, `1.5 CLOSEOUT SUBMITTALS`,
  `1.6 MAINTENANCE MATERIAL SUBMITTALS` (or a single `1.3 SUBMITTALS`), with
  lettered paragraphs (`A. Product Data: For each type of product.`) and their
  numbered sub-paragraphs. Each lettered paragraph is one row; a lead-in
  paragraph ("Submit the following:") gives its sub-paragraphs as rows.
- **UFGS books**: `1.3 SUBMITTALS` with `SD-01 Preconstruction Submittals` to
  `SD-11 Closeout Submittals` headings and one item per line; `; G` (and a
  reviewer code such as `; G, AE`) goes to the Approval and Reviewer columns.

Every row gets a type on one scale, the UFGS SD-01 to SD-11 descriptions,
which most owners' Division 01 submittal sections define or echo. For a
SectionFormat label the type comes from keywords (`Delegated-Design
Submittal` is SD-05 Design Data, `Qualification Data` SD-07 Certificates,
`Maintenance Data` SD-10, `Warranty` SD-11, and so on; `engine.mjs`,
`TYPE_RULES`). The phase comes from the article heading, or from the type when
the heading is just "SUBMITTALS". Flags: `engineer-sealed` (delegated design,
"signed and sealed"), `sustainability` (LEED, VOC, recycled content, EPD) and
`conditional` ("if requested").

Running headers and footers are removed (a line shape that recurs at the top
or bottom of a fifth of the pages), a table of contents does not create empty
sections (the copy of a section number with the most body wins), and a
cross-reference that wraps onto a new line ("SECTION 07 27 26 FLUID-APPLIED
..., and other") is not taken for a heading.

## Use it

Browser: open `index.html` (served over http; module workers do not run from
`file://`), choose the PDF or every volume at once, filter, and download the
CSV. A 2,000-page book reads in about half a minute; work happens in a Web
Worker so the page stays responsive.

CLI:

```
node cli.mjs project-manual.pdf --csv register.csv     # summary + CSV
node cli.mjs vol1.pdf vol2.pdf --json > register.json  # several volumes
node cli.mjs book.txt                                  # pdftotext output (form feeds = pages)
```

Exit code 1 when no submittal was found. Tests: `node --test engine.test.mjs page.test.mjs`.

CSV columns: Submittal No. (section + sequence, e.g. `099123-002`), Spec
Section, Section Title, Article, Paragraph, Submittal Type, SD, Phase, Title,
Description (full requirement text), Approval, Reviewer, Flags, File, Page,
then blank Status, Date Required, Date Submitted, Date Returned and Action
columns to work the log in.

## How it was checked

Ground truth with no hand labelling: UFGS sections are published as
SpecsIntact XML in which every submittal item is tagged (`<ITM>` under an
`SD-nn` heading). `eval/ufgs.mjs` renders a section to the text a printed
UFGS reads as, keeps the tagged list as truth, and `eval/ufgs-eval.mjs`
joins the sections into one book (with page footers) and scores the
register. `eval/ufgs-pdf-eval.mjs` prints the same text to PDF with Chromium
and reads it back through the page's own PDF reader. Full output and the fixes
each run drove: [`eval/ufgs-2026-11-19.md`](eval/ufgs-2026-11-19.md).

| Corpus | Items tagged | Recall | Precision |
| --- | ---: | ---: | ---: |
| 690 UFGS sections (text) | 12,952 | 99.3% | 99.9% |
| 99 UFGS sections, 2019 data package (text) | 1,248 | 99.8% | 98.7% |
| 60 sections printed to PDF, Arial (837 pages) | 1,232 | 99.1% | 99.3% |
| 150 sections printed to PDF, Times (1,954 pages) | 2,965 | 98.8% | 99.4% |

Of matched items, the SD code was right 99.7 to 100% and the G flag 99.9 to
100%. On UFGS the SD code comes from the list heading, so these numbers mostly
measure finding sections and items, not keyword typing.

**Not yet measured:** a real commercial (SectionFormat) project manual. The
SectionFormat path is covered only by the unit tests and the sample book in
`sample.mjs`, both written for this repo. No public SectionFormat project
manual PDF was reachable from the build session; the next run should score
one or more public-agency bid project manuals against a hand-made list.

## Limits

- Part 1 submittal articles only. A requirement written only in Part 3
  ("submit test reports to the Architect") is not listed, and Division 01
  general requirements apply on top.
- Needs a text layer. A scanned book needs OCR first (the page says so).
- Article headings must be upper case and numbered (`1.3 ACTION SUBMITTALS`);
  books that use `ARTICLE 1.3` or unnumbered headings will under-read.
- Types for SectionFormat labels are keyword rules; an unusual label lands in
  "Other" or the nearest type. Review the list.

## Files

`engine.mjs` (sections, articles, items, types, CSV), `pdf-text.mjs` and
`pdf-parser.mjs` (text with positions from a PDF, copied from
`ventures/bank-statement-pdf-to-csv` with one fix: line order on pages drawn
with a y-down matrix), `inflate-browser.mjs`, `worker.mjs`, `cli.mjs`,
`sample.mjs`, `usage.mjs` (anonymous feature counts that stay in the
browser), `eval/`.

## Next

1. Score one or more real public-agency SectionFormat project manuals against
   a hand-made register; fix what that shows.
2. Submittals named in Part 2 and Part 3 ("submit ... for approval"), as a
   separate, flagged list.
3. A schedule: required-on-site dates from a project schedule CSV minus review
   and lead times per type, so the log says when each submittal is due.
4. Division 01 defaults (copies, review periods) read from 01 33 00 and
   applied to every row.
5. An import CSV laid out for the common construction platforms' submittal
   imports.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, construction, engineering or
professional advice, and it does not replace a qualified professional or the
design team. It reads the text of the book you give it and can miss or misread
requirements; the contract documents and the architect's and engineers'
instructions govern. **You are responsible for reviewing and verifying its
output before relying on it**, and for meeting any obligation it helps you
prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

## License

MIT (see `LICENSE`). Product and company names are used only to describe
alternatives; this project is not affiliated with them.
