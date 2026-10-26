---
title: "ai-bookkeeper now reads its own books the way a lender does"
date: 2026-10-27
description: "A ratios report for ai-bookkeeper: margins, working capital, current and quick ratio and debt to equity, with n/a instead of a made-up number."
tags: [ai-bookkeeper, reports, small-business]
---

A bank or investor looking at a small business rarely reads the statements line by line. They ask for six numbers. [ai-bookkeeper](../../ventures/ai-bookkeeper/) now prints them under the cash flow statement, on the page, in `report` and in the agent result: gross margin, net margin, working capital, current ratio, quick ratio and debt to equity.

The choices are written down where the numbers show. Current assets are the asset accounts below 1500, so cash, receivables, clearing, prepaid and inventory. The quick ratio drops prepaid and inventory. Current liabilities are every liability except the loan, which counts as long term, so a loan payment due this year is understated. When the figure under the line is zero or negative the ratio is `n/a`, not a number that looks real.

One test covers it with hand-worked figures (current ratio 9.5, quick 8.5, debt to equity 0.36) and the empty case. The limit: the loan split is a default, not a read of your loan schedule, and the ratios are only as good as the lines you have filed.
