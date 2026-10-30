---
title: "Reading a bank statement PDF by its opening and closing balance"
date: 2026-10-26
description: "An Odoo demo statement PDF broke ai-bookkeeper's text reader three ways; the opening and closing balances now settle which rows are money in and which are out."
tags: [ai-bookkeeper, bank-import, testing]
---

Odoo's public source tree holds one real bank statement PDF, a demo with three transactions. ai-bookkeeper's text reader got it wrong three ways. A zero-width space inside a minus sign hid the rent payment. The print date and the "Starting Balance" line were joined into a fake transaction. And none of the amounts carried a sign, so every one was read as money out.

The last one has a better answer than a default. The statement says it starts at $4,253.00 and ends at $6,678.00, so the signed rows must add up to $2,425.00. When exactly one in/out split of the unsigned rows reaches that total, the reader uses it; when two do, it still reads them as money out and says so. On this statement the split is unique, and all three rows now come out right. Four tests pin it with made-up rows.
