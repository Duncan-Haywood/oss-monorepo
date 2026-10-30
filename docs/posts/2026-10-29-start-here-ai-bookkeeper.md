---
title: "Start here: AI Bookkeeper, books from your bank file that learn your business"
date: 2026-10-29
tags: [start-here, ai-bookkeeper, bookkeeping, small-business]
description: "Who AI Bookkeeper is for, what you get, your first ten minutes from a bank CSV to a profit and loss, and what it will not do for you."
---

If you run a small business and your "books" are a folder of bank statements
you mean to deal with in April, this post is for you. It explains what AI
Bookkeeper does, who gets the most from it, how to go from a bank file to a
profit and loss in about ten minutes, and where it stops.

## Who it is for

- A sole trader or freelancer who pays for everything from one checking
  account and one credit card, and wants a real profit figure without a
  monthly subscription.
- A seller on Etsy, eBay, Shopify, Stripe, Square, PayPal or Amazon whose
  deposits never match their sales, because the platform kept fees, refunds
  and shipping before paying out.
- A tradesperson, cleaner, salon owner, trainer, driver or landlord who gets
  paid by Zelle, Venmo and card readers and has never been sure which lines
  are income and which are just money moving between their own accounts.
- A club or PTO treasurer who has to show the committee where the money went.
- Anyone who already uses QuickBooks or Xero, or has an accountant, and wants
  the sorting done before the file goes over.

## The problem, in your words

"I have three hundred lines a month and half of them say something like
`POS DEBIT SQ *BLUE BOTTLE 9981`." "Is my credit card payment an expense?"
"My accountant charges me to categorise transactions I could have done if I
knew how." "Every bookkeeping app wants my bank login."

The sorting is boring, the traps are quiet, and the usual fix costs a
subscription and a bank connection you may not want to hand over.

## What you get

**Balanced books from the files your bank already gives you.** You download
a statement, the tool reads it, and every line gets a suggested account with
a confidence and a short reason. Out the other end come a trial balance, a
profit and loss by month, a balance sheet and close checks.

**Less work every month.** Each line you file teaches it. When you have
filed the same payee the same way a few times, that payee's next line posts
by itself. Lines it is unsure of wait in a review queue for you; nothing
guessed by a model or a keyword list posts without you.

**The traps handled.** A card payment from checking is paired with the
matching line on the card statement and booked as a transfer, not an
expense. A payout from Stripe, PayPal or Amazon can be split into gross sales
and fees. The books are reconciled against the running balance on your
statement, or against a closing balance you type from a paper one.

**A clean hand-off.** Export a journal for QuickBooks Online, Xero, QuickBooks
Desktop (IIF), a ledger/hledger journal or a plain journal CSV, so you or
your accountant can carry on in the software you already use.

**Files it reads.** Bank and card CSV, Excel (.xlsx and .xls), OFX, QFX, QIF,
MT940, BAI2, Spanish Norma 43, French CFONB 120, CAMT.053, a statement PDF
that has a text layer, or the text copied out of one.

There is a lot more behind the "Optional" panels on the page (invoices and
bills, loans, prepaid expenses, equipment and depreciation, stock you resell,
payroll provider reports, a sales tax worksheet, US Schedule C and 1099-NEC
worksheets). You do not need any of it to start.

## Your first ten minutes

1. Open the tool at
   https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/. There is no
   sign-up and no key to enter.
2. Click **Load the example (three synthetic months)** to see a finished set of
   books for a made-up business before you touch your own. Look at the review
   queue and the reports, then start fresh with **Start empty books** under
   "6. Export and save".
3. Download a month of transactions from your bank as CSV (or OFX, QFX, QIF;
   most banks offer one of these). In **1. Import a statement**, say which
   account it is for, choose the file and press **Import**.
4. Do the same for your credit card. Most card exports list charges as
   positive numbers, so tick **Charges are positive in this file (most card
   exports)**. If your dates read 31/01/2026, tick **Dates are day first**.
5. Go to **2. Review queue**. Use **Accept every suggestion at or above** a
   confidence you are comfortable with, then work through the rest: pick the
   right account for each line, tick it, and press **File the ticked lines**.
   For a payout that is part sales and part fees, open **Split** on that line
   and type the parts, for example `4000:1000.00, 6010:-30.00`.
6. Read **4. Reports**: profit and loss, balance sheet and the close checks.
   If a check fails, it tells you which lines to look at.
7. In **6. Export and save**, press **Download the books file** and keep it
   somewhere safe. If your accountant uses QuickBooks or Xero, download the
   matching journal from the same section.

Next month, import the new statements into the same books. The payees you
filed before will start posting themselves.

## How well does it learn?

The README measures this on a synthetic year for a made-up design studio,
importing one month at a time and filing each month correctly: from the
fourth month on, 1,300 of 2,164 lines posted by themselves and one of those
went to the wrong account; 542 of 642 review suggestions were right. That
data is synthetic, and the same author wrote the generator and the built-in
keywords, so treat the numbers as a picture of how fast it picks up your own
payees, not a promise about your bank. The README says so in as many words.

## What it costs and where your data goes

It is free and MIT licensed. The page runs in your browser and nothing is
uploaded: your books live in this browser's storage and in the JSON file you
download. In Chrome, Edge or Opera you can use **Open a books file and keep it
saved** to keep the books live in a file you pick, such as one in a synced
folder.

The AI layer is off unless you turn it on. Under **3. Optional: ask an AI
about the review queue** you can add your own Anthropic, OpenAI or Gemini
key, or point it at a model running on your own computer (Ollama, LM Studio,
llama.cpp). If you use a hosted provider, the lines still in review (date,
description, amount), your chart of accounts and up to 40 lines you already
filed go to that provider under your key. With a local model they stay on
your machine. Either way, the model only suggests; you still file.

The hosted page is best-effort with no uptime promise, so the downloaded
books file is your copy of record, not the browser.

## What it does not do

- It is not accounting, tax or financial advice, and it does not replace an
  accountant. You are responsible for checking what it produces.
- No bank feeds. You download statements and import them.
- It keeps cash-basis books from bank lines, with invoices and bills as an
  option. Payroll runs from a provider's report can be booked, but it does no
  payroll filings, wage bases or state rules, and no sales tax filings.
- A scanned, image-only statement PDF is not read; it needs OCR first.
- Stock is single-location only.
- The AI layer's accuracy has not been measured yet.

## Where to go next

- The tool: https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/
- The basics, with a worked example of the three traps:
  [How to do bookkeeping from bank statements](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/how-to-do-bookkeeping-from-bank-statements.html)
- Moving to an accounting package:
  [Bank statement to QuickBooks or Xero](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/bank-statement-to-quickbooks-xero.html)
- Guides for your kind of business, for example
  [trades contractors](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/trades-bookkeeping.html),
  [freelancers](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/freelancer-bookkeeping.html),
  [Etsy sellers](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/etsy-bookkeeping.html)
  and [rental property](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/rental-property-bookkeeping.html).
- US dates to plan around:
  [Small business tax calendar](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/tax-calendar.html)
- The full README, command line and measurements: `ventures/ai-bookkeeper/README.md`
- If you invoice into Europe, read
  [the e-invoice preflight start-here post](2026-10-29-start-here-einvoice-preflight.md);
  if you schedule staff, [the shift roster one](2026-10-29-start-here-shift-roster-builder.md);
  for the rest of the free tools, [free tools for your trade](2026-10-29-start-here-free-tools-for-your-trade.md).
- Driving it from an AI agent:
  [AI agents and MCP](2026-10-29-start-here-ai-agents-and-mcp.md).
- Back to [the start-here series](2026-10-29-start-here.md).
