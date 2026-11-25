---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): backup packets, the application or change order plus its backup in one PDF

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#92 (merged).

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
orientation 6 were checked by eye. After merging main: unit 328/328, worker 213/213, build, provisioning test and the migration drift check clean (private Actions had no runner, so verified locally).

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

## Update: photos straight from the phone camera (private PR 117)

Later the same day (Duncan-Haywood/private-monorepo#117), ROADMAP "Attachments, part 2". The
attachments panel on a pay application and on each change order has a **Take a photo** button.

What it does:

- On a phone it opens the rear camera (`capture="environment"`).
- It asks for JPEG or PNG, the two photo types the backup packet can place.
- The shot is saved as a photo whatever the Kind list says.
- It is renamed from the phone's `image.jpg` to its capture time, `Photo 2026-11-25 14.05.09.jpg`
  (`cameraPhotoName` in `src/shared/attachments.ts`).

No server change, no migration.

**Why it matters to a buyer.** A GC asks for photos of the work and of stored materials as backup
with a pay application. Those photos are taken on site, on a phone. Before this, the foreman took
the picture, found it in the camera roll, then uploaded it; now it is one tap. And ten files all
named `image.jpg` would make the packet's index useless.

**Choices to keep.**

- The name is set in the browser but still goes through `cleanFileName` on the Worker.
- Times use dots, not colons, because `:` is stripped from names.
- The camera is a second `<input>`, so "Add files" still takes any type and many files.

**Not checked on a real phone.** No test shows whether iOS sends JPEG or HEIC for this `accept`
list. A HEIC that still arrives gets the packet's existing "send separately" note.

Shrinking large photos before upload is ROADMAP part 3. It is held back because a canvas re-encode
drops the EXIF time and location, which a contractor may want as proof.

**Duplicate-work note.** This run first built the reminder switch (ROADMAP "Getting started,
part 4"). It dropped that work unopened when PR 116 merged the same feature 3 minutes before this
run's push. Re-list the private repo's PRs (all states, newest first) right before pushing, not
only at the start of the run.

**Verified locally** (payapps CI has no runner):

- typecheck and biome
- unit tests: 406/406
- worker tests for attachments, change-order attachments and the packet: 20/20
- build
