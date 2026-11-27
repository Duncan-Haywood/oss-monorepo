# Submittal log

Per job, under **Submittals** on the job page (`/orgs/:orgId/projects/:projectId/submittals`).
A specialty sub sends the GC shop drawings, product data, samples and the rest for review before
it can release material; the log keeps what went, what came back, and which ones put the
material's delivery at risk.

## What is stored

One row per revision (`submittals`, migration 0057): number, revision, spec section, title, type,
the GC's own number, sent, required back by, returned, the GC's action (approved, approved as
noted, revise and resubmit, rejected, received for record), needed on site, lead time and review
days (calendar days), notes. Numbers run per job (the next free one by default); a number and
revision are fixed once made. **Resubmit** on a returned "revise and resubmit" or "rejected"
submittal adds the next revision with the same number, title and schedule facts, nothing returned,
so the first revision's dates stay on the log.

## What is worked out (`src/shared/submittals.ts`, pure, tested)

- **Status**: not submitted, with the GC (days out), closed (approved, as noted, for record),
  resubmit needed, or superseded (a later revision exists; only the newest counts anywhere).
- **Overdue back**: with the GC past the required-back date.
- **Submit by**: needed on site − lead time − review days (zero if not typed). Flagged "late to
  send" once today is past it and it has not gone.
- **Delivery at risk**: when it comes back (returned date; or the required-back date, or sent +
  review days, never earlier than today while still out; or, for a resubmittal, today + review
  days), plus the lead time, lands after needed on site. Null when the dates to tell are missing.

"Today" is the browser's own date on the page, and the `?today=` the page passes to the CSV, so the
flags turn over at the user's midnight. Nothing assumes a review period or a lead time: every
number is one the user typed.

## Transmittal cover sheet

**Transmittal** on each row downloads a one-page PDF to put on top of the submittal
(`services/export/submittal-transmittal-pdf.ts`, our own layout, not a published form): to the GC
(with the PM's name and email when the job has them), from the company, the date (the sent date, or
the day it is printed when not yet sent), the job, the submittal number and the GC's reference; what
is enclosed (spec section, type, title, revision); the action requested as checkboxes (for
approval, for review and comment, for record, for information); "please return by" (the
required-back date, else sent + review days); the needed-on-site date and lead time when typed, so
the reviewer sees why the date matters; for a resubmittal, the revision it replaces and what the GC
said about it; the notes as remarks; and a box for the reviewer's stamp (or the action recorded,
once it came back). The action requested is not stored: the page's picker sends it as
`?requested=`, and without one test reports, certificates, O&M manuals and warranties go for
record and everything else for approval (`defaultTransmittalRequest`).

## Files with a submittal

Each revision keeps its own files (`submittal_files`, `services/payapps/submittal-files.ts`): the
product data sheets, shop drawings, calculations and certificates sent to the reviewer, photos of a
sample or mock-up, and the stamped copy the reviewer returns. The same rules, bucket and storage
limit as pay-application files (`src/shared/attachments.ts`: extension allow-list, 15 MB a file,
20 a submittal, one company-wide limit by plan), keys under
`orgs/{orgId}/projects/{projectId}/submittals/{submittalId}/`, so deleting the submittal or the job
clears them. A resubmittal is a new revision with no files: what changed goes with it.

The transmittal lists every file but the returned stamped copy under "Files enclosed", oldest
first, with its kind. "With files" (`packet.pdf`) is the transmittal, an index, then those files as
uploaded (PDFs page for page, JPEG and PNG photos one to a page; a spreadsheet or an unreadable file
is named on the index instead), one PDF to send the reviewer, built by the same packet code as a
pay application's backup.

## Across jobs: the weekly email and the projects page

`submittalsToChase` lists, across the company's active jobs, the newest revision of each submittal
that is waiting on someone: **overdue back** from the GC (past the required-back date), **late to
send** (not sent, past the submit-by date), or **to resubmit** (returned "Revise and resubmit" or
"Rejected" with no next revision entered). Delivery-at-risk ones come first, then most days late.
The weekly email ("Submittals to chase", capped at ten, the rest counted) and a box on the projects
page list them, each linking to the job's submittal log; one alone is enough to send the email.
Closed jobs are left out, and the sample job is left out of the email. The page passes the
browser's date as `?today=`; the email uses the day it goes out.

## Importing a register or the spec

"Import from the register or the spec" on the log reads a file in the browser
(`src/shared/submittal-import-file.ts`; the file is never uploaded) and lists the submittals it
finds for the user to check, retitle, retype or untick before they are added as the next numbers
(`POST .../submittals/import`, all rows in one transaction, the job's 500 limit counting what is
already there):

- **The GC's register** as .xlsx, CSV, or a PDF printed from their system. The header is found
  under a title block; columns are matched by common names (spec section, number, title or
  description, type, due date, required on-site date, lead time, review time). Division heading
  rows and repeated page headers are left out and listed. Lead and review times are read as
  calendar days ("14", "14 days", "3 weeks" is 21); business or working days are left blank and
  kept in the notes, since calendar days would need the job's work calendar. A date or type the
  reader cannot place stays in the notes rather than being guessed.
- **The spec sections** for the sub's scope, as the architect's PDF (text layer, up to 400 pages
  per file) or a whole book's text. The reader is `src/shared/spec-submittals.ts` (pure, tested),
  and it reads two layouts:
  - **SectionFormat** (most US project manuals). Under each `SECTION 09 21 16` heading (also
    `092116`, five-digit 1995 numbers, the title on the next line), every lettered paragraph of an
    article whose numbered heading names submittals (SUBMITTALS, ACTION, INFORMATIONAL, CLOSEOUT,
    MAINTENANCE MATERIAL, SUSTAINABLE DESIGN; title case too) becomes a row. It is titled "Gypsum
    Board Assemblies: Shop Drawings" and typed from the words before the colon (warranty before
    samples, test reports before certificates). The paragraph and its sub-paragraphs go in the
    notes. A paragraph that is only a name ("Welding certificates.") or says what to submit
    ("Submit shop drawings ...", "Furnish extra materials ...") counts too.
  - **UFGS** (federal jobs). Under "1.2 SUBMITTALS", each line below an `SD-02 Shop Drawings`
    heading is a row, typed by the SD number unless the number leaves it to the item's name (SD-01,
    05, 08, 11). The approval code ("; G", "; G, AE", "; S") stays in the notes. The guide spec's
    brackets and the editor's notes between rows of asterisks are ignored, and agency suffixes
    ("02 62 13.00 10") are kept.

  Procedure paragraphs ("Submit the following in accordance with ...", "General: ...") are listed
  as skipped, with the reason. Division 01 is left out, because it sets the procedures rather than
  a trade's items. Running headers and footers are dropped: the same line, digits ignored, at the
  top or bottom of three or more pages, plus "09 21 16 - 3" and "SECTION 09 29 00 Page 3". Mockups
  or tests asked for under QUALITY ASSURANCE are not read, since they are not in a submittals
  article. Sections with no submittals article are counted, so the user checks them by hand.

  Measured 2026-11-26 on the 54 trade sections of the 2019 UFGS data package
  (github.com/vdubya/Open-Built-Environment-Datasets), rendered with page footers by oss-monorepo
  `ventures/submittal-register/eval/ufgs.mjs`, against each section's tagged `<ITM>` list: **865
  of 869 items found, none extra**. The four missed are items named twice in one section, which
  are listed once. Also checked on two published PDFs: UFGS 09 29 00 from wbdg.org gave 25 rows,
  and a school district's SectionFormat 092900 gave both of its rows. The tests use our own wording
  in each layout. For a whole project manual, the free
  [submittal register](https://marisstella.app/submittal-register/) is the deeper reader: it reads
  every volume and finds submit requirements outside Part 1.

What is never imported: sent and returned dates and the GC's action (a register says what is due;
the log records what happened). Rows already on the log (same spec section and title) are
unticked. Tests: `src/shared/submittal-import.test.ts` (Chromium-printed register and spec PDFs in
`test/fixtures/`), `test/unit/submittal-import-ui.test.tsx`, `test/worker/submittals.test.ts`.

## API

`GET/POST /api/orgs/:orgId/projects/:projectId/submittals`, `PATCH/DELETE .../:id`,
`POST .../:id/resubmit`, `POST .../import` (`{ items: [...] }`, no sent/returned dates or action), `GET .../log.csv?today=YYYY-MM-DD`,
`GET .../:id/transmittal.pdf?today=YYYY-MM-DD&requested=approval|review|record|information`,
`GET .../:id/packet.pdf` (same query), `GET/POST .../:id/attachments` (multipart, field `file`,
`category` backup|photo|signed|other), `GET/DELETE .../:id/attachments/:attachmentId`. Every member
reads; editors and up write. `GET /api/orgs/:orgId/submittals/to-chase?today=YYYY-MM-DD` (every member, read-only)
lists the submittals to chase across jobs. On every plan. Every query filters by org; another company's job or submittal is a 404
(`test/worker/submittals.test.ts`, `test/worker/submittal-files.test.ts`).

## Reading the stamp

Editing a submittal shows "Read the stamp": pick the returned copy attached to it (files filed as
"Signed/stamped copy" come first) or any PDF on the computer, and the browser reads the reviewer's
action and date from it (`src/shared/submittal-stamp.ts`, client `components/stamp-reader.tsx`).
"Fill in" puts them in the form's Returned and GC's action; nothing is saved until Save. The file
never leaves the browser for this.

What it reads, with fixed rules and no model:

- the stamp as markup over the page (Bluebeam and Acrobat stamp annotations, and typed-on text
  boxes: their appearance text and /Contents) and as text printed into the page;
- the reviewer phrases in common use (`STAMP_PHRASES`: "No exceptions taken", "Make corrections
  noted", "Furnish as corrected", "Revise and resubmit", "Rejected", "Submit specified item",
  "Received for record", the stock "Approved", "Approved as noted", "Not approved" and more), only
  where a phrase stands as a stamp entry (at the start of a line or after a box, and followed by the
  end of the line, another box or a dash), so "an approved equal" in a data sheet is not a stamp;
- which box is ticked, when the tick is text (☒, ✔, [X], an X before the choice);
- the date labelled DATE in the stamp (US M/D/Y, ISO, or with the month spelled out), else the one
  date it shows, else the date the PDF records the stamp annotation was placed, said as such.

What it will not guess: a stamp that lists every choice with the tick drawn as lines (no text says
which), two stamps that disagree (the GC's and the architect's), more than one date, a date after
today or before the submittal was sent, and a scan with no text layer. Each is said in a sentence
and leaves that field for the user. Every phrase found is listed with its page and box, so the user
checks the reading against the file before saving. Tests: `src/shared/submittal-stamp.test.ts`,
including a page printed by Chromium (`test/fixtures/submittal-stamp-chrome.pdf`).

## Not yet

Spec sections from a scan (OCR); a register's status column read into the GC's action; OCR of a
scanned stamp with no text layer. ROADMAP "Next" has the order.
