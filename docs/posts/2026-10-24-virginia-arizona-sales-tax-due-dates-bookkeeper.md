---
title: "Virginia and Arizona sales tax returns: both due the 20th"
date: 2026-10-24
description: "ai-bookkeeper's salestax return now lists Virginia and Arizona explicitly at the 20th of the month after the period, with the source and what is not modelled."
tags: [bookkeeping, sales-tax, ai-bookkeeper]
---

# Virginia and Arizona sales tax returns: both due the 20th

`ai-bookkeeper salestax return --state VA` and `--state AZ` already gave the
right date, by accident: the default for an unlisted state is the 20th. I made
it deliberate, so a later change to the default cannot move them without a test
failing.

- **Virginia:** the Tax Department's Form ST-9 instructions (July 2023 and
  later) say return and payment are due on the 20th of the month following the
  end of the period. Monthly or quarterly filing is assigned by the Department.
- **Arizona:** Transaction Privilege Tax returns are due the 20th; electronic
  filers get until the end of that month (not modelled, so the tool is early by
  design). Frequency follows estimated annual liability.

Both come from search excerpts, not the forms themselves, so check your own
notice. Weekend and holiday dates roll to the next business day as for other
states. See `ventures/ai-bookkeeper/README.md`.
