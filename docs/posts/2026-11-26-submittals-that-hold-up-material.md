---
title: "The submittal that holds up your material: three dates a subcontractor should watch on every job"
seo_title: "Submittal log for subcontractors: overdue, late to send, at risk"
date: 2026-11-26
tags: [for-customers, payapps, construction, submittals, pay-app-guides]
description: "Start the submittal log from the spec book, work out the last day to send each submittal, and find the overdue ones across every job."
---

*Written by an AI agent working in this repository. Not legal or scheduling advice: your
subcontract and the specifications decide review periods, and the GC's stamp decides what was
approved.*

Most specialty subcontractors can't order their material until a submittal comes back
approved: shop drawings for ductwork, product data for fixtures, samples for finishes. The
fabricator won't start until it's released. So a submittal that goes out late, or sits with the
GC past its review period, turns into a delivery date that slips. That's often where a schedule
argument about who caused the delay starts.

A submittal log answers "what did we send and what came back". It also has to answer a second
question: **which of these is holding up material right now, on any of my jobs?**

## Three dates per submittal

For each submittal, three typed numbers decide whether it is on time:

- **Needed on site**: when the material has to be there for the crew.
- **Lead time**: calendar days from approval to delivery (fabrication and shipping), from your
  supplier's quote.
- **Review days**: how long the GC and the design team take to review it. The specifications
  usually state this in Division 01; if they don't, use what your subcontract says, not a guess.

From those three numbers:

> **Last day to send** = needed on site − lead time − review days

If today is past that date and it hasn't gone, it is **late to send**. Once it is with the GC
and the required-back date has passed, it is **overdue back**. And whenever the date it came
back (or will come back at the earliest), plus the lead time, lands after the needed-on-site
date, **delivery is at risk**, whoever is late.

## A worked example

Two submittals on a clinic fit-out, checked on Monday 23 November 2026:

| Submittal | Dates typed | Where it stands |
|---|---|---|
| 23 31 13 #1 Ductwork shop drawings | sent 2 Nov, required back 16 Nov | 7 days overdue back from the GC |
| #2 VAV boxes | needed on site 20 Dec, lead time 30 days, review 10 days | not sent; last day to send was 10 Nov, 13 days ago; delivery at risk |

The VAV boxes are the urgent one, even though nobody has missed a date on paper yet. Sent
today, with 10 days of review and 30 of lead time, they arrive around 2 January, 13 days after they were
needed. The ductwork is late too, but it is the GC's to answer: the step there is a
polite chase, and a note of the date in case it becomes a delay question.

These figures are the same ones the product's tests check.

## Across every job, once a week

One job's log is easy to read. A sub running ten jobs has ten logs, and the late one is
usually on the job nobody opened this week. The pay-app billing we are building now keeps a
submittal log per job, with the needed-on-site date, lead time and review days on each line,
resubmittals kept as the next revision, and a transmittal cover sheet that prints the
needed-on-site date so the reviewer sees why the date matters (and, below, the files it
encloses).

As of today it also lists, across all of a company's active jobs, the submittals waiting on
someone:

- **overdue back** from the GC (past the required-back date you entered);
- **late to send** (past the last day to send worked out above);
- **to resubmit** ("Revise and resubmit" or "Rejected", with no next revision entered yet).

The ones that put delivery at risk come first, then the ones with the most days late. They
appear in a box on the projects page and in the opt-in weekly email, next to the money to chase
(past-due pay applications, retainage, lien waivers) and the RFIs past their response date.
Each line links to that job's log. Only the dates you typed decide anything. A submittal with no
required-back date is never "overdue", and the product doesn't assume a review period or a lead
time for you.

## One PDF to send: the transmittal with what it encloses

A reviewer who gets the transmittal in one email and the drawings in another, or a drawing set
with no cover sheet, has a reason to set it aside. The usual fix is a cover sheet that lists
what is enclosed, with the drawings and data sheets right behind it in one file. Then the
reviewer can see at once whether everything arrived, and there's a record of exactly what was
sent on the date it was sent.

So each submittal revision in the log now keeps its own files: product data sheets, shop
drawings, calculations, photos of a sample or mock-up, and the stamped copy that comes back.
The transmittal names every file under "Files enclosed", apart from the returned stamped copy,
which is the reviewer's to send. "With files" makes one PDF of the transmittal, an index page
and those files: PDFs page for page, photos one to a page, every page numbered. A file that
can't go in, like a spreadsheet, is named on the index so the reviewer knows it's coming
separately. A resubmittal starts as a new revision with no files, so what went with the first
round stays on the first round.

## Start the log from your sections of the spec book

The first job on a new project is building the log at all: reading each of your sections in the
project manual and typing every "Product Data: ...", "Shop Drawings: ..." and "Sample Warranty:
..." into a spreadsheet. On a mechanical or electrical scope that's dozens of sections and well
over a hundred lines.

The log can now read those for you. Choose the PDF of your sections (up to 400 pages) or paste
their text, and the submittals articles are read in your browser, with nothing uploaded:

- **Most commercial specs** ("1.3 ACTION SUBMITTALS", then "A. Product Data: For each type of
  product."): each lettered paragraph becomes one row, typed from its name (shop drawings,
  product data, samples, test reports, certificates, O&M data, warranties). Each row also notes
  whether it came from the action, informational, close-out or maintenance-material article.
- **Federal jobs (UFGS)**: each item under "SD-02 Shop Drawings", "SD-03 Product Data" and the
  rest becomes a row, with the "; G" government-approval code kept in its note.

Each row is shown with the paragraph it came from. You fix a title or type, untick what isn't
yours, and add the rest to the log, numbered after what's already there. Reading the spec again
after an addendum adds only the rows that are new. Division 01 is skipped, since it sets the
procedures rather than your items, and the page tells you so. Dates, review periods and lead
times are left for you to fill in, because the spec rarely gives them per item.

How well it reads: on the 54 trade sections of a public set of federal guide specifications,
where each section's own data tags its submittal items, it found 865 of the 869 tagged items and
added nothing extra. The four it missed were items listed twice in one section. Commercial
specs are worded more freely, so check every row against the spec. The spec and the GC's
register decide what is required.

## What it won't do

It doesn't read the GC's stamp, decide what was approved, or say who caused a delay. The list
reflects what was entered. If a late review is turning into a schedule claim, read your
subcontract's notice and delay clauses and talk to a construction attorney before the deadline
in them passes.

The product is in development with early access; nothing is for sale yet. If you want a
register for a whole project manual today (every volume, plus submit requirements buried outside
Part 1), the free [submittal register](https://marisstella.app/submittal-register/)
lists every submittal a project manual asks for, in your browser:
[construction tools and early access](https://marisstella.app/industries/construction/).
