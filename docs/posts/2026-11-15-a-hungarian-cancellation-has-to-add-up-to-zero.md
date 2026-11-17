---
title: "A Hungarian cancellation has to add up to zero: checking NAV corrections against their invoice"
seo_title: "NAV Online Számla: checking a STORNO against its invoice"
date: 2026-11-15
tags: [e-invoicing, hungary, nav, online-szamla, open-source, einvoice-preflight]
description: "NAV checks a correction or cancellation against the invoice it refers to. Drop both into the checker and it now runs those checks offline."
---

Every Hungarian B2B invoice is reported to the tax authority, NAV, through the Online Számla
interface. Corrections are reported too. A modification (MODIFY) carries the *difference*: a
line that takes 2,200,000 forints off, or a new line that adds one. A cancellation (STORNO)
carries whatever reverses what is left of the invoice. NAV keeps the chain: the base invoice,
modification 1, modification 2, and so on.

Some of NAV's checks only work against that chain. Is this the first cancellation? Does the
cancellation bring the net, the VAT and the forint VAT back to zero? Has modification number 2
been used already? Does a new line reuse a line number an earlier correction created? Until
today [einvoice-preflight](../../ventures/einvoice-preflight/README.md) listed all of these as
"skipped", because one file cannot answer them.

## Two files can

If you drop the base invoice and its corrections together, the chain is right there. So the
checker now builds it. It matches each correction to its base invoice by
`originalInvoiceNumber` and walks the corrections in `modificationIndex` order. Along the way it
keeps track of which line numbers exist, the running totals, the last delivery date and whether
a cancellation has already arrived. Then it runs the checks the 2026-02-12 edition of NAV's
interface specification defines against its store:

- the four blocking errors that need the chain: a changed invoice category, a created line
  number that already exists, a reused modification number, and `modifyWithoutMaster` set to
  true while the base invoice is right there;
- the whole of Annex I section I.5: a document arriving after a cancellation, and a
  cancellation whose net, gross, VAT or forint VAT, added to the chain so far, is not zero
  (one unit tolerated; for forint VAT, 1 HUF or 0.01 of the invoice currency);
- warnings 342, 632 and 1030: a correction dated before its invoice, merged lines switched back
  off, a modified line that is not in the chain;
- warnings 11400 and 11401, which NAV calls "a common error in invoicing programs": the
  correction's delivery date silently replaced by the day the correction was issued.

## NAV's own samples

NAV publishes six correction scenarios in its sample folder. All six come out clean. One of
them, "Modositas es ervenytelenites" (modification and cancellation), is a good test of the
arithmetic. The invoice is 5,500,000 forints net. Modification 1 takes off 2,200,000 and the
second document takes off 3,300,000. Read as a STORNO, it brings the net and the VAT to exactly
zero. Make it 1 forint short and it still passes. Make it 2 short and the checker flags it,
which is where NAV's tolerance puts the line.

We seeded 58 faults of eight kinds into those chains (a reused index, a correction dated before
its invoice, a moved delivery date, another customer's tax number and so on). All 58 were caught
by the code the specification gives for them. The first run's one miss was in our test harness:
we had expected the delivery-date fault on the cancellation to come out as 11400, and the
checker gave 11401, which is the code NAV uses for a STORNO.

## The limit

A bare `InvoiceData` file does not say whether it will be sent as MODIFY or STORNO. Only the
`manageInvoice` request around it does. So a bare file is checked as a modification, and the
report says plainly that the cancellation sums did not run. Drop the request and they do. And
"received earlier" here means earlier among the files you dropped, not what NAV actually holds.
A clean result means the chain you have is consistent. It does not mean NAV will accept it.

Everything runs in the browser, and nothing is uploaded. The measurements are in the
[eval note](../../ventures/einvoice-preflight/eval/nav-chain-2026-11-15.md), and the code is
MIT.

*Not tax advice. Rule ids are ours; NAV's codes are quoted from its published specification
(nav-gov-hu/Online-Invoice, MIT). Not affiliated with NAV.*
