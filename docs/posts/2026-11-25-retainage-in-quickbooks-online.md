---
title: "QuickBooks has no retainage field: how subcontractors track it anyway"
seo_title: "How to track retainage in QuickBooks Online (step by step)"
date: 2026-11-25
tags: [construction, subcontractors, retainage, quickbooks, pay-applications, pay-app-guides, for-customers]
description: "QuickBooks Online cannot hold back retainage on an invoice. The Retainage Receivable account and item, the release invoice, and the report that hides it."
---

A subcontractor billing $40,000 of work at 10% retainage expects to be paid
$36,000 this month and $4,000 at the end of the job. QuickBooks Online can
send the $36,000 invoice, but it has no retainage field: nothing on the
invoice holds the $4,000 back, works out the percentage, or reminds anyone
it is owed. Our [new guide](https://marisstella.app/pay-app-guides/retainage-in-quickbooks.html)
sets up the workaround that answers on Intuit's own community forum keep
giving, and works one $150,000 subcontract through it.

**The setup is two things.** A *Retainage Receivable* account (type Other
Current Assets, detail type Retainage, which Intuit's guide to detail types
describes as the one for customers who hold back part of a contract until
the project is finished), and a *Retainage* item whose income account is
that asset account. Each pay app gets a negative Retainage line for the
holdback. On accrual books, the full value of the work goes to income, the
payment due to accounts receivable, and the holdback waits in the asset
account. When the money is released, a new invoice with a positive
Retainage line moves it into receivables without booking the income twice.

**Where it goes wrong.**

- *The A/R aging report leaves retainage out*, because it sits in an asset
  account. Over three pay apps on the example job, $15,000 is owed and appears on no
  aging report. You have to run the account itself, or Transaction Detail
  by Account filtered to it, and remember to bill the release.
- *Cash-basis books.* Users on Intuit's forum report that the asset-account
  item makes a cash-basis profit and loss show income before retainage is
  paid, and the suggested fixes disagree. The guide says so and sends you
  to your accountant rather than picking one.
- *Retainage you hold on your own subs* is a liability, Retainage Payable,
  and should never share the receivable account.

The page also has a small calculator: type the period's billing, the
retainage rate (or a held amount when stored materials run at another
rate) and any release, and it prints the invoice lines and total to type
into QuickBooks. It runs in the browser, uploads nothing, and is tested
against the worked example.

How the guide was made: Intuit's help and community pages were read on
2026-11-25 through search results, because this session could not load
quickbooks.intuit.com directly. Every step links the Intuit page it came
from. Most are community answers, some several years old, so check menu
labels against your own screen. Not affiliated with Intuit; not accounting
advice.

This is the gap the pay-app suite we are building is meant to close:
retainage worked out per line on every pay application, a running balance
per job, a reminder when it is due for release, and a QuickBooks sync. It
is in development with early access at
[marisstella.app/industries/construction](https://marisstella.app/industries/construction/).
Nothing is for sale yet.
