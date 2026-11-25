---
title: "A payment schedule for the framing proposal"
date: 2026-11-01
tags: [wall-framing-takeoff, proposals, construction]
description: The customer proposal now splits its price into typed milestone payments that add up to the cent.
---

A proposal that ends at "Total" leaves the customer asking when the money is due. The framing takeoff's customer proposal now takes `payments: [{name, pct}]`: milestones with percentages you type, which must add to 100 (otherwise the proposal is refused and says what they add to).

Each milestone is the price times its percentage, rounded to the cent, and the last one absorbs any rounding drift so the schedule sums exactly to the price. By hand: on a 1,225.20 price, 33.33% is 408.36, 33.34% is 408.48, and a 33.33 / 33.33 / 33.34 split ends at 408.36 / 408.36 / 408.48.

No deposit limits or lender rules are shipped; some states cap deposits, so check yours. The page now has a payment schedule box too (one milestone per line, `name, percent`).

## Update, 2026-11-25: the printed letter now carries the schedule

Until today the schedule appeared in the on-screen preview and the `.txt` download, but not in the printable page or the branded bid package, which is the copy a customer usually signs. A red-team pass found the gap, and both now print a "Payment schedule" table with each milestone's name, share and amount. The same pass fixed two smaller things. A milestone typed with no name used to crash the letter; it is now called "Payment 1", "Payment 2" and so on. A validity period of zero, a negative number or text used to print as typed ("valid for -3 days"); it now falls back to 30 days, and a fraction rounds to whole days.

A new test checks that every amount and typed line in the text letter also appears on the printable page, so a section added to one can't go missing from the other.
