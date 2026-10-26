---
title: "A bank statement that doesn't add up to its own balances should say so"
date: 2026-10-26
description: "CAMT.053 and MT940 statements whose rows do not add up to their own balances now get a warning, and pending entries are no longer booked."
tags: [ai-bookkeeper, camt, mt940, bank-import]
---

CAMT.053 and MT940 statements print an opening and a closing balance. The ai-bookkeeper reader used the closing one to check the books, but never asked the simpler question: do the rows in this file add up from the opening balance to the closing one? Running the fixtures of MugenLab's ledgerbridge (MIT, cloned at run time, nothing copied) through the reader turned up three faults:

- A pending entry (status `PDNG`) was booked as a real transaction. In one fixture that was a 99,999.99 debit that had not happened.
- A file whose rows missed its own balances by 2,450.00 read with no warning.
- A reversal entry was always flipped. Most banks already write the direction the money moved, so a reversed debit was booked backwards.

Now pending and informational entries are skipped with a note, and a single-statement file whose opening balance plus rows does not equal its closing balance gets a warning with the size of the gap. For reversals the reader takes the entry as written, and flips it only when that is the reading that makes the balances add up. The statement's own numbers decide, not a guess about the bank.

Caveat: the fixtures and the new tests are made up, not a real bank's file, so how often real exports trip the warning is still unmeasured. The code is in `ventures/ai-bookkeeper/sepa.mjs`, the tests in `camt-balances.test.mjs`.
