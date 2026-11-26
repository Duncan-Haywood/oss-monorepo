---
kind: milestone
date: 2026-11-26
---
# PayApps (bet #1): fill Textura's This Period billing upload from a pay app

2026-11-26, ventures run. Private PR: Duncan-Haywood/private-monorepo#241. ROADMAP Next #4,
"GC portal export formats", part 2c; claim `claim/payapps/gc-portal-textura-billing-upload`.
Follows the Procore parts (private PRs 221 and 224).

**What landed.**
- `apps/payapps/src/shared/gc-export/textura-billing.ts` (pure): reads the GC's Textura "Upload
  Billing Amounts" template (CSV, or a grid from the .xlsx via `readXlsx`), finds the columns from
  their headings, matches rows to the pay app's lines (phase code = item number, then description,
  then a unique budget; one row per line), and fills Work This Period (column E) and Material Stored
  This Period (the materials newly stored, the same numbers as `procoreInvoiceSheet`). Every other
  cell, the preamble, the delimiter and unmatched rows are written back unchanged. Retention cells
  are left alone.
- `apps/payapps/src/client/components/textura-billing.tsx`: a pay-app panel with column overrides,
  per-row match selects, warnings (lines on no row, budget differences, material with no column, the
  To Date template) and the download. Wired into `pages/pay-app.tsx` under the Procore sheet.
- The payapps-site feature bullet and the llms.txt "not built" line are updated. The customer post
  `docs/posts/2026-11-25-procore-subcontractor-sov-csv-template.md` is extended to Textura rather
  than written as a new post.

**Sources.** Oracle TPM help, "Importing a Payment Application from a File for Subcontractors"
(docs.oracle.com/cd/E97085_01/TPMhelp/en/Europe/10307605.htm), and the North America Subcontractor
Billing Workflow Guide PDF (field definitions for Work This Period, Material Stored This Period and
retention). Both were read 2026-11-26. The PDF's text streams were read with a zlib pass
(pypdf would not import in the container). Oracle does **not** publish the template's column
headings, so the reader matches on Textura's field names and lets the person point at another
column.

**Verification.** biome, typecheck, payapps unit tests (650, 13 new), build and payapps-site unit
tests (21), all green in the session. The workflow was also run locally with
`run_workflow_locally.py`; see the run record.

**What the next run should know.**
- Not tried on a real downloaded Textura template. The first customer on Textura should confirm the
  headings. If they differ, widen `ROLE_TESTS` with that customer's wording; the regexes are the
  only guess in the module.
- The To Date upload is not filled; the panel detects that template and asks for This Period. GCPay
  is still open in ROADMAP Next #4.
- Mississippi part 3 (§ 1-3-67) was skipped again. Justia, sos.ms.gov and casetext all returned
  403 or 410, and the search results disagree on the final-day wording, so it needs an official
  text first.
