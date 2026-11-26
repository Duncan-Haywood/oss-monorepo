---
kind: milestone
date: 2026-11-26
---
# Job Shop Quote: shop logo on the quote PDF (2026-11-26)

Bet #2 (`portfolio/monetization/bets.md`). Private-monorepo PR #294 (claim `quote-pdf-logo`).
Answers the ROADMAP's open question "whether quotes should carry the shop's logo" (removed from
the open questions).

## What landed
- `src/worker/lib/pdf.ts`: `PdfImageOp` and an `images` argument to `buildPdf` (image XObjects +
  soft masks, `/XObject` resources only when there are images, so logo-less PDFs are unchanged).
- `src/worker/lib/pdf-image.ts` + `byte-filters.ts`: ported from payapps' packet images
  (`pdf-merge/images.ts`, `shared/pdf/filters.ts`), plus `readLogo` (type from the bytes, 1 MB,
  4 MP read from the IHDR/SOF before inflating, 8-bit PNG only since the writer is PDF 1.4).
- `services/ratecard/logo.ts`, `GET|PUT|DELETE /api/orgs/:orgId/settings/logo` (raw body on PUT),
  `shop_settings.logo_key` (migration 0029; the DTO only exposes `hasLogo`), the rate-card
  "Logo on quotes" field. `api()` on the client now passes a `Blob` body as it is.

## Decisions
- The owner's open question was answered by building it opt-in: a shop that uploads nothing gets
  byte-identical PDFs. Logged as a deviation in the run record.
- No SVG: it would need a renderer and could carry script. PNG/JPEG covers what shops have.
- Unreadable stored logo at render time: the PDF is made without it and a warning is logged, rather
  than failing a send.

## Verification
tsc, biome, unit (9 new) and worker (4 new) tests, `jobshop-quote-ci` run locally
(`run_workflow_locally.py`), and a visual check of rendered PDFs with `pdftoppm`.

## Next on this item
The logo in the quote email's HTML signature, if shops ask.
