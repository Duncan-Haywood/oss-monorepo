---
title: "Wall framing takeoff now writes its shop drawings as a PDF"
date: 2026-10-27
description: "The framing shop drawings used to need a browser's print-to-PDF. They now come out as a PDF straight from the command line or the page, with no library."
tags: [wall-framing-takeoff, construction, framing]
---

[wall-framing-takeoff](../../ventures/wall-framing-takeoff/) already drew one sheet per wall: every stud, king, jack, header and plate marked, rough openings dashed, plate joints in red, a dimension chain and a parts table. Until now that was an HTML page you had to print to PDF yourself, which is awkward from a script or a build server.

`node cli.mjs plan.json --pdf > walls.pdf` (or the new button on the page) now writes the PDF directly: one landscape Letter page per wall, with a continued page when a wall has more parts than fit. Add `--panel-max=12ft` and the shop-panel cut lines and letters are drawn too. The writer is about 200 lines with no dependency; it uses the standard Helvetica font, so nothing is embedded.

What was checked: the file's xref offsets and stream lengths in tests, text with brackets and non-Latin characters in labels, and a render through poppler on the example house (8 pages) and on a 133 ft wall with 24 windows. What was not: other PDF viewers, printing on paper, or a real framer's use of the sheets. Not engineering or building-code advice.
