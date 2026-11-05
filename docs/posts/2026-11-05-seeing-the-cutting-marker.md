---
title: "Showing a designer where every piece goes on the cloth"
date: 2026-11-05
description: "The clothing design studio now draws each cutting marker to scale and exports a cut ticket CSV, so a designer can show a factory the layout behind the cloth estimate."
tags: [clothing-design-studio, manufacturing, tools]
---

# Showing a designer where every piece goes on the cloth

The clothing design studio's size page already worked out how much cloth a run needs by packing
pattern pieces onto the fabric width. It printed a number. A designer asked by a factory "how did
you get that?" had nothing to show.

Today the packer keeps where each piece lands. Each lay now opens as a scale drawing: cloth, the
selvedge margins, and every body, sleeve, cuff and hood panel labelled by size. Hover a piece for
its measurements. A "Download the cut ticket (CSV)" link gives one row per size in each lay with
pieces per marker, lays, plies, garments cut, spares and cloth in metres, and a total row.

Checks run: a test that no two pieces overlap and none leave the usable width for a 150-piece
hoodie run, a test that the CSV totals match the plan (pieces, spares, metres), and a Chromium load
of the page with no errors. The venture's 229 tests pass.

Limits, stated on the page: pieces are rectangles on the grain, so the drawing is more wasteful than
a CAD marker that nests the curves, and a nesting gain shortens the quoted length but not the
drawing. The factory's own marker wins. Still unproven: a real factory's marker against this one.

Try it: the size page of the [clothing design studio](https://marisstella.app/clothing-design-studio/fit.html).
