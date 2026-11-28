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

## Before the checker: the list itself (added 28 November 2026)

The checker starts from a list someone already typed. On a new part, typing it is the slow step: reading every callout off the drawing, numbering it, and copying the requirement into a row. [Job Shop Quote](https://jobshop-quote.marisstella.app/sign-up?from=first-article-post) now drafts that list from the drawing that came with the RFQ. On the RFQ page, a drawing PDF with a text layer gets a **First article list (CSV)** link. The download is a Form 3 draft, numbered in reading order so the numbers can become the balloon numbers:

- toleranced dimensions (`3.250 ±.005`, `4X Ø.201 +.003/-.000`, `1.0005/1.0000`, `45° ±1°`) with their lower and upper limits;
- geometric tolerances (`POSITION ⌀.010 A B C`, `⏥ .002`), from zero to the tolerance;
- threads (`1/4-20 UNC-2B X .50 DP 2 PL`, `M6x1.0-6H`) and surface finishes (`32 RMS`, `Ra 0.8`);
- each numbered drawing note, and the MATERIAL and FINISH lines;
- `4X` or `2 PL` repeated as 6.1 to 6.4, one row per place.

The title block's general tolerance is printed at the top and never applied to a bare number. Bare numbers aren't listed at all, because the date, the scale and the drawing number are bare numbers too. On an invented test drawing, the 16 rows came out in the expected order, with the expected limits, and nothing came from the title block. The test is in the app's code.

It is a draft, and the file says so. A PDF's text layer holds only what was written as text. A dimension drawn as geometry, a boxed basic dimension or a feature control frame drawn as lines is not in it, and neither is anything on a scanned drawing. The text also has no positions, so the drawing zone column is left for the inspector, along with the designator and the results. Paste the finished rows into the checker above to judge them.

## Then the results, in the same list (added 28 November 2026)

Beside the CSV link there is now **Inspect first article**, which opens the same list as a screen in the app. For each row, the inspector types the drawing zone, the result, the gauge and, on a reject, the nonconformance number. A row turns accept, reject or open as it's typed, using the same rules as the checker above:

- a measured row accepts when every reading is inside its limits, limits included. `3.250 3.251 3.256` against `3.250 ±.005` rejects, and the row says `3.256 is over the upper limit 3.255 in`;
- a surface finish has only a maximum, so only the maximum is checked;
- a thread gauge, a note or a material certificate needs "accept" or "reject" written in words. A number on one of those rows stays open;
- anything it can't read stays open. It is never accepted;
- a reject with no nonconformance number keeps the sheet from showing as complete.

A false read from the drawing's text can be marked "not a characteristic". It stays on the sheet and is left out of the counts. A characteristic the text missed, such as a boxed basic dimension or a frame drawn as lines, can be added with its own limits. It's numbered after the drafted rows. The results are saved with the drawing. From then on the Form 3 CSV carries them, with a count line at the top (accepted, rejected, open) and a verdict and reason on every row.

It is still arithmetic on the limits listed, not a sign-off. The inspector checks the list against the drawing and signs the report. Forms 1 and 2 and the balloons on the drawing are not drawn yet.

## Where it fits

The [RFQ review checklist](https://marisstella.app/machine-shop-guides/rfq-review.html) flags an AS9102 requirement in the RFQ, so the inspection time can go into the [quote](https://marisstella.app/machine-shop-guides/job-shop-quote-calculator.html). This page is the other end of that job. Both are free front doors to two products for small machine shops. Job Shop Quote, the RFQ-to-quote app, and CMMC Workspace, for CMMC and ISO 9001 records, are both open on a free plan, and neither one's paid plans are on sale yet. See the [manufacturing page](https://marisstella.app/industries/manufacturing/).

The checker is arithmetic on what you paste, and the draft list is a reading of the drawing's text. Neither is an inspection, an approval or a substitute for your quality system, and neither is affiliated with SAE or any customer named here.
