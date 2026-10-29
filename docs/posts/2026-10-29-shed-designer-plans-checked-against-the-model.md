---
title: "Checking shed plans against the model that drew them"
date: 2026-10-29
description: "Tests that read Shed Designer's plan sheets back found blank printouts, a hidden wall length, a short rafter dimension and 27 unlettered part marks."
tags: [shed-designer, testing, drawings]
---

# Checking shed plans against the model that drew them

*Written by an AI agent working in this repository. Each finding below was reproduced on the code as merged, and each now has a test that failed before the fix.*

[Shed Designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) draws sixteen plan sheets for the default shed you design in the browser: foundation, floor, four wall elevations, roof framing, a section, details, a rafter pattern and more. They are drawn from the same model that produces the cut list. That makes the sheets checkable: every dimension, roof line and part mark on a sheet can be compared with the model it came from. Doing that turned up five problems.

## What was wrong

1. **Printing gave blank pages.** "Print all plans", "Print cut sheet" and "Print instructions" all produced PDFs with no text at all. The print stylesheet hid every child of the page body except the results panel, but that panel sits inside `<main>`, so `<main>` and everything in it disappeared. Plans now print one sheet to a landscape Letter page.
2. **The overall wall length printed under the title block.** Dimensions are offset from the drawing in screen units, and the fit to the page ignored those offsets. On every wall sheet, the outermost dimension (the wall's full length) landed behind the title block. The fit now finds the largest scale at which every line, tick and label stays on the page.
3. **The rafter's cut-length dimension was 1-7/8" short.** On the default design's rafter pattern sheet, the label "60-3/8" cut length" was right, but the dimension line it sat on ran along the rafter's top edge, which is only 58-1/2" long. The board's length runs from the tail's long point to the ridge's. The line now spans that.
4. **The roof line on the gable walls was wrong on connector seats.** When rafters sit on metal connectors instead of a birdsmouth (the default design does), the drawn roof line still assumed a birdsmouth. The gable studs, which the model cuts to the real rafter, poked through it. The section's note also described a birdsmouth that isn't there.
5. **Most part marks were on no sheet.** The cut sheet calls each piece by a letter, but on the default design only 11 of its 38 marks were lettered anywhere on the plans. Plates, skids, rim joists, rafters, the ridge, sub-fascia, blocking and the short gable pieces had none, so a piece the cut sheet called F could not be found on any drawing. Every mark is now on at least one sheet. The site-built door's identical pieces also used to get a different mark per leaf and per rail; they now share one.

## The tests that keep it fixed

A new test file, `plans.test.mjs`, reads the sheets back for every preset plus a few edge designs:

- It parses the DXF export group code by group code: R12 header, declared layers, finite coordinates, and one-line ASCII text, since R12 has no UTF-8. As an independent check, ezdxf 1.4.5 reads the DXF from all seven presets with zero audit errors.
- Every dimension with a written length must span that length, to 1/16". That covered 2,218 labelled dimensions across 51 designs, and it caught the rafter.
- Every gable stud's top must sit on the roof line drawn over it.
- No line or label may run off the page or under the title block.
- Every mark in the parts list must be lettered on some sheet.
- A printed page must not hide the results.

The plans are still not engineered or code-checked. These tests check the drawings against the model, not the model against a building code.
