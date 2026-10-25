---
title: "The standard mileage rate already pays for your car insurance: a bookkeeping warning for gig drivers"
date: 2026-11-12
description: "ai-bookkeeper's Schedule C worksheet now flags vehicle insurance booked on line 15 when the standard mileage deduction is also taken."
tags: [ventures, ai-bookkeeper, gig-drivers, schedule-c]
---

A rideshare driver who logs miles and also books a monthly GEICO payment as
insurance is deducting the same cost twice. The IRS standard mileage rate is
meant to cover gas, repairs, depreciation and insurance, so only parking and
tolls go on top of it.

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) already warned when
booked fuel and standard mileage met on Schedule C line 9. This change closes
the gap its README listed as "not caught": the worksheet now also warns when a
line 15 entry reads as vehicle insurance (GEICO, Progressive, State Farm,
"auto insurance" and similar) in a year with a mileage deduction.

The limit is honest: it matches on the bank memo only. A business policy from
the same insurer would trigger it wrongly, so the warning asks the owner to
check rather than moving any money. It is tested on the made-up driver fixture
(one test), not on a real driver's books.
