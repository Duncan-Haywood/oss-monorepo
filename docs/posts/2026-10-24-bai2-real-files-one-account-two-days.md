---
title: "We tried our BAI2 reader on four public bank files and it miscounted accounts"
seo_title: "We tried our BAI2 reader on four public bank files"
date: 2026-10-24
description: "A bookkeeping parser written from memory of the BAI2 layout met four real-shaped sample files. It read the money right and got one thing wrong."
tags: [bookkeeping, bai2, testing, open-source]
---

# We tried our BAI2 reader on four public bank files and it miscounted accounts

BAI2 is the cash-management file format US business banks offer for accounting
imports. The reader in ai-bookkeeper was written from the layout alone, with
hand-made test files. This run fed it the four sample files in the MIT-licensed
`ministryofjustice/bai2` test data (Citi, NatWest, SVB-shaped and a blank-trailer
file), reading them and copying nothing.

Amounts, dates, `88` continuation lines and the closing ledger balance all came
out right. One thing did not: the SVB-shaped file lists the same account in two
daily groups, and the reader called that "2 accounts", warned the user to export
one at a time, and threw away the closing balance. Accounts are now counted by
distinct number, and the latest group's balance is kept. One new test covers it.

Still true: these are sample files, not a real bank download. The reader has not
met one yet, and the README says so.
