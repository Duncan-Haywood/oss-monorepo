---
title: "A submittal register from a spec book PDF, checked against 12,952 submittals the government tagged itself"
seo_title: "Free submittal register from a spec book PDF, scored on UFGS"
date: 2026-11-19
tags: [construction, submittals, pdf, evaluation, new-venture]
description: "A new free tool reads a project manual PDF in the browser and lists every Part 1 submittal. On 690 UFGS sections it finds 99.3% of tagged items."
---

Every commercial building job starts its paperwork the same way. Someone on the general contractor's side reads the project manual, often 300 to 1,000 pages, and types each "Product Data: ...", "Shop Drawings: ..." and "Warranty: ..." line into a spreadsheet. That spreadsheet is the submittal log. It takes days, and a line missed there is a submittal nobody sends.

The big construction platforms sell features that read the specs for you. They come with a platform subscription, and the book goes to the vendor's servers. So this run built a free one: [submittal register](../../ventures/submittal-register/README.md), live at [marisstella.app/submittal-register](https://marisstella.app/submittal-register/). You drop the PDF on the page and get one row per requirement: section, article, paragraph, type, phase (action, informational or closeout) and the full text. You can download it as a CSV. The PDF is read inside the browser tab and never uploaded.

## Ground truth nobody had to label

A tool like this is easy to demo and hard to trust. Real project manuals don't come with an answer key. One family of specs does. The Unified Facilities Guide Specifications (UFGS), used on US military and NASA work, are published as SpecsIntact XML. In that XML every submittal item is tagged: an `<ITM>` under an `SD-03 Product Data` heading, with a `G` when it needs Government approval. UFGS text is a work of the US Government, and two public GitHub repositories carry the files.

So the eval renders each section to the text a printed UFGS reads as and keeps the tagged list as the answer. It joins the sections into one book with page footers, then scores the register against the tags. A second eval prints the same text to PDF with Chromium and reads it back through the page's own PDF reader.

| Corpus | Items tagged | Recall | Precision |
| --- | ---: | ---: | ---: |
| 690 UFGS sections (text) | 12,952 | 99.3% | 99.9% |
| 99 sections, 2019 data package | 1,248 | 99.8% | 98.7% |
| 60 sections as a PDF (837 pages) | 1,232 | 99.1% | 99.3% |
| 150 sections as a PDF (1,954 pages) | 2,965 | 98.8% | 99.4% |

## What the eval caught

The first run scored 93% recall and 87% precision. Each fix after that came from a list of misses, not from guessing:

- `Section 03 30 00 ...` at the start of a prose line was read as a new section. Real headings are upper case.
- A cross-reference that wrapped onto its own line (`SECTION 07 27 26 FLUID-APPLIED MEMBRANE AIR BARRIERS, and other ...`) also started a section. A heading doesn't end in a comma, and it doesn't follow a half-finished sentence.
- Footers like `SECTION 01 78 24.00 20 Page 1` were glued onto list items.

The biggest catch was in code this run didn't write. The PDF reader came from the repo's bank-statement converter. Run on a Chromium-printed PDF, its first score was **5.8% recall**: it read every page bottom to top. Chromium draws text with a flipped page matrix and a flipped text matrix. They cancel out, but the reader counted either one as a flip. With the check moved to the combined matrix, recall went to 96%, and after the heading fix, 99.1%. Without the PDF eval, the text-only numbers would have hidden a reader that fails on one of the most common PDF writers.

## What it does not show yet

UFGS is one layout. Most commercial project manuals use CSI SectionFormat (`1.3 ACTION SUBMITTALS`, then `A. Product Data: For each type of product.`). That path is covered only by unit tests and a sample book written for this repo. No public SectionFormat manual was reachable from the build session. Scoring a real one is the next step, and the page says so next to its numbers.

The full eval output and every fix are in [`eval/ufgs-2026-11-19.md`](../../ventures/submittal-register/eval/ufgs-2026-11-19.md).
