---
title: "We tried to break the S-corp calculator with 400 random businesses"
date: 2026-10-29
tags: [ai-bookkeeper, testing]
description: "A seeded property test on the bookkeeper's S-corporation comparison found no fault: the profit always splits exactly, and the salary sweep matches direct calls."
---

The S-corporation comparison in the free AI bookkeeper is hand-checked on a few cases. A new test goes wider: 400 made-up sole proprietors with random profit, filing status, year, salary and overhead. For each one, salary plus K-1 plus employer payroll tax plus overhead must equal profit to the cent, the two FICA halves must match, nothing may be negative, and each row of the salary sweep must equal a direct call at that salary. More overhead must never raise the savings.

It found nothing to fix, and we are saying so plainly. The test stays, so a later change to the tax code path has to keep these properties. The figures are made up; it checks arithmetic consistency, not that a given tax rule is right.
