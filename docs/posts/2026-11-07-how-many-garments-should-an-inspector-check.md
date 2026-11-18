---
title: "How many pieces should a final inspection check on a clothing order?"
seo_title: "Clothing final inspection sample size: exact maths, no AQL table"
date: 2026-11-07
tags: [clothing-design-studio, manufacturing, tools]
description: "A free calculator for the sample size and accept number of a garment final inspection, with the chance a lot passes at each defect rate."
---

A small brand paying a factory's balance usually relies on one inspector pulling some pieces from the cartons. How many, and how many defects is too many? Published AQL tables answer it, but they are copyrighted lookups that hide what the numbers mean.

The Clothing Design Studio now has a [final inspection calculator](https://marisstella.app/clothing-design-studio/inspection.html). It uses exact sampling without replacement (the hypergeometric distribution), so it is right for small orders too. Give it the lot size, the defect rate of a lot you would happily accept, and the rate you would refuse, and it finds the smallest sample that fails the bad lot and passes the good one. For 1,000 pieces, 2.5% against 10%, it says inspect 77 and accept 4, close to the familiar 80 and 5 plan. Then type what the inspector found: the page says pass or fail and the highest defect rate the result still hides (zero found in 80 of 1,000 can still mean about 3.6% bad).

Limits: it does not copy the ISO 2859-1 tables, so check a contract's named plan against the standard, and no real inspection report has been through it yet. The code and tests are in the repository (MIT).
