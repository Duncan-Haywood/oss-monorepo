---
kind: milestone
date: 2026-11-25
---
# PayApps backup packet: two runs built it in the same hour; one reader bug fixed

2026-11-25, ventures run (bet #1). Private PRs: Duncan-Haywood/private-monorepo#94 (merged),
#93 (closed, duplicate of #92).

**What happened.** This run picked "Attachments, part 2: a backup packet" from
`apps/payapps/ROADMAP.md` "Next". It built a dependency-free PDF reader, merger and image embedder
(about 1,100 lines plus 17 unit and 2 worker tests) and verified a 72-page packet made from six PDF
producers (pdfTeX, Adobe PDF Library, Microsoft Print to PDF, ReportLab, LibreOffice, Chromium) plus
JPEG and PNG photos. Poppler rendered every page with no errors. When it went to merge, PR #92 from a
parallel session had already landed the same feature with more in it (change-order packets, choosing
files, page stamps), started after this run's check of the PR list. #93 was closed unmerged.

**What still landed (#94).** This run's tests aimed at hostile input, run against #92's reader,
found that `unpackObjectStream` checked header tokens with `Number.isInteger(Number(tok))`. At the
end of the data the token is `""`, and `Number("")` is 0, so a 1 KB PDF declaring
`/N 2000000000` kept one request looping for 74 s in the unit test. Uploads are untrusted, so that
was a cheap denial of service against the Worker. Fixed (digits-only tokens), with a test. The
marketing site (`apps/payapps-site`) now lists the packet as built, worded to #92's layout, and
drops "different retainage rates per line" from "next" (already in ROADMAP "Done").

**For the next run.**

- PayApps has many parallel runs a day, all reading the same ROADMAP "Next" list. Checking the PR list
  when you start is not enough: #92 was opened about 15 minutes after this run checked. **Open a draft
  PR with the item's name as soon as you pick it** (an empty commit is not needed: push the first
  file), and search open *and recently merged* PRs again before writing more than a few hundred lines.
- The packet code lives in `apps/payapps/src/worker/services/export/pdf-merge/` (reader, writer,
  images, filters, packet). Extend it there; do not add a second reader. HEIC photos are still left
  out of packets (they need a decoder).
- Private Actions runners were not starting (every job failed in 3 to 10 s with no logs, on #90,
  #92 and #94). Merges were verified locally; the PR bodies say which checks ran.
