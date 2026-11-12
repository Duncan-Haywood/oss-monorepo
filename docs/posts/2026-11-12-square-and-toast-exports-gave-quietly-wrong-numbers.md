---
title: "Square and Toast exports read fine and gave quietly wrong numbers"
date: 2026-11-12
tags: [shift-roster-builder, scheduling, pos, data-quality]
description: Two US till exports parsed without an error, but one staffed from gross sales and the other counted voided lines. Both are fixed.
---

The free [shift roster builder](https://marisstella.app/shift-roster-builder/shifts-from-sales.html) can plan a week's shifts from a till's sales export. It averages each weekday-hour, divides by the sales per labor hour you set, and cuts the result into shifts. It had read four real files, all from bakeries or shops outside the US. The two tills most US restaurants and cafés export from, Square and Toast, had only been tried with a few made-up header names.

This time we ran their full item-export header rows through it. Both read without an error, and both gave a wrong number without saying so.

- **Square staffed from gross sales.** Its item export has `Gross Sales`, `Discounts` and `Net Sales`, in that order. The reader took the first sales-like column, so a $10 latte sold for $8 counted as $10. A shop that discounts heavily, through happy hours or staff meals, was planned for money it never took. A net column now wins over a gross one wherever it sits.
- **Toast counted voided lines.** Toast's item selection export marks a line rung in and then voided with `Void?` = true. Its price stays positive, so the line was summed as a sale. When planning from customers instead of money, an order whose only line was voided counted as a customer. Voided lines are now left out, with a note that gives how many and their total.
- **Refunds written as positive amounts** under an `Event Type` or `Status` of refund, return or cancelled are dropped as refunds too.

Neither fault would have shown up as an error. The plan would have come out a little heavy, and nothing would have said why. That is the kind of thing a scheduling tool should check for you.

Some limits. We wrote the header rows from memory of the vendors' help pages, because those pages refused our connection, and every row in the tests is made up. The Korean bakery file, re-run through the changed reader, printed the same report byte for byte. No real Square or Toast export has been through it yet. If you have one and can remove the private details, it is the most useful thing anyone could send this project.

Code and tests: [`ventures/shift-roster-builder`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/shift-roster-builder) (`demand.mjs`, `pos-exports.test.mjs`; README section "Square and Toast item exports").
