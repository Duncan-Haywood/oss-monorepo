---
title: "A header size checker that ships no code values, on purpose"
seo_title: "Window and door header size checker from your own span table"
date: 2026-11-07
tags: [wall-framing-takeoff, tools, construction]
description: "Paste the header span table from your code or engineer, list your openings, and see which header each needs and which hand-picked ones fall short."
---

The framing takeoff has picked headers from a user's span table since October (`headers.mjs`), but only the command line could use it. It now has a page: `header-calculator.html`.

You paste the rows from the span table that applies to your load, building width and stud size (longest clear span, header size, plies), and list your openings. An opening marked `auto` gets the first row that covers its width. A header you chose yourself is kept and flagged UNDER if it is shallower or has fewer plies than your table asks for. An opening wider than the table's longest span is an error, not a guess.

The sample table is made up and says so. Header sizing is engineering with liability attached, so the tool checks your table against your openings and never supplies the numbers. With the sample, a 4 ft window takes two 2x8s from the table, a 3 ft door with two 2x6s is OK, and a 6 ft window with two 2x8s is UNDER (the table asks two 2x10s).

Checked: the page's figures are pinned to the engine in `page.test.mjs` (104 tests pass), and the page loaded in headless Chromium with no errors and the same output. Not checked: any real code table or a real house. It is linked from every calculator page and the sitemap.
