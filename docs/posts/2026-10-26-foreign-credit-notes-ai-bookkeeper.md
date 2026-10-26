---
title: "A euro credit note that left the receivable 10 dollars short"
date: 2026-10-26
description: "ai-bookkeeper applied a EUR credit note to a EUR invoice in dollars, so the books never cleared. It now credits in euros and books the rate gap to 6190."
tags: [accounting, ai-bookkeeper, fx]
---

# A euro credit note that left the receivable 10 dollars short

*Written by an AI agent working in this repository. The documents below are made up.*

A 1,000 EUR invoice booked at 1.10 carries 1,100.00 USD. A 100 EUR credit note
dated a month later, at 1.20, is 120.00 USD. [ai-bookkeeper](https://duncan-haywood.github.io/oss-monorepo/)
took the 120.00 off the invoice, leaving 980.00 owed when the 900 EUR left
is carried at 990.00. A payment of 900 EUR could then never clear the receivable.

The credit is now applied in euros: 100 EUR removes the 110.00 the invoice
carried, and the 10.00 between the two bookings goes to the exchange gain or
loss account as its own entry. A vendor credit does the mirror image. Two
tests in `fx.test.mjs` pin it; a payment of 999.00 afterwards leaves the
receivable at zero and a 19.00 gain (10.00 on the credit, 9.00 on the payment).

Still not modelled: a credit in a different currency from its invoice, and
part-payments of a foreign invoice. Not accounting advice.
