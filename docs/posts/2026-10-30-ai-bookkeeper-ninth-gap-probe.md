---
title: "Bookkeeping rules for rideshare drivers, photographers, pet groomers, home daycares and detailers"
seo_title: "Bank-line categories for gig drivers, photographers and daycares"
date: 2026-10-30
tags: [ai-bookkeeper, categorization, evaluation]
description: "A ninth probe of 52 made-up bank descriptors: 32 right before new rules, 52 after. One miss was a clipper-card rule catching Wahl hair clippers."
---

The [AI bookkeeper](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/) files bank lines with built-in keyword rules before any learning happens. To find where those rules are thin, we write bank descriptors for a kind of business we have not covered and count what the rules do with them.

This round covered rideshare and delivery drivers, photographers, pet groomers and sitters, home daycares and mobile detailers: 58 descriptors, expected account fixed before the first run. The rules filed 30 right, 6 wrong and 22 not at all. We corrected two expectations of our own (an oil change is vehicle cost, a CACFP reimbursement is sales) and dropped six lines that could fairly go several ways, such as camera gear (supplies or equipment) and a van lease.

The most instructive miss: "Wahl Clipper" went to travel, because an older rule reads "clipper" as a transit card. The new pet-supply rule now sits ahead of it. Other additions: Getaround, Stride mileage tracking, Splice, Zenfolio, Procare, Himama, NAPPS and NAEYC dues, Discount Tire, state child-care subsidy payments.

After the rules, 52 of 52 descriptors file correctly. That number is tuned on the same list, so it counts coverage, not accuracy. All descriptors are made up from public company names; no real bank export was used. Labelled real books are still what the project needs most.
