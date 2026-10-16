# Upwork Earnings and Fee Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/upwork-earnings-fee-analyzer/>

A free browser tool for freelancers: **drop in your Upwork (or similar) transaction
history CSV and see what you actually keep.** The file is read in the browser; nothing
is uploaded and no account access is needed.

After using this, you can now **see the service fee you really paid, what Connects,
membership and withdrawal fees add on top, take-home by contract and by month, and net
pay per hour where hours are in the file**, which used to mean building the pivot table
by hand or granting another finance app access to your account.

## Input

Any CSV with a `Date` and an `Amount`. `Type`, `Description`, `Ref ID`, `Team`/`Client`
and `Hours` are used when present; hours are also read from text like `12.5 hrs` in the
description. Fees may be negative or positive. US and day-first dates, comma/tab/semicolon
files and UTF-16 exports are read. Unreadable rows are listed with a line number and reason.

## Model

Earnings are positive rows of an earnings type; refunds are subtracted; fees are grouped
into service, Connects, membership, withdrawal and other; a withdrawal itself is cash-out,
not a cost. Service fees are matched to a payment by Ref ID, else same date and contract.
Net per hour deducts the payment's own service fee and uses only payments with hours.
The observed fee rate is reported, never assumed. See the page for what is not modelled.

## Run

Open `index.html` through any static server. Tests: `node --test`.
