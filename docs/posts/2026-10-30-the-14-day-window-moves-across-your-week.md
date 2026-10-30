---
title: "The 14-day scheduling window moves across your week"
date: 2026-10-30
tags: [shift-roster-builder, scheduling, evaluation]
description: "On an invented seven-person cafe, the same call-out costs $0 in premium pay 15 days out, $50 to $88 ten days out and $68 to $174 three days out, because notice is counted per shift."
---

Predictive-scheduling rules in cities such as Seattle, Chicago and New York usually ask for about 14 days of notice and attach a premium to changes inside that window. The window is counted shift by shift, so a change made ten days before Monday is late for the first four days of the week and early for the weekend.

We checked that with the [shift roster builder](https://duncan-haywood.github.io/oss-monorepo/shift-roster-builder/)'s changes report on its built-in cafe. Each of five Wednesday call-outs was answered by rebuilding the whole week, priced at one hour of each moved person's wage with the caller exempt, and the change was dated 15, 10 and 3 days out.

**The numbers.** 15 days out: $0 in every case. 10 days out: $50 to $88. 3 days out: $68 to $174. One caller (Gus) cost the same at 10 and 3 days, because all of his moved shifts fall early in the week.

**What to do.** If a rebuild is unavoidable, do it early and read the list of moved shifts by day before publishing. The window, premium and exemptions here are typed in, not looked up: the tool does not know any city's actual rule, and the cafe is invented. The [page](https://duncan-haywood.github.io/oss-monorepo/shift-roster-builder/predictive-scheduling-14-day-notice.html) has the table.
