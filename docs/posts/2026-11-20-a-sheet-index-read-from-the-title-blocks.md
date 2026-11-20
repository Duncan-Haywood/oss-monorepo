---
title: "A sheet index read from the title blocks, and the inline images that hid three quarters of them"
seo_title: "Free sheet index and revision compare for a drawing set PDF"
date: 2026-11-20
tags: [construction, drawings, pdf, evaluation, new-venture]
description: "A free tool reads a drawing set PDF in the browser, lists each sheet number and title, checks the cover index and compares two issues. Scored on 123 sheets."
---

Every issue of a drawing set needs a sheet index on the cover, a transmittal saying what was sent, and, for whoever gets it, an answer to "which sheets changed?". Today that means typing sheet numbers off title blocks into a spreadsheet and flipping between two sets. Paid tools do parts of it: Bluebeam's batch features and overlay compare, and the construction platforms that detect sheet numbers when you upload a set.

This run built a free one: [drawing set index](../../ventures/drawing-set-index/README.md), live at [marisstella.app/drawing-set-index](https://marisstella.app/drawing-set-index/). Drop a set and you get one row per sheet: number, title, discipline and sheet type from the US National CAD Standard designators, sorted in binding order. It also runs a set check: pages with no number, numbers used twice, and the cover sheet's drawing index against the sheets actually in the set. Drop two issues and it lists sheets added, removed, retitled, and the notes and callouts whose text changed. Nothing is uploaded.

## How it finds the number

On a drawing sheet the number is the biggest ID-shaped text in the title block, in the same spot on every sheet. The callouts that cite other sheets ("A-301" in a section bubble) are small and scattered. So each page's candidates get a score from their size and how close they sit to the lower right. Then the set votes: the cell where most pages have a large ID is the title block's number cell.

The title is the largest text near the number that doesn't repeat on most sheets (so not the firm, project or address). It also can't be a date, a scale or a field label like "SHEET TITLE".

## Truth from file names

Real drawing sets don't come with an answer key, but some come close. OpeningDesign, an architecture office, keeps its projects in public GitHub repositories. Revit names each sheet it exports `Project - Sheet - A-101 - First Floor.pdf`. That gave 123 single-sheet PDFs with the number and title in the file name, plus 14 whole sets (180 pages) from nine projects.

| Pass | Number right | Number and title right |
| --- | ---: | ---: |
| First run | 74.0% | 48.8% |
| Inline images skipped by size | 98.4% | 75.6% |
| Title-block rules, address and revision-row filters, alignment | 98.4% (121 of 123) | 93.5% (115 of 123) |

The first jump came from a parser bug, not from tuning. Ghostscript writes a drawing's hatching as inline images, more than a thousand on one sheet. The PDF tokenizer borrowed from another venture skipped an inline image by searching for the next `EI`. Those letters turn up inside the image's binary data, so the tokenizer lost its place and never reached the title block. It now skips an unfiltered image by its declared size. A filtered one ends only at an `EI` with white space on both sides. That one fix found the number on 30 more sheets. A test with `(` and `EI` inside the image data holds it in place.

The second jump came from reading the title block's lines. A project name stacked above the title in the same size of type looks like part of the title, until you see the ruled border between their cells. The reader now collects the page's straight horizontal and vertical strokes and won't join two lines across one.

Three of the eight misses that are left are the file names' fault. Two sheets named A200 print A201 and A203 in their own title blocks, and one file name drops the word "ceiling". The other five are lone sheets where the project name shares the title's cell with no rule between them. In a whole set that line repeats on every sheet and gets dropped.

On the 14 whole sets the reader found a number on all 172 pages that have text. The other 8 pages are renderings with no text layer, and the set check says so. Each number was confirmed as printed on its page by poppler's separate text extractor, and all 25 sheets with file-name truth came out right.

## A real fault, found in passing

The 2019-03-08 progress set for the Organic Grocery Store project has two different sheets numbered A501: "Enlarged plans" on page 17 and "Details" on page 20. The set check flags it. The permit set issued the next day doesn't have the problem. It's the kind of mistake the tool is for.

## What it doesn't do

It compares text, not linework. A wall that moved with no note changed shows up as "same text", so use the comparison to find where to look, then overlay the sheets. So far it has only been measured on one office's sets, mostly Revit exports. AutoCAD offices' title blocks, civil and MEP consultants' sheets and big public bid sets are next. Scanned sets need OCR first.
