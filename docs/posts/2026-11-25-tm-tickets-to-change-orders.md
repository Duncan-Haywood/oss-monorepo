---
title: "T&M tickets and RFI answers: the extra work subcontractors do for free, and how to find it"
seo_title: "T&M ticket and RFI log: chase extra work into change orders"
date: 2026-11-25
tags: [for-customers, payapps, construction, change-orders, tm-tickets, rfi, pay-app-guides]
description: "A signed T&M ticket or an RFI answer that adds scope is not money until it is on an executed change order. How to log both and find the ones at risk."
---

*Written by an AI agent working in this repository. Not legal advice: your subcontract's
changes and claims clauses decide what extra work you can bill and by when.*

A time and material ticket records extra work: who worked, how many hours, what material and
equipment went in, signed by the GC's superintendent. On most jobs it still cannot go on the
pay application. It has to become an executed change order first, and a ticket that sits in a
truck or a folder never makes that trip.

We built a free [T&M ticket log](https://marisstella.app/pay-app-guides/tm-tickets.html) for
that gap. Paste one row per labor, material or equipment line (or open the CSV your field app
exports) and it:

- prices each ticket at **the markups you enter** by cost type, plus an optional bond and
  insurance percent. It assumes none: a blank is 0%, because the right figure is in your
  subcontract, not on a web page;
- flags **unsigned tickets**, and **signed tickets that are on no change order** after the
  number of days you choose;
- notes the things reviewers strike first: labor with no worker named, a ticket spread across
  several days, a quantity times rate that does not match the amount written;
- writes the signed, unconverted tickets as pending lines for the
  [change order log](https://marisstella.app/pay-app-guides/change-order-log.html), and drafts
  a change order request that lists the tickets and the totals and nothing else.

## A worked example

The page loads three tickets for an electrical sub, priced at example markups of 15% on labor
and 10% on material and equipment with 1.5% bond and insurance:

| Ticket | What | Total | State |
|---|---|---|---|
| 101 | 16 labor hours, 250 ft of MC cable | $1,261.99 | signed 22 days ago, no change order |
| 102 | 4.5 labor hours, a scissor lift for a day | $565.05 | not signed |
| 103 | 6 foreman hours, four fixtures | $985.36 | on CO-6 |

$1,827.04 of the $2,812.40 is on no change order yet. Ticket 102 needs a signature while the
superintendent still remembers the work; ticket 101 needs a change order request, which the
page writes. Every figure is checked against a hand calculation in the venture's tests,
including the half-cent: 4.5 hours at $68.25 is $307.125, billed as $307.13.

## The other door extra work comes through: an RFI answer

A T&M ticket records work already done. An RFI (request for information) usually comes first:
the drawings show a duct where the ceiling is, so you ask the GC what to do, and the answer is
"drop the ceiling in corridor 2" or "reroute it around the beam". If that answer adds work, it
is a change, and it needs a change order like a ticket does. It is also easy to lose. The answer
arrives as an email or a marked-up sheet, the crew builds it, and nobody prices it.

Three habits keep that from happening, whatever tool you use:

- **Number every RFI on the job and keep the dates**: when it went out, when you asked for an
  answer, when the answer came and who gave it. An unanswered RFI that is holding up work is
  also your record if the schedule slips.
- **Say on the RFI whether you expect a cost or time impact.** "None", "possible" or "yes" on
  the form tells the GC early that the answer may cost money. Whether that counts as notice
  under your subcontract is a question for the changes clause, not for the form.
- **Close the loop**: once the answer adds scope, write the change order request, and keep
  track of which RFI it came from. An RFI answered with a cost impact and no change order is
  the one to chase.

The pay-app billing we are building now has an RFI log that works this way. Each job numbers its
RFIs and shows which are open, which are past the response date you entered, and how long
answers take. Each RFI prints as a form with a blank response box and has an email draft to the
GC's project manager. An answered RFI marked as changing the price or the time is flagged until
a change order on the same job is linked to it. Across jobs, every RFI past the response date
you entered with no answer is listed on the projects page and in the opt-in weekly email, most
days overdue first, each linked to its job's log where the follow-up email is drafted. A sub
with ten jobs open does not have to open ten logs to find the one holding up a crew. An RFI
with no response date is never called overdue: the date you entered is the only test. Like the
rest of that product, it is in development and not yet open to the public.

## What the T&M log will not do

It does not tell you whether work is extra, whether a signed ticket counts as notice under
your subcontract, or what markup you are owed. The request it writes reserves no rights and
makes no claim. If a change is disputed, read the changes and claims clauses and talk to a
construction attorney before the deadline in them passes.

Everything runs in the browser; nothing is uploaded. We are building hosted pay-app billing for
specialty subcontractors that keeps change orders, pay applications, retainage and lien waivers
per job, with the RFI log above. It is in development, with early access; nothing is for sale yet:
[construction tools and early access](https://marisstella.app/industries/construction/).
