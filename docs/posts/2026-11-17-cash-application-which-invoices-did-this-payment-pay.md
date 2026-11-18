---
title: "Which invoices did this payment pay? A free cash application matcher"
seo_title: "A free cash application matcher for bank receipts and invoices"
date: 2026-11-17
tags: [cash-application-matcher, accounts-receivable, bookkeeping, algorithms]
description: "A new local tool applies bank receipts to open invoices: multi-invoice payments, 2/10 net 30 discounts, bank fees and short-pays, each with a reason."
---

Every business that invoices other businesses has someone who opens the bank
portal in the morning and reads lines like `WIRE IN HARBOR FREIGHT LOGIST
5,160.25`. No invoice number. The customer has two open invoices, 3,400.00 and
1,775.25, which add up to 5,175.25. The wire is 15.00 short, the size of an
incoming-wire fee. So the payment is both invoices, less a fee, and the clerk
writes 15.00 off as a bank charge. That is cash application, and in most small
finance teams it is done by hand.

The [Cash Application Matcher](../../ventures/cash-application-matcher/) does
the first pass. It reads an open-invoice export and a bank export of incoming
payments, in the browser, and proposes for every receipt which invoices it
settles, with a confidence and a sentence a person can check.

## How it decides

It follows the order a clerk would:

1. **Invoice numbers in the memo.** `INV-1023`, `INV 1023/1024`, `1023, 1031`
   and `001023` all read as invoice numbers. If the payment equals the named
   invoices, that is a High match.
2. **The payer name.** Banks truncate, shout and drop the "LLC". Names are
   compared token by token after removing legal suffixes and bank noise
   ("ACH CREDIT") and expanding abbreviations (MFG, ST, SVCS).
3. **The amounts add up.** Among that customer's open invoices, a bounded
   depth-first search, oldest invoice first, looks for the set whose total
   equals the payment. Each invoice may settle at its open amount or, inside
   its discount window, at the discounted amount. If nothing is exact, a
   second search allows a shortfall up to the user's bank-charge limit.
4. **Ties go to the oldest.** If two sets fit, the oldest set is proposed and
   the row is marked Review.

One rule came from a test that failed. A 980.00 payment on a 1,000.00
invoice with 2/10 net 30 terms is a full settlement on day 8. On day 25 it is
short by exactly the discount, after the window closed. The first version
wrote that 20.00 off as a bank charge, because 20.00 is under the 25.00 fee
limit. That is wrong. An unearned discount is the clerk's call, not a fee, so
the tool now names it ("paid 25 days after its date, 2% discount window 10
days"), leaves the 20.00 open and marks the row Review.

## How well it works, and on what

There is no real company's statement in this repository, so the measurement
is on generated data, and it is labelled that way everywhere. A seeded
generator makes customers, invoices (including monthly retainers of equal
amounts, which make amounts ambiguous) and bank lines with known answers:
named invoices, bare numbers, truncated names, multi-invoice payments,
discounts, fees, short-pays and nameless cheques. Over five seeds and 1,606
receipts:

| Tier | Receipts | Exactly the right invoices |
|---|---:|---:|
| High | 1,146 | 99.8% |
| Medium | 185 | 97.3% |
| Review | 255 | 63.5% |

All seven High and Medium misses are swaps between the same customer's
invoices of equal amount, where an earlier receipt had taken the twin: the
money applied is right and the invoice number is not. Review rows are right
less than two times in three, which is the point of the tier. It says where
a person should look.

## What it is not

It posts nothing and connects to nothing. It does not read PDF or emailed
remittance advices. It works in one currency per run. The next measurement
is the one that matters: a real bookkeeper's anonymised AR and bank exports,
to see whether names and memos in the wild look like the generated ones.

The code is MIT licensed, and the benchmark is in
[`eval/synthetic.mjs`](../../ventures/cash-application-matcher/eval/synthetic.mjs).
