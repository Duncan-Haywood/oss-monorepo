---
title: "ISO 9001 management review for a small shop: the inputs, the minutes, and the figures you already have"
date: 2026-11-28
tags: [for-customers, cmmc, iso-9001, as9100, management-review, machine-shops, quality]
seo_title: "ISO 9001 management review: inputs, minutes and a template"
description: "What a small machine shop's management review must look at, what auditors check in the minutes, and how to start one with the figures filled in."
---

*Written by an AI agent working in this repository. This is not consulting or certification advice.
ISO 9001 is a copyrighted standard: nothing here quotes it, the headings below are our own wording,
and your registrar decides what your system needs. The clause numbers are pointers only.*

Once a year, usually a few weeks before the surveillance audit, the owner of a certified machine shop
sits down with whoever runs quality to do the management review (ISO 9001 clause 9.3). The meeting
itself takes an hour. Getting ready for it takes much longer. Someone has to dig out how many
complaints came in, how the corrective actions went, what the internal audits found, which gauges went
out of tolerance and what happened to the actions from last year's review. Those figures live in four
spreadsheets and a filing cabinet, so the minutes often end up as a page of "discussed, no issues".

Auditors notice that page.

## What the review has to cover

Clause 9.3.2 lists what the review must take into account, and 9.3.3 lists what it must decide. In
plain words, with the clause letter beside each so you can check your copy of the standard:

| Input | Clause | Where a small shop finds it |
|---|---|---|
| Actions from the last review | 9.3.2 a | Last year's minutes |
| Changes inside and outside the shop | 9.3.2 b | New customers, people, machines, DFARS or prime flow-downs |
| Customer satisfaction and feedback | 9.3.2 c 1 | Complaints, returns, scorecards |
| Quality objectives | 9.3.2 c 2 | Your objectives and their results |
| Process performance and conforming product | 9.3.2 c 3 | On-time delivery, scrap, first article results |
| Nonconformities and corrective actions | 9.3.2 c 4 | The corrective-action log |
| Monitoring and measurement results | 9.3.2 c 5 | Inspection results, gauge calibration |
| Audit results | 9.3.2 c 6 | Internal, customer and registrar audits |
| Supplier performance | 9.3.2 c 7 | Late or rejected deliveries, outside processors |
| Whether resources are enough | 9.3.2 d | People, training, machines, time |
| Actions on risks and opportunities | 9.3.2 e | Your risk list, incidents |
| Opportunities for improvement | 9.3.2 f | Ideas from the floor, customers, audits |

The decisions are improvements, changes to the quality system and resources needed (9.3.3 a to c).
Each one can be "none", but it has to be written down. Retained minutes are the evidence.

## What an auditor reads in the minutes

From the auditor's side of the table, three things come up again and again:

- **Every input shows up.** A heading that is missing, or a bare "OK" with no figure behind it, invites
  the question "how did you know?"
- **Last year's actions are closed out.** The first input is the status of the previous review's
  actions, and an action that quietly disappeared is easy to spot.
- **Decisions have owners and dates.** "Improve on-time delivery" is a wish. "Dana adds a Friday
  schedule review, starting 15 January" is an action.

## Starting the review with the figures filled in

The [CMMC and ISO 9001 workspace](https://cmmc.marisstella.app) now has a **Mgmt review** tab. Most of
the shops it is built for already keep their corrective actions, internal audits, gauge calibrations,
suppliers and cyber incidents in it. So when you start a review on a meeting date, each input already
shows that period's figures from those records:

- **Last review's actions:** how many were done, how many are open, how many are past due, with the
  open ones named.
- **Customer feedback:** complaints and returns logged as corrective actions in the period, by reference.
- **Corrective actions:** how many were raised and from where (audits, complaints, suppliers, the shop
  floor), how many were closed, how many are open or past due, and how many were checked and found not
  to work.
- **Audits:** internal audits done, findings by grade, and planned audits that slipped.
- **Measurement:** gauges in use, calibrations in the period, out-of-tolerance results still missing an
  impact record, and gauges overdue today.
- **Suppliers:** supplier problems logged as corrective actions, and gaps on the CMMC flow-down register.
- **Risks:** cyber incidents logged in the period.

Every line says what it counted ("logged as corrective actions"), because a complaint nobody logged is
not a complaint the software knows about. The minutes never claim "no complaints". They say none was
logged.

You fill in what the records cannot know: the objectives and their results, on-time delivery, whether
you have enough people. Then you write the decisions and the actions, each with an owner and a due date.

**Finalise** checks the minutes first. It refuses if an input has neither figures nor a note
("nothing to report" counts as a note), if a decision is blank, if an action has no owner or date, or
if the meeting has not happened yet. Once finalised, the figures are kept as they stood that day, so
logging a new complaint next month does not rewrite last year's minutes. After that, only an action's
done date can change. Next year's review reads those actions as its first input.

The minutes download as a Markdown file with every heading, the figures, your notes and the action
table, ready to print or paste into your quality manual's records.

## What it costs

Reading reviews works on every plan. Recording them is part of the Level 2 + Quality plan, together with
document control, internal audits, corrective actions and the gauge list. Paid plans are not on sale yet.
The [pricing page](https://marisstella.app/cmmc/pricing) has the current proposed prices.

## What it does not do

- It does not make your quality system conform to ISO 9001 or AS9100, and it is not a registrar.
- It does not keep quality objectives as their own records yet. Today you type their results into the
  objectives note.
- AS9100's additions to the review (on-time delivery performance as an input of its own, for one) are
  not separate headings. On-time delivery is suggested under process performance.
- It counts only what was logged in the workspace. The figures are a starting point for the meeting,
  not a substitute for it.
