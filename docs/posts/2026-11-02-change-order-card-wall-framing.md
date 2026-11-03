---
title: "What a change order costs: a diff card for the framing takeoff"
seo_title: "Change order cost comparison for a framing takeoff, in the browser"
date: 2026-11-02
tags: [wall-framing-takeoff, construction, change-orders]
description: The wall framing takeoff page can now save a budget as the original and list every line a plan or price change moves, with the effect on cost and bid price.
---

A homeowner moves a window, a builder re-prices sheathing, and the question is the same: what did that change cost? The [wall framing takeoff](../../ventures/wall-framing-takeoff/README.md) page now has a **Change order** card. Save the current budget as the original, change the plan or the prices, and it lists each line that moved (section, item, before and after, amount), the cost total and bid price change, and a per-section split. A line priced on only one side is named rather than netted.

Everything runs in the browser; the saved original lives in the tab only. Checked in headless Chromium on the example house: raising `laborWallFoot` from 11 to 12 gave one changed line, +211.50 cost (+4.3%), +255.92 on the bid price at 10% overhead and profit. Not checked against a real builder's change order.
