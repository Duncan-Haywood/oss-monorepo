---
title: "Print a sewing pattern at home: a tiled PDF with a ruler check"
seo_title: "Free tiled PDF sewing pattern for A4 or US Letter, tee and crewneck"
date: 2026-11-09
tags: [clothing, patterns, tools]
description: "The free pattern maker now writes a 1:1 tiled PDF for A4 or Letter, with a calibration page, crop marks and overlap lines."
---

The pattern maker in the clothing design studio drafts a tee, long sleeve or
crewneck with a sleeve cap solved to the armhole. Until now it handed you SVG
and DXF, which suits a plotter but not a kitchen table. It now also writes a
PDF you can print on a normal printer and tape together.

Page one is a calibration sheet: a 5 cm square and a 10 cm line. If your
ruler disagrees, the printer scaled the page; reprint at "actual size". Each
piece then gets a grid of pages with a 1 cm overlap, corner crop marks, a
dotted line where the next page starts, and a row and column label. Cut lines
are solid, stitch lines dashed, and the grain line has arrow ends.

A size L tee comes to 17 pages on A4. The file is written by about 100 lines of
dependency-free JavaScript and checked for exact xref offsets and stream
lengths, then read by poppler. What is not yet proven: a printed, taped and
sewn garment. The block proportions are typical drafting ratios, not checked
against a real sample. Try it at `ventures/clothing-design-studio/pattern.html`.
