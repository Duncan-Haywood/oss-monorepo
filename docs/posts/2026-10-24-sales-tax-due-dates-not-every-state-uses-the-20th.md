---
title: "Sales tax due dates: not every state uses a day of the month"
date: 2026-10-24
description: "Most US states put sales tax returns on the 20th. Massachusetts counts 30 days from the period's end. How a bookkeeping engine models both."
tags: [sales-tax, bookkeeping, open-source]
---

# Sales tax due dates: not every state uses a day of the month

A sales tax worksheet needs one thing right before anything else: when the return is due. Most states pick a fixed day after the period closes. Texas, New York, Illinois and Pennsylvania use the 20th, Washington's monthly returns the 25th, California the last day of the month.

Massachusetts is different. Since 2021, quarterly and annual returns are due 30 days after the period ends, so a Q1 return is due April 30 and a Q4 return January 30. Monthly returns stay on the 20th. A "day of the month" setting cannot say that.

The open-source [ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) now takes the due rule as either a day number, `"last"`, or `{ after: 30 }` (days after the period's last day), and `--state MA` picks the right one by filing frequency. Weekend and federal-holiday rollover still applies.

Caveat: the Massachusetts rule is written from memory and search excerpts, not from a reading of mass.gov, and is tested on hand-made invoices only. Check your own notice before relying on it.
