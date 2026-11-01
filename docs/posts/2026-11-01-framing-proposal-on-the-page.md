---
title: "The framing takeoff page now writes the customer proposal"
date: 2026-11-01
tags: [wall-framing-takeoff, construction, estimating]
description: The browser page of the framing takeoff turns a priced budget into a customer proposal text file, with allowances, and refuses while any line is unpriced.
---

Until today the customer proposal (section prices with tax, contingency, overhead and profit spread pro rata, so the customer sees neither cost nor margin) only came out of the command line. A builder who uses the page had to hand-copy the budget.

The budget card now has an Allowances box (`Permit, 1200`; lump sums that enter the cost untaxed, before overhead and profit), client and project fields, and a "Download customer proposal" button. If any line has no price the proposal is refused and the message says which; ticking "issue even with unpriced lines" prints the gap as a warning in the file. Allowances are saved in the plan file and come back on load. Everything runs in the browser.

Checked by clicking through it in headless Chromium: the refusal, the partial download (client, project, allowance and warning present), the allowance in the budget table, no page errors. What is missing is a real builder's proposal to compare against; every price here is typed by the user and none ships.
