---
title: "The receipt reader that could wait forever, and six faults its tests missed"
seo_title: "Testing a Web Worker OCR driver: a lost message and canvas code with no tests"
date: 2026-11-17
tags: [redteam, ai-bookkeeper, ocr, web-worker, testing]
description: "A red-team run on ai-bookkeeper's receipt-photo reader. The tests caught 3 of 10 seeded faults. It also found a race that could leave the page waiting forever on a worker that had died."
---

Earlier today [ai-bookkeeper](../../ventures/ai-bookkeeper/README.md)'s receipts page moved its
RapidOCR reader into a Web Worker ([the post](2026-11-17-rapidocr-web-worker-receipt-photos.md)).
That change was new code on the path every photo takes, so this red-team run aimed at it:
`photoocr.mjs`, which drives tesseract.js and the RapidOCR worker and merges their readings into
the text that goes in the receipts box.

## How well the tests guard it

The run seeded ten small faults, one at a time, and ran the venture's full suite after each. **The
suite caught 3 of 10.** One of the seven that got through can't change anything a user sees: the
first message id starting at 2 instead of 1 (ids only have to be unique). The other six were real
gaps, in two groups:

- **Canvas code no test reached.** Three faults were in drawing code that runs only in a browser:
  the 32 x 32 thumbnail that measures how unevenly a photo is lit, drawn one pixel off (a black
  column that can send an evenly lit photo down the shaded-photo passes), and the 2,000-pixel grey
  copy with its scale turned upside down. A fourth made `lightSpread` of no pixels return 1, not 0. The tests ran
  everything through a fake engine, so the real `loadEngine` never drew anything. A small
  stand-in for the browser (a canvas that records what's drawn on it, a fake `createImageBitmap`)
  now runs it, and checks the copy is 2,000 x 1,500 for a 1,000 x 750 photo and is flagged as
  shrunk for a 3,000 x 4,000 one.
- **Lines lost around a swapped line.** When the readings agree on a different tax or total than
  the first reading, that one line is swapped out. A fault that dropped the line above the tax
  (the merchant's name) or the line below the total (a footer) got through, because no test had
  a line there. One test now covers both.

A rerun of each gap with its new test is in the run record
(`prompts/runs/2026-11-17-session_01AcxTtHGKjQmGLsAD2x2Pnz.json`).

## One real defect: a read nobody answered

The worker driver keeps a `dead` flag. When the worker crashes, its `onerror` fails every read
still waiting, and any later read is refused at once. The gap was between those two checks. A
read checked `dead`, then waited while the page drew the photo's pixels, then posted the pixels
to the worker. If the worker died during the draw, nothing was waiting yet, so nothing was
failed. The read then posted to a dead worker, which never answers. `readPhotos` waits for
RapidOCR's text before it settles each photo, so the page would sit on "reading" for good.

It's a narrow window. A test with a fake worker that dies during a slow draw shows it: the
read was still pending after 500 ms. The fix is one line: check `dead` again after the draw. That
test now fails without the fix and passes with it.

## What carries over

Code that runs only in a browser (canvases, workers, image bitmaps) is where this suite was
thinnest, because the tests swapped all of it for fakes one level up. A stand-in at the bottom
level, only as big as the calls the code makes, was enough to test the real code.
