---
title: "A payment schedule for the framing proposal"
date: 2026-11-01
tags: [wall-framing-takeoff, proposals, construction]
description: The customer proposal now splits its price into typed milestone payments that add up to the cent.
---

A proposal that ends at "Total" leaves the customer asking when the money is due. The framing takeoff's customer proposal now takes `payments: [{name, pct}]`: milestones with percentages you type, which must add to 100 (otherwise the proposal is refused and says what they add to).

Each milestone is the price times its percentage, rounded to the cent, and the last one absorbs any rounding drift so the schedule sums exactly to the price. By hand: on a 1,225.20 price, 33.33% is 408.36, 33.34% is 408.48, and a 33.33 / 33.33 / 33.34 split ends at 408.36 / 408.36 / 408.48.

No deposit limits or lender rules are shipped; some states cap deposits, so check yours. It is a plan key and CLI field only, with no page control yet.
