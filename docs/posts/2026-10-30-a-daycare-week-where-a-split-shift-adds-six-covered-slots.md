---
title: "A five-person daycare week: allowing a split shift covers 6 more slots for $307"
date: 2026-10-30
tags: [shift-roster-builder, scheduling, small-business]
description: "A worked childcare week: 23 of 30 adult-shifts covered for $1,888, then 29 once same-day split shifts are allowed, for $2,195."
---

We added a [daycare staffing page](https://duncan-haywood.github.io/oss-monorepo/shift-roster-builder/daycare-staff-schedule.html) to the [shift roster builder](https://duncan-haywood.github.io/oss-monorepo/shift-roster-builder/), using its real command-line output on an invented five-person centre.

**The numbers.** Three blocks a day, Monday to Friday (one adult 7 to 9, three 9 to 3, two 3 to 6), 30 adult-shifts. With the default 10-hour rest rule the roster covers 23 for $1,888. The open ones are Monday's early open, a second adult at each pickup and Friday core hours. The reason given is that a 9 am block straight after a 7 to 9 block leaves no rest, so nobody can open and then work the core hours.

**What changed.** With rest set to 0, which is what a same-day split shift is, 29 of 30 are covered for $2,195: six more adult-shifts for $307. The one gap left is Friday core hours, where the two free people are at their weekly hour limit.

**Limits.** The team and wages are invented; no real centre was measured. The builder does not model child-to-staff ratios or licensing, so you enter the head count your regulator requires.
