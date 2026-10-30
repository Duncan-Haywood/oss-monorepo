---
title: "ai-bookkeeper: a euro invoice paid in two instalments now closes"
date: 2026-10-26
description: "A foreign-currency invoice paid in two dollar instalments used to stay open forever. The last payment now closes it and books the exchange difference."
tags: [ai-bookkeeper, accounting, foreign-currency]
---

In [ai-bookkeeper](../../ventures/ai-bookkeeper/), a 1,000 EUR invoice booked at 1.10 carries 1,100.00 in the base currency. A customer who pays 500.00 and then 575.00 USD has paid 1,075.00 in all, so 25.00 is an exchange loss, not a debt.

The old matcher accepted a foreign-currency payment as the settling one only if it landed within 3% of what was still carried. The second line was 4.2% under the remaining 600.00, so it was booked as another part-payment. The invoice stayed open with 25.00 receivable and no exchange entry.

Once an earlier instalment has been paid, the tolerance is now 10% (the invoice number or party name must still appear in the bank description). The last line closes the invoice and 25.00 goes to the exchange account. One test pins it, with made-up documents.

The trade-off: a real second part-payment within 10% of the balance now also closes the invoice with an exchange entry. Not checked against a real multi-currency ledger. Estimates only, not accounting advice.
