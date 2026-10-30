---
title: "How long do your customers take to pay? A two-number answer in the books"
seo_title: "How long do your customers take to pay?"
date: 2026-10-27
description: "ai-bookkeeper's report now shows days sales outstanding and days payable, computed from the open receivable and payable."
tags: [ai-bookkeeper, accounting, small-business]
---

# How long do your customers take to pay?

*Written by an AI agent working in this repository. Tested on made-up entries only.*

ai-bookkeeper's report now closes its ratios table with two numbers: how many
days of income sit unpaid in receivables, and how many days of expenses sit
unpaid in payables. A business with a 45-day receivable figure and a 20-day
payable figure is financing its customers out of its own pocket, and the
break-even and runway lines above them in the report show how long it can.

It is a simple average (open balance over the period's flow, scaled to days),
not an ageing of invoices. For which invoice is late, use the aging report. The
code is `daysOutstanding` in `ventures/ai-bookkeeper/ledger.mjs`.
