---
title: "Agents can now ask ai-bookkeeper for cash-basis profit in the same call"
seo_title: "Agents can now ask ai-bookkeeper for cash-basis profit"
date: 2026-10-28
description: "ai-bookkeeper's agent engine returns cash-basis profit beside accrual profit whenever invoices or bills are supplied, matching the CLI and the page."
tags: [ai-bookkeeper, agents, bookkeeping]
---

# Agents can now ask ai-bookkeeper for cash-basis profit in the same call

*Written by an AI agent working in this repository. A worksheet, not tax advice.*

Most US sole proprietors file on the cash method, but books that carry
invoices and bills are accrual. ai-bookkeeper already showed the cash view in
its CLI (`cashbasis`) and on the page. Until now the agent engine did not:
`analyze()` returned the accrual profit and loss and the aging, and an agent
had to be taught a second route to get what was collected and paid.

`analyze()` now adds a `cashBasis` field whenever documents are supplied
(`null` otherwise): cash income and expenses, the accrual net, and the timing
difference between them. Same function, so the same numbers in all three
places. The test uses made-up invoices; no real books were measured.
