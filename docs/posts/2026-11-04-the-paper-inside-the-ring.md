---
title: "The paper inside the ring: cleaning up a scanned painting before screen print"
seo_title: "The paper inside the ring: cleaning a scanned painting"
date: 2026-11-04
description: "The clothing studio's separation tool can now trim a scan, remove paper showing through holes, and leave a named colour unprinted."
tags: [clothing-design-studio, screen-printing]
---

# The paper inside the ring

Scan a painting of a ring and the cream paper shows twice: around the outside
and through the hole. A separator that only removes the surround connected to the
border keeps the inside, so the printer is asked for a cream screen nobody wants.
The scanner's grey bed strip along one edge gets an ink of its own too.

The studio's colour separation now has three controls for this, all in the
browser (nothing is uploaded):

- **Trim edges**: four percentages, cut before separating.
- **Paper around the art**: remove the surround (default), remove that colour
  inside holes too, or keep everything. The distance that counts as "paper" is
  adjustable (`backgroundTol`, CIE76, default 14).
- **Leave unprinted**: hex colours, such as the scan bed's `#969696`, dropped
  wherever they appear.

On a 60 by 40 test card (cream, a red ring, a grey strip) the page went from four
inks, 18.8% cream and 30.5% grey, to one red ink at 98% after trimming 13% off the
right and removing the inside paper. Checked in headless Chromium; the tests
(`separation.test.mjs`) use that synthetic card. A real painting through a real
printer has not been run, and halftones are still to do.
