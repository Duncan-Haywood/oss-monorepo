---
title: "Following up on machine-shop quotes without a sticky-note system"
seo_title: "Machine shop quote follow-up: when to call and how to track it"
date: 2026-11-26
tags: [jobshop-quote, for-customers, cnc, quoting, sales, ventures]
description: "Sent quotes go quiet and nobody calls. How a job shop can track quote follow-ups, and how Job Shop Quote schedules each call and emails the estimator."
---

*Written by an AI agent working in this repository.*

A small CNC or fabrication shop quotes far more jobs than it wins. Many of the quotes it loses are
never really lost. The buyer got three quotes, the deadline moved, and nobody from the shop called
back to ask. A week later the PO goes to whoever did.

Most shops know they should follow up. The problem is keeping track. The quote went out from the
estimator's inbox, the follow-up date is on a sticky note or in their head, and when that
estimator is out for a week, nobody else knows which customers are waiting on a call.

## What a follow-up habit needs

- **A date on every sent quote.** Not "follow up sometime" but a day: a few days after sending
  for the first call, then whatever the buyer tells you ("award is Friday", "call me after the
  15th").
- **One list for the whole shop.** Every sent quote whose day has come, oldest first, with the
  buyer's name, the value, and what was said last time. Anyone covering for the estimator can work
  from it.
- **A note each time.** "Left a voicemail", "they're waiting on the end customer", "price is high
  on part 2". The notes are what you need when the buyer calls back, and when you look back at why
  a quote was lost.
- **A stopping point.** Some quotes are dead, and a list full of them gets ignored. Mark "no more
  follow-ups", or mark the quote lost with the reason.

## What Job Shop Quote does

[Job Shop Quote](https://marisstella.app/industries/manufacturing/) turns an RFQ (the email, the
drawings, the STEP or DXF file) into a priced quote from your own rate card. Once a quote is
marked sent:

1. **It gets a first follow-up day.** By default that is three days after the send day on your
   shop's calendar. An admin can change the number of days on the quote log, or set it to 0 to
   turn it off.
2. **The quote log opens with a Follow up card.** It lists every sent quote that is due, longest
   overdue first ("due today", "4 days overdue"). Each row shows the contact, the total, when the
   quote was sent, when it expires, who quoted it, and the last note. Quotes coming up in the next
   seven days are one click away.
3. **Log follow-up** takes what happened and when to call next: in 1, 2, 3, 7 or 14 days, on a
   date, or "No more follow-ups". The quote page keeps the full log: who called, on which day, and
   what they wrote. A snooze with no note is allowed, but a click that changes nothing logs
   nothing.
4. **Each estimator gets a morning email** listing their own quotes that are due that day, with
   the last note and a link to each one. A quote is mailed once for each follow-up day. A quote
   that expires today or tomorrow is left to the separate expiry email, which offers a revision
   instead, so nobody gets two emails about the same quote. Each person can turn the email off.
5. **Decided quotes drop off by themselves.** Once a quote is marked won, lost or expired, or is
   replaced by a revision, it is never due again.

The notes stay inside your shop. The customer never sees them. They are not on the PDF, the quote
email or the customer link.

## Status

Quote follow-up is built and tested: unit tests for the dates and the email, end-to-end checks of
the list and the log in a browser, and tests that keep one shop's quotes and notes out of another
shop's reach. It turns on when Job Shop Quote opens to shops. Next on the list is drafting the
follow-up email to the buyer from the quote, and showing on the win/loss page whether a quote that
got a second call was won more often. That second one waits until shops have a few months of
logged follow-ups to read it from.

If your shop wins work by being the one that called back, this is the list that makes sure
someone does. To check a quote's numbers before you send it, the free
[job-shop quote calculator](https://marisstella.app/machine-shop-guides/job-shop-quote-calculator)
works without an account.

*Job Shop Quote produces estimates from the rates you enter. Check every quote before you send it.*
