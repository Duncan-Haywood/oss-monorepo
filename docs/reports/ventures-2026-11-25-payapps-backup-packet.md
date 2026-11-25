---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): backup packets, the application or change order plus its backup in one PDF

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#92.

**What landed.** A pay application now downloads as one PDF to send the GC: the application, an
index page, then its attached backup (`GET .../pay-apps/:payAppId/packet.pdf`, "PDF with backup"
on the pay-app page). PDFs go in page for page, JPEG and PNG photos one to a page, and every page
is stamped "Application #7 - page 12 of 40". By default every file but the signed application goes
in, backup first, then photos, then other. The attachments panel has an "In packet" tick per file.
A change order downloads the same way: the request plus its backup, not the signed copy, in the
order of the request's "Backup attached" list (`.../change-orders/:coId/packet.pdf`). A file that
cannot go in (a spreadsheet, a Word file, an iPhone HEIC photo, an encrypted or damaged PDF) is
listed on the index page with the reason and what to do instead. This closes the ROADMAP items
"Attachments part 2: a backup packet" and "Change orders part 4: one PDF packet".

**Why it matters to a buyer.** GC billing clerks want one file per sub per month, and "missing
backup" is a common reason a pay app gets kicked back. Today a sub merges the files by hand in
Acrobat, or sends a dozen attachments. The packet makes the file that gets reviewed, and the page
numbers give both sides a way to cite a page.

**How it works, for the next run.** There is no PDF library: the app's rules forbid new
dependencies, and the existing writer (`services/export/pdf.ts`) only writes. The new
`services/export/pdf-merge/` has four parts:

- `objects.ts` + `reader.ts`: the tokenizer and reader. It handles classic xref tables, xref
  streams with PNG predictors, object streams, incremental updates (`/Prev`, hybrid `/XRefStm`), a
  recovery scan when offsets are wrong, and inherited page attributes. It reads every object once
  on open, so one bad offset sends the whole file to recovery instead of failing halfway through a
  copy.
- `images.ts`: JPEG headers (size, colour model, Adobe CMYK inversion, EXIF orientation 1-8) and
  PNG (passed through with the predictor; palette tRNS and alpha become soft masks).
- `writer.ts`: copies each page's object graph with new numbers. It never copies a source catalog
  or page tree, and wraps each page's content in q/Q. The stamp is placed upright for /Rotate 0, 90,
  180 and 270 inside the crop box.
- `packet.ts`: selection, the 40 MB input budget and the index. The index lists page numbers that
  depend on its own length, so it settles in one or two passes.

**Hardening, keep it.** Inflate is capped at 64 MB per file, and at the exact expected size for
PNGs (zip bombs). Nesting depth is limited to 200, and a PDF to 500 pages. JavaScript, Launch,
SubmitForm, ImportData and media actions, and `/AA` triggers, are dropped from copied pages. The
output streams out as the chunks it was built from, which share memory with the inputs.

**Verification.** 14 unit tests on hand-built files, including a compressed xref with an object
stream, an incremental update, broken offsets, a missing xref, an encrypted file, hostile nesting,
a zip bomb and script stripping. 4 workerd tests cover selection, order, a damaged upload, roles,
tenancy and the change-order packet. 71 pages from pdfTeX, Microsoft Print to PDF, Adobe PDF
Library, Skia, ReportLab, Matplotlib and LibreOffice files were rendered with poppler (`pdftoppm`,
which the cloud container has) and compared with `compare -metric AE` against the originals. They
are identical apart from the roughly 105-pixel stamp. A rotated page and a phone photo with EXIF
orientation 6 were checked by eye. After merging main: unit 328/328, worker run in the PR notes.

**Next, by value.** (1) PDFs encrypted with an empty user password: bank and insurer downloads are
often "restricted" this way. It needs MD5, RC4 and AES-CBC/SHA-256 in the reader; Web Crypto covers
AES and SHA, while MD5 and RC4 are about 80 lines. (2) HEIC photos, which need a decoder, so likely
convert-on-upload in the browser. (3) Drag to order the packet. Local poppler plus `compare` is a
cheap regression harness for any change to the reader: copy a few real PDFs to a scratch
directory, merge, and diff page renders.

**Public side.** The pay-application guide (`ventures/pay-app-guides/how-to-fill-out-a-pay-application.html`)
gained "Send the backup as one PDF". It covers the order a GC reviews, and the fixes for HEIC
photos, locked PDFs and spreadsheets, without naming PayApps (publishing under the name is the
owner's step).
