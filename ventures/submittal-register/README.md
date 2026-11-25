# Submittal register

Drop a construction project manual (spec book) PDF and get a **submittal
register**: every Part 1 submittal requirement, by specification section,
typed (product data, shop drawings, samples, certificates, O&M data,
warranties) and phased (action, informational, closeout), exported as CSV.
Runs in the browser with no upload, or as a CLI. FSL-1.1-MIT licensed, no
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

**Submit requirements outside Part 1** (2026-11-24). Spec writers also put
submittals in Part 2 and Part 3 ("Submit field test reports within 24 hours")
and in Part 1 articles that are not submittal lists (QUALITY ASSURANCE,
WARRANTY). Every such sentence that obliges someone to submit something
("Submit ...", "..., submit ...", "shall be submitted", "furnish ... reports to
the Architect") is listed separately with its section, part, article,
paragraph, type, any deadline it states ("within three (3) days after
testing", "prior to installation") and the Part 1 row it seems to restate.
Mentions are skipped ("as submitted and approved", "submit in accordance with
Section 01 33 00"). The match compares the Part 1 label with what the sentence
asks for (the words after the verb, a run-in heading, the article title);
generic words such as "test" or "plan" never match on their own. A row no
Part 1 row covers is a likely missed submittal: the page lists them first and
can add them to the register, and the CLI writes them with `--buried-csv` or
adds them with `--with-buried` (flag `outside-part-1`). How well it works:
[`eval/buried-2026-11-24.md`](eval/buried-2026-11-24.md) (on two held-out
samples of 40 from 690 UFGS sections, 79 of 80 were real submit
requirements and 43 of 49 suggested Part 1 matches were right).

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
node cli.mjs book.pdf --buried-csv outside.csv         # also: submit requirements outside Part 1
node cli.mjs book.pdf --with-buried --csv register.csv # register + the ones no Part 1 row covers
```

Exit code 1 when no submittal was found. Tests: `node --test engine.test.mjs page.test.mjs schedule.test.mjs`.

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

## Submittal schedule from a P6 schedule (2026-11-22)

A register says *what* to submit; a submittal schedule says *when*. Add the
project schedule and every submittal gets a **Submit By** date:

```
node cli.mjs book.pdf --schedule schedule.xer --csv submittal-schedule.csv
node cli.mjs book.pdf --schedule activities.csv --review-days 10 --working --cycles 2 \
  --lead "05 12=56, 08 71=70, 26 24=120" --pin "09 68 00=A2340" --data-date 2026-03-02
```

On the page, open "Submittal schedule" under the register and choose the
`.xer` (or a CSV with an activity name and a start column, such as a P6 or
Microsoft Project export to Excel saved as CSV). It is read in the tab, like
the book.

How the date is worked out (`schedule.mjs`):

1. **Need-by date.** Each spec section is matched to the first activity that
   installs its work: an activity whose ID or name carries the section number
   (`09 91 23`, `099123`) wins outright; otherwise activity names are scored
   on the trade words for that section (`WORK_TERMS`, keyed by MasterFormat
   level 3, then the level-2 group, then the division) plus the section
   title's own words. Submit, approve, procure, scaffolding and change-order
   activities, milestones, and activities that read more like another trade's
   work are skipped; text in parentheses (a location) is ignored. Of the
   activities within one point of the best score, the earliest start is the
   need-by date, since the first install is what a late submittal holds up.
2. **Review time.** Read from Division 01 when the book states it ("Allow 15
   days for initial review", "at least 15 working days", "fourteen (14)
   calendar days"), else 14 calendar days, and the page says which. Times the
   number of review cycles (default 2: a first review and one resubmittal).
3. **Lead time.** Fabrication and delivery days per section or prefix, which
   you enter (no default is assumed: a schedule without them gives the latest
   date the review can start before fabrication must).
4. **Submit By** = need-by - lead - review x cycles. Closeout submittals (O&M
   data, warranties, extra stock) are due one review period before the
   schedule's last finish. With a data date (the XER's own, or `--data-date`)
   rows already past their date are flagged late.

The CSV adds Submit By, Need By, Activity ID, Activity, Matched On, Review
Days, Review Cycles, Lead Days and Late at Data Date, sorted soonest first.
Sections with no activity are listed; pin them with `--pin` or the page's
pin box.

**How well it matches** ([`eval/schedule-match-2026-11-22.md`](eval/schedule-match-2026-11-22.md)):
545 UFGS work sections against four public P6 schedules (a hotel, a
hospital, an airport terminal, an expressway). On a held-out sample of 80
section-to-activity pairs, read by one reader, 58 (72.5%) were the right
activity, 2 an earlier related one and 20 (25%) wrong. The misses are mostly
a generic word standing in for a product ("door" taking the first door of any
material). So the Matched On column is there to be read: check each
section's activity before you send the schedule, and pin the wrong ones.

## Limits

- The register is Part 1 submittal articles; submit sentences elsewhere are a
  separate list whose Part 1 match is a word comparison, wrong about one time
  in eight on UFGS (eval/buried-2026-11-24.md). Requirements that never use a
  submit verb ("the Contracting Officer will review the installer's
  certificate") are not found, and Division 01 general requirements apply on
  top.
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
`sample.mjs`, `schedule.mjs` (XER/CSV schedule reader, section-to-activity
matching, Division 01 review period, submit-by dates), `usage.mjs` (anonymous feature counts that stay in the
browser), `eval/`.

## Next

1. Score one or more real public-agency SectionFormat project manuals against
   a hand-made register; fix what that shows.
2. Submittals named in Part 2 and Part 3: shipped 2026-11-24 (above). Next:
   read the outside-Part-1 list on a real SectionFormat project manual; a
   second reader for the 80 judgments; match on synonyms the misses showed
   (lubricant/lubrication, employment records/qualification) and on the object
   past 12 words when it names a section noun ("location of all cut CMU").
3. Submittal schedule: shipped 2026-11-22 (above). Next: weigh material
   words (aluminium, steel, wood) so "door" stops taking the first door of any
   kind; score a real job's spec book against its own schedule; a second
   reader for the match judgments.
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

FSL-1.1-MIT (see `LICENSE`). Product and company names are used only to describe
alternatives; this project is not affiliated with them.
