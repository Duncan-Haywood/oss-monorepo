---
title: "A bookkeeper that learns: how much of a month can post itself?"
date: 2026-10-21
description: "Open-source double-entry books from bank CSVs that learn your payees. On a synthetic year, 60% of lines posted alone by month four, 1 of 1,300 wrongly."
tags: [projects, accounting, bookkeeping, machine-learning, open-source]
---

# A bookkeeper that learns: how much of a month can post itself?

Small-business bookkeeping from bank statements comes down to one slow job.
A year of lines like `PURCHASE AUTHORIZED ON 03/14 AMZN MKTP US*2K3AB CARD 4417`
each has to go to an account. The arithmetic after that is easy. The paid
answers are subscriptions that want your bank login. The free answer is a
spreadsheet and a weekend.

[AI Bookkeeper](https://duncan-haywood.github.io/monorepo-projects/ai-bookkeeper/)
is a new open-source tool that does the job differently. It keeps double-entry
books in your browser. Every line gets a suggested account, a confidence and
the reason. It learns from each line you file, so next month the payees you
have already filed post themselves.

## Four layers, then you

1. **Your rules**: `blue bottle => Meals`.
2. **Memory**: the account you chose for this payee before. Banks mangle payee
   names, so it strips store numbers, card numbers, reference codes and the
   `POS DEBIT` and `SQ *` wrappers first. `SQ *BLUE BOTTLE 0412 OAKLAND CA` and
   `POS DEBIT SQ *BLUE BOTTLE 9981` count as the same payee. Confidence is
   times chosen over (times seen + 0.5). Three choices in a row give 0.86, so
   the fourth line from that payee posts alone.
3. **A naive Bayes classifier** trained on everything you filed, for payees it
   has not seen exactly. It only suggests.
4. **Built-in keywords** for common merchants. They only suggest too.

A language model is an optional fifth layer, for the review queue only. It uses
your own key or a model on your own computer (Ollama, LM Studio). It never posts
anything; an answer naming an account that is not in your chart is dropped.

Two more things matter as much as the categorizer. A card payment from
checking appears in both statements, and it is **one transfer**, not an expense.
The tool pairs equal and opposite lines across your accounts. And when the
bank prints a running balance, every row is checked against it, and the books
are **reconciled** to the statement's closing balance.

## How fast does it learn?

I generated a synthetic year of lines for a made-up design studio, about 48
a month. There are 35 recurring payees with messy descriptions, three of them
filed two different ways (Amazon for supplies and for postage, Costco for the
business and for home, Venmo for a contractor and for personal). There are also
six one-off local merchants a month and a card paid from checking. I imported a
month at a time and filed each month's queue correctly before importing the next.

| | Month 1 | Month 2 | Month 3 | Month 4 | Month 8 | Month 12 |
|---|---|---|---|---|---|---|
| Lines that posted with no review | 0% | 7.5% | 23.6% | 44.3% | 60.4% | 69.3% |

From the fourth month to the twelfth, 1,300 of 2,164 lines posted alone, and
1 of those 1,300 was wrong. Of the suggestions waiting in review, 542 of 642
were right (5 seeds, 2,892 lines in all).
`node ventures/ai-bookkeeper/eval/benchmark.mjs` reproduces it in about a
second.

Two things hold the figure near 60% rather than 90%: the payees filed two ways,
which memory rightly refuses to auto-post, and the one-off merchants it has
never seen. Both are what a real month looks like.

**What this does not show.** The data is synthetic, and I wrote both the
generator and the built-in keywords. So the first month's 100% for the keywords
means nothing about real banks. The learning curve is the honest part: how fast
a business's own choices start to post themselves through messy descriptions.
No real bank export has been tested yet, and the AI layer is unmeasured.

## The mistakes the books catch

The tool's example is three synthetic months. Filed correctly, it shows a
profit of $8,062.93. File the card payments as expenses too, plus the owner's
draws, and the same quarter shows a loss of $6,176.11. The balance sheet's
close checks then find something a profit and loss never shows:
sales tax payable at &minus;$1,197.16. The studio paid the state tax it had
collected inside its Stripe deposits, so that much of "sales" was never its
income. The [guide](https://duncan-haywood.github.io/monorepo-projects/ai-bookkeeper/how-to-do-bookkeeping-from-bank-statements.html)
walks through the arithmetic.

## Update: split lines

A bank line is often several things. A Stripe payout of $970.00 is $1,000.00
of sales less $30.00 of fees; a $1,000.00 loan payment is interest plus
principal. Without splits, the books either overstate nothing and hide the fee,
or misstate income. Now a line can be filed across accounts: the parts are
signed like the bank line, must add to it to the cent, and post as one balanced
entry (one part may leave its amount out to take the remainder). Splits work in
the page, the CLI and the agent engine, flow into the QuickBooks, Xero and IIF
exports, and the loan-balance and equipment checks read every part. They are
not learned from, because the same payee splits differently each time.

## Update: payment reminders

Books that know who owes you should help you ask. `reminders` lists each
customer with overdue invoices, oldest debt first, and writes a draft per
customer whose tone steps up with the oldest invoice's lateness: friendly under
15 days, firm from 15, final from 45. Pair it with `statement` for the account itself. Amounts come from the open-invoice list the aging report uses, so part-payments and credit notes are already netted and the figures agree with the ledger. Nothing is sent: the drafts are for you to read. Tested on hand-written
invoices only; the 15- and 45-day steps are common practice, not a measured
optimum.

## Checking the tax tables against the source

The estimated-tax plan used 2025 brackets typed from memory. This week I read
the IRS's own Rev. Proc. 2024-40 and compared every bracket and the 20% pass-through
(QBI) thresholds: all agree. One thing looked wrong and was not: the Rev. Proc.
lists 2025 standard deductions of $15,000 (single) and $30,000 (joint), but the
2025 law raised them to $15,750 and $31,500, and the Form 1040 instructions say
so. The code already used the newer numbers, and a test now pins them. The 24%
backup-withholding rate for payees with no TIN also traces to the statute
(IRC 3406: the fourth-lowest rate, 24%). The $400 minimum QBI deduction is still
unverified. Estimates only, not tax advice.

## What is next

Real bank exports as test fixtures,
and then a measurement of the AI layer with a local model. The source, the
benchmark and its caveats are in
[`ventures/ai-bookkeeper`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/ai-bookkeeper).
It is free, MIT-licensed and runs in your browser. It is not accounting or tax
advice, so have an accountant look before you file anything.
