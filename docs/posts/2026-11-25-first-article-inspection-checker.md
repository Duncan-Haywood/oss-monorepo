---
title: "A first article inspection checker that reads the drawing's callouts and flags what gets an FAI sent back"
seo_title: "First article inspection checker: AS9102 Form 3 results against limits"
date: 2026-11-25
tags: [for-customers, machine-shop-guides, jobshop-quote, as9102, first-article-inspection, quality, aerospace, lead-magnets]
description: "Paste a first article's ballooned characteristics and results: each callout read into limits, each result judged, and a Form 3 style CSV. Free, in the browser."
---

An aerospace or defense first article report is usually a spreadsheet: one row per balloon on the drawing, the requirement copied from the callout, the measured value, the gauge, and a nonconformance number if it failed. That is AS9102 Form 3. Before it goes to the customer, someone checks every row against its tolerance by eye. On a 120-balloon part, that is where a reject without an NCR, a skipped balloon or a 4X hole with one reading gets through, and the report comes back.

The new **[first article inspection checker](https://marisstella.app/machine-shop-guides/first-article-inspection.html)** does that check. Copy the rows out of the spreadsheet and paste them in. Columns are found by their header (Char No., Requirement, Result, Tooling, NCR and the usual variants), and several result columns are read as several parts. Nothing is uploaded or saved.

## What it reads

Each requirement is read the way it is written on the drawing:

- `.500 ±.005` and `.500 +/- .005`; `.500 +.002/-.000`; limit dimensions such as `1.005/1.000` and `12.00-12.05`;
- `R.03 MAX`, `MIN .120`, `32 Ra`;
- geometric tolerances such as `⌖ Ø.010 Ⓜ A B C` and `Flatness .002`, read as zero to the tolerance;
- `4X` and `2 PLACES`, so four places need four readings;
- basic `[1.000]` and reference `(3.25)` dimensions, which are not inspected;
- threads and notes, which take ACC/GO/PASS or REJ/NO-GO/FAIL;
- a bare `2.500` with no tolerance, which takes the general tolerance you enter from the title block for its number of decimal places.

The limits it used are shown next to every requirement, so a misread is visible. A requirement it can't read is marked "not read". It is never passed.

## What it flags

- results outside their limits, and a reject with no nonconformance number;
- a balloon with no result, and balloon numbers skipped or used twice;
- fewer readings than places on a multi-place feature;
- "accept" written for a dimension that can be measured, since many customers want the actual value;
- readings within a set share of the tolerance band from a limit (10% to start). They pass, but are worth a gauge-capability check before the lot runs.

The download is a CSV with the Form 3 columns (char number, reference location, designator, requirement, results, tooling, nonconformance number) plus the limits, status and notes. Formula cells are neutralised and negative numbers are kept.

## Choices worth knowing

**Bonus tolerance is not added.** For a position at MMC, the checker judges the reading against the stated tolerance only. So a result it rejects might still be acceptable once the bonus is worked out. It never works the other way, where it accepts something the drawing would reject. The row says so.

**A zero-based tolerance is one-sided.** Flatness of .0001 against .002 is good, not "near a limit". An early build scored it as a two-sided band, which made a position of .0062 against .010 look like 24% used when it is 62%. The tests now pin that case.

**AS9102 is not reproduced.** It is an SAE standard, sold by SAE. The page describes the three forms and the usual triggers from customers' published supplier guides. The one dated rule it states comes from a customer clause, not the standard: Lockheed Martin's Q2A rev 12 asks for a full FAI after a production lapse of over two years (read 25 November 2026). Your own customer's clauses decide.

## Where it fits

The [RFQ review checklist](https://marisstella.app/machine-shop-guides/rfq-review.html) flags an AS9102 requirement in the RFQ, so the inspection time can go into the [quote](https://marisstella.app/machine-shop-guides/job-shop-quote-calculator.html). This page is the other end of that job. Both are free front doors to two products in development for small machine shops: an RFQ-to-quote assistant, and a CMMC and ISO 9001/AS9100 workspace where first articles would live next to the rest of the quality records. Neither is released yet. Early access is on the [manufacturing page](https://marisstella.app/industries/manufacturing/).

The checker is arithmetic on what you paste. It is not an inspection, an approval or a substitute for your quality system, and it is not affiliated with SAE or any customer named here.
