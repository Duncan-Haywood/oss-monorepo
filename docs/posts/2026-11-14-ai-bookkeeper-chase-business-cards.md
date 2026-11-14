---
title: "Four cards on one bill: reading Chase business card downloads"
seo_title: "Chase business card CSV: spend by employee card, and why its category labels mislead"
date: 2026-11-14
tags: [ai-bookkeeper, bookkeeping, bank-exports, small-business]
description: "Six public Chase business card downloads, read with the AI Bookkeeper: the per-employee Card column we were dropping, a spend-by-card report, and a bank label that was wrong on 17 of 17 lines."
---

A business credit card account usually has more than one card on it: one for
the owner, one for each employee who buys things. Everything lands on one
statement and one bill. Before an owner pays that bill, they want to know who
spent what.

Chase's business card download says so on every row. Its first column is
`Card`, which holds the last four digits of the card that made the charge.
The personal card download has the same columns without that one. Until
today the [AI Bookkeeper](../../ventures/ai-bookkeeper/README.md) did not
name this layout, and it threw the column away.

**What we read.** People have committed their own bank downloads to public
GitHub repositories. The evaluation script
(`ventures/ai-bookkeeper/eval/us-bank-exports.mjs`) fetches them when it runs
and commits none of them, because they carry no licence and some contain real
merchants. This run added 15 files, which brings it to 63 files and 5,767 rows.
Every layout is named, no line is skipped without a reason, and no payment or
deposit comes in with the wrong sign. Six of the new files are Chase business
card downloads, and four of those look like a business's own:

- a software firm's quarter: 278 rows on four cards;
- a restaurant's month;
- a two-card month;
- an 83-row file with one card.

**Spend by card.** Each line now keeps its card's last four digits, and only
those four. If the column holds a full number, it is cut down. A new report
(`cli.mjs cards`) adds the lines up per card:

- spend, refunds and net;
- where the money is filed;
- what is still waiting for an account, and which accounts are suggested;
- the top five merchants, with `SQ *` and Amazon order numbers folded so that
  one merchant is one row.

Paying off the card is not anyone's spending, so payments are left out.
Chase puts interest on no card at all, so it is listed apart. On the software
firm's quarter, the owner's card spent $36,434.31, of which $16,749.60 went to
Upwork and $9,692.96 to AWS. The other three cards spent $3,488.14, $382.33
and $264.36. `--csv` writes each line with its card, amount and account. That
is the first draft of an employee's expense report.

**A label that was wrong every time.** When the bookkeeper knows nothing about
a merchant, it falls back on the bank's own category label as a weak hint. It
mapped Chase's "Professional Services" to *legal and professional fees*.
On these files, 17 lines got their suggestion from that label alone. Read by
eye, none of them was a legal or accounting fee. They were data APIs, AI tools,
cloud storage, an e-commerce platform fee, a rent payment and a person's name.
Chase also files Upwork, GitHub, Vercel and Facebook ads under that label. So
the label no longer suggests anything. The card networks' own "professional
services" category name was already ignored for the same reason.

Here is a label we kept, with its numbers. "Bills & Utilities" was right on 7
of its 23 label-only lines: phone and fax, internet, a city utility. It was
wrong on 10: insurance, road tolls, domain names, Netflix. The other 6 were
unclear. It stays for now, because a line suggested by a label always goes to
review and is never posted by itself. It is the next label to look at.

**US Bank checking.** The first real US Bank checking download in the set
pays its cards as `INTERNET BANKING PAYMENT TO CREDIT CARD 1234` and
`WEB AUTHORIZED PMT AMERICANEXPRESS`. Neither line got a suggestion before.
Both are now suggested as transfers between your own accounts. After `PMT`,
only a card issuer's name counts, so `WEB AUTHORIZED PMT PAYPAL` is still
treated as a bill.

**What's still open.** US Bank glues phone numbers onto merchant names
(`SPRINT8006396111`). The payee key drops any word that contains a digit, so
that line ends up with no key at all. Changing the key would move every payee
the bookkeeper has already learned, so that fix needs its own measured run.
We also have not yet tried a business account at any bank other than Chase.

The bookkeeper is free and MIT licensed. It runs in your browser or from the
command line, and it is not tax or accounting advice.
