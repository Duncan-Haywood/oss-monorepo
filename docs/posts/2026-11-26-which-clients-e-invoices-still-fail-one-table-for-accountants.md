---
title: "Which clients' e-invoices still fail? One table for the whole practice"
seo_title: "E-invoice readiness across all clients, for accountants"
date: 2026-11-26
tags: [for-customers, einvoice-preflight, e-invoicing, xrechnung, factur-x, accountants, germany, france]
description: "Before the 2027 deadlines, a practice needs to know which clients still send failing e-invoices. Our workspace now shows every client in one table, with a CSV."
---

Germany requires e-invoices from companies with prior-year turnover above
€800,000 from 1 January 2027, and from everyone a year later. French SMEs follow
from 1 September 2027 (sources on our
[deadlines page](https://marisstella.app/einvoice-preflight/e-invoicing-deadlines-2027.html)).
A Steuerberater or expert-comptable with forty clients will be asked the same
question forty times: are our invoices ready? Checking one file at a time
answers it for one client on one day. It doesn't tell the practice where to
start.

The workspace for [E-invoice Preflight](https://marisstella.app/einvoice-preflight/)
now opens on a table of every client. It is not open to the public yet: the
hosting is built but not deployed, and paid plans are not on sale. This post
describes what the table does, so a practice can judge it before it opens.

## What each row says

For each client company, over the last 7, 30, 90 or 365 days:

- **Status.** *Needs attention* if at least one invoice checked in that period
  still fails. *OK* if it was checked and nothing is open. *Not checked
  lately* if its last check is older than the period. *Never checked* if no
  invoice has been uploaded yet.
- **Last checked**, and the number of **invoices** checked.
- **Pass rate**: the share of those invoices that pass, counting one that our
  safe fixes repaired as passing.
- **Still failing**: how many are open. Expand the number to see the file names
  and the rules each one breaks.
- **Most frequent rules**: for example `BR-DE-15` (the buyer reference
  XRechnung requires) or a missing seller VAT identifier. When one rule keeps
  coming back for a client, that usually points to a setting in their invoicing
  software, not a one-off typo.

Clients that need attention come first, then the ones unchecked for longest,
then the ones never checked. "Download CSV" saves the same table with one row
per client, with column headings in German, French or English. It opens in
Excel with umlauts and accents intact, and a client name that starts with `=`
or `+` cannot run as a formula.

## How it counts

Accountants re-upload the same files. A client sends a corrected invoice, or the
same export lands in two batches. So the table counts each **distinct file**
once, identified by a SHA-256 checksum of its bytes, at its latest check. If you
upload the same invoice ten times, it is still one invoice.

A failure stops counting as open in two cases:

1. One of the safe fixes (date format, decimals, currency code, Peppol process
   identifier) repaired the file, and the repaired file passed every check
   that ran.
2. The fix needed a person, and the corrected copy passed a later check.

Anything else stays open until someone deals with it. The table never marks an
invoice as passing because a model said so. Pass or fail comes only from the
deterministic checks, the same ones that run on each upload.

## What it costs, and what it keeps

The table is built only from the check history. That history holds file names,
checksums, rule ids and fix ids, never the invoice contents. So opening it
doesn't use up the plan's monthly invoice allowance, and it holds no more
client data than the history already did. Through the API it is
`GET /v1/dashboard?days=30`, or `&format=csv&lang=de` for the spreadsheet.

## What it does not do yet

- It does not group failures by the invoice's seller. The history keeps no
  seller identifier, and storing a seller's VAT number would mean amending the
  processing agreement first. If practices ask for it, we will add it.
- It does not email the table. A weekly summary to the firm's sign-in address
  is the next step, once email sign-in is switched on.
- It does not decide whether a client falls under a mandate. The
  [accountants page](https://marisstella.app/einvoice-preflight/) covers which
  deadline applies, from facts you enter. That judgement stays yours.

None of this is tax or legal advice. The checks are the ones listed on the
site, and the workspace says which rule sets ran on every result.
