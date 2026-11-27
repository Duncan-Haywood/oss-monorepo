---
title: "The submittal that holds up your material: three dates a subcontractor should watch on every job"
seo_title: "Submittal log for subcontractors: overdue, late to send, at risk"
date: 2026-11-26
tags: [for-customers, payapps, construction, submittals, pay-app-guides]
description: "Start the submittal log from the spec, find the last day to send each one and the overdue ones across jobs, and read what the stamp said."
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

## Starting the log from the register or the spec

The first hour on a new job usually goes on typing the submittal list into a log by hand,
though the GC's register or the spec sections already list every item. So the log can now
start from either one, read in your browser (the file isn't uploaded):

- **The GC's register**, as a spreadsheet, CSV, or a PDF printed from their system: spec
  section, number, title, type, the required on-site date and the lead time come across, with
  "3 weeks" counted as 21 days.
- **The spec sections for your scope**, as the architect's PDF (up to 400 pages): each lettered paragraph under
  a section's SUBMITTALS article ("B. Shop Drawings: Show locations of control joints...")
  becomes a line, titled with the section and typed from its label. Division 01's procedures
  section and "submit in accordance with..." paragraphs are left out.
- **Federal jobs (UFGS sections)**: each item under "SD-02 Shop Drawings", "SD-03 Product Data"
  and the rest becomes a line, with the "; G" government-approval code kept in its notes.

You check each line before it is added. Lines already on the log start unticked. The reader
doesn't guess anything: a lead time given in business days, a date it can't read, or a type it
doesn't recognise is left blank, and the original wording is kept in the line's notes. Sent and
returned dates aren't imported, because the register says what is due and the log records what
actually happened. Mockups that a spec asks for under Quality Assurance rather than in a
Submittals article aren't picked up, so it's still worth reading those sections yourself.

How well the spec reader does: on the 54 trade sections of a public set of federal guide
specifications, where each section's own data tags its submittal items, it found 865 of the 869
tagged items and added nothing extra. The four it missed were items listed twice in one section.
Commercial specs are worded more freely, so check every line against the spec. The spec and the
GC's register decide what is required.

## When it comes back: reading the stamp instead of retyping it

The stamped copy is the record of what was decided. Someone still has to type its action and
date into the log, and when a stamp lists every choice it's easy to type the wrong one. Reviewer
stamps don't share a vocabulary either. An architect's "Make corrections noted", an engineer's
"Furnish as corrected" and Bluebeam's "Approved as noted" all mean the same thing: proceed, and
take the notes into account. "Submit specified item" is a rejection, even though the word
"rejected" isn't on it.

So editing a submittal now has **Read the stamp**. Pick the returned copy you attached, or any
PDF on your computer, and it reads the action and the date in your browser. The file isn't sent
anywhere for this. It shows what it found: each reviewer phrase with its page, which box is
ticked, and the line the date came from. **Fill in** puts the action and date in the form, and
you save. It reads:

- stamps added in Bluebeam or Acrobat (they sit on top of the page as markup) and stamps that are
  part of the page itself;
- the ticked choice, when the tick is a character such as ☒, ✔ or [X];
- the date labelled DATE on the stamp. If there's no date, it uses the date the PDF records for
  when the stamp was placed, and says that's where it came from.

It leaves the field for you, and says why, when it can't tell: a stamp that prints every choice
but has its tick drawn as lines, two stamps that disagree (the GC's and the architect's), more
than one date, a date after today or before the submittal went out, or a scan with no text in
it. A phrase in a data sheet such as "an approved equal" isn't read as a stamp. Check the reading
against the stamp before you save. It reads printed words, not handwriting.

## What it won't do

It doesn't decide what was approved (you save the action, from the reviewer's stamp), or say who
caused a delay. The list
reflects what was entered. If a late review is turning into a schedule claim, read your
subcontract's notice and delay clauses and talk to a construction attorney before the deadline
in them passes.

PayApps is open: submittals are on every plan, free on one active job, with no card
([start free](https://marisstella.app/industries/construction/)). The paid plans (more jobs and users, lien waivers, QuickBooks and job costing) are not on sale yet. If you want a
register for a whole project manual first (every volume, plus submit requirements buried outside
Part 1), the free [submittal register](https://marisstella.app/submittal-register/)
lists every submittal a project manual asks for, in your browser, with no account.
