# Invoice Aging & Late Payer Analyzer

A free browser tool for freelancers, agencies, trades and any small business that invoices on
terms: **load an invoice export and see who owes you, how late it is, and who always pays
slow.** The file is read in the browser; nothing is uploaded and no accounting login is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/invoice-aging-late-payer-analyzer/

After using this, you can now **see an aging report, days sales outstanding, how long each
client really takes to pay, the habitual late payers, a chase list ranked by balance times days
late, what waiting past the due date has cost, and how much of the open balance the clients'
own history says will arrive in the next 30 days**, which used to mean a pivot table over a
QuickBooks export and a guess.

## Input

Any CSV with a `Customer` (or `Client`), an `Invoice Date` and an `Amount` (or `Total`), plus at
least one of `Paid Date`, `Balance` (or `Amount Due`) or `Status`. `Due Date` and `Invoice
Number` are used when present; with no due date it is the invoice date plus the terms you type.
Void, draft and written-off invoices are left out. **Column names are matched by alias and no
real accounting export was available**; if a file is not read, the page lists the rows it
skipped and why, and a sheet with the headers above always works.

## Model

Days late is as-of (or paid) date minus due date. Aging buckets add up to the open total. DSO
is open balance over the last 90 days' billing times 90. Forecast expects each open invoice on
its client's median days to pay (three paid invoices needed, else the book's median); an
invoice already older than that is not forecast. Cost of waiting is dollar-days past due times
a yearly rate you type (10% default, a placeholder). The late fee line is an illustration, not
a claim it is chargeable. Partial payment dates, credit notes, currency and disputes are not
modelled.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Payment chance (added 2026-09-30)

Each open invoice also gets an estimated chance of being paid in the next 30 days and an "at risk" amount. The estimate
is a Kaplan-Meier conditional probability on the days-past-due clock (paid invoices are events, open invoices are
censored), shrunk toward a 30% prior and blended per client by how much of their history was still at risk. It is scored
on the owner's own paid invoices with a leave-one-out backtest against a constant guess, and the page says when it is no
better than that. It estimates what happens without action, not the uplift from chasing.
