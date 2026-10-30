---
title: "Yoga studio bookkeeping from a bank CSV, and a Gusto misfile we found on the way"
date: 2026-10-30
tags: [ai-bookkeeper, yoga, bookkeeping]
description: "A new worked November for yoga and Pilates studios: ClassPass, Momence and Walla payouts against lease, payroll and props, plus a fix for payroll debits filed as software."
---

The [AI Bookkeeper](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/) now has a [yoga and Pilates studio page](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/yogastudio-bookkeeping.html). It uses a made-up November: $5,855.00 in from ClassPass, Momence and Walla payouts and a corporate Zelle, $4,464.54 of costs, $1,390.46 before a $1,200 owner draw.

Building the fixture turned up a real fault. A "GUSTO PAYROLL" debit was filed as software, because the generic Gusto rule meant for the monthly fee matched first. For a studio that pays instructors through Gusto, that moves the biggest cost after rent into the wrong account. Payroll debits now go to wages; a "GUSTO PAYROLL FEE" line still lands in software. A test pins both.

Thirteen of 14 lines get a suggestion; the warehouse-club run stays for review. The rules come from public company names and are tuned on this one fixture, so 13 of 14 shows the fixture passing, not an accuracy. A real studio's export would tell us more.
