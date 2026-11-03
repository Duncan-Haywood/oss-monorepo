---
title: "Fuzzing the wall shop drawings: 150 random houses, no broken sheets"
seo_title: "Property-testing generated framing shop drawings (HTML and PDF)"
date: 2026-11-02
tags: [construction, testing, wall-framing-takeoff]
description: "A seeded test draws 150 random wall plans through the HTML and PDF drawing writers and checks every sheet is whole. It found nothing, which is worth stating."
---

The wall-framing takeoff writes a shop drawing per wall, as HTML and as a hand-built PDF with no library. Until now they were tested on the example house and one 133 ft wall. A crew would print them, so a malformed file matters.

`drawings-fuzz.test.mjs` draws up to 150 seeded random plans (one to four walls, 2x4 or 2x6, 16 or 24 in spacing, random doors and windows, labels containing `<` and `&`, optional shop-panel limit, panel sheets and sheathing weight). For each it checks:

- one HTML sheet per wall at least, balanced `<svg>` tags, no `NaN`, `undefined` or `Infinity`, labels escaped;
- every member has a mark and the parts table adds up to the member count;
- the PDF starts with `%PDF-`, ends with `%%EOF`, its `startxref` points at the `xref` table, and it has at least one page per wall.

Result: it passed on the first run (about 10 s), over more than 100 valid plans. No bug found. That says the writers are robust on machine-generated plans; it does not say the layout looks right on a plotter or an architect's real house, which is still untested (see the README).
