---
kind: milestone
date: 2026-11-26
---
# CMMC Providers form: upload the service description and CRM in place (2026-11-26)

Private PR 310 (`Duncan-Haywood/private-monorepo`, claim
`claim/cmmc/esp-upload-from-providers-form`, ROADMAP Next #4, the "upload a file straight from the
Providers form" part).

- The service description and CRM fields on the Providers form each have "Upload a file here". The
  file goes to the org's evidence with no requirement attached (`POST /evidence`, the same no-CUI
  attestation), and the field picks it at once. Before this a shop had to open some requirement's
  page, upload the file there (tying it to an unrelated requirement), and come back.
- After "Fill from the matrix" the CRM field offers the matrix it just read, so one file choice
  fills the marks and keeps the document as evidence.
- `uploadType(name, browserType)` in `apps/cmmc/src/client/views/EvidenceUpload.tsx` sends a
  `.csv` labelled `application/vnd.ms-excel` (Windows browsers) or an untyped `.xlsx` as its
  extension's type. The server's allowlist is unchanged and still decides. The other upload forms
  in the app (requirement evidence, network diagram, quality) do not use it yet. If a shop reports
  "Upload a PDF, image, text, CSV, DOCX or XLSX file" on a real .csv, wire them to `EvidenceUpload`
  or `uploadType`.
- Client only: no route, schema or migration change.
- Verified locally because CI had no runners (jobs red in 3 s): typecheck clean, 346 unit and 107
  worker tests pass, build ok.
