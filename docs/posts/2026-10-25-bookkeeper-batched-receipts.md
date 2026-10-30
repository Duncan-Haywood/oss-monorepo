---
title: "One card charge, three receipts: matching slips to a batched bank line"
date: 2026-10-25
description: "ai-bookkeeper's receipt matcher now pairs several receipts with the single bank line that paid them, and refuses when the sum is ambiguous."
tags: [ventures, ai-bookkeeper, receipts, bookkeeping]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) paired each receipt with
one bank line. Real spending is messier: a vendor bills a day's slips as one
card charge, and the one-to-one matcher left every slip "unmatched" and the
charge "missing a receipt".

After the one-to-one pass, a line that equals the exact sum of two to four
unmatched receipts, all sharing a payee word with the line and dated inside
the match window, now matches them as a group. If two different sets reach the
same total, it matches neither and leaves the choice to you.

Tested on made-up slips only (20.00 + 15.50 against a 35.50 charge, an
ambiguous case, and unrelated payees). No real batched card statement has been
tried, and foreign-currency groups are not attempted.
