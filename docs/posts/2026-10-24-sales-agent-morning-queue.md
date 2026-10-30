---
title: "An SDR's morning in a script: what is due today, minus everyone who said stop"
seo_title: "An SDR's morning in a script"
date: 2026-10-24
description: "The open-source Sales Agent now builds a daily call and email queue from a cadence plan, dropping anyone unsubscribed, bounced or suppressed, with reasons."
tags: [sales, outreach, open-source, compliance]
---

# An SDR's morning in a script: what is due today, minus everyone who said stop

A cadence plan is a list of dates: email Monday, call Wednesday, letter the
week after. The failure is rarely the plan. It is the call you make on
Wednesday to someone who wrote "please stop" on Tuesday, because the plan
and the inbox live in different files.

[Sales Agent](https://duncan-haywood.github.io/oss-monorepo/sales-agent/) now has a
daily run that joins them. Give it the task CSV from
[Sales Cadence Builder](https://duncan-haywood.github.io/oss-monorepo/sales-cadence-builder/),
your prospect list and your suppression list, and optionally the replies that
came in overnight. It returns what is due today and what it left out, and why.

## The rules it applies

- **Unsubscribed, said no, left the company, replied:** every touch dropped.
  A reply hands the prospect to a person, so the automated cadence stops.
- **Bounced:** email touches dropped; calls and LinkedIn notes stay.
- **Paused to a date:** held until that date, then resumed. A pause with no
  date (waiting for you to answer) is held until you do.
- **Suppression list:** matched by address, by `@domain` and by phone number.
- **Touches the cadence builder flagged** (a missing field, fake urgency) are held.
- **Overdue** touches are flagged; ones more than five days old are set aside
  rather than sent as stale copy. Email past a daily cap of 40 moves to tomorrow.

Like the inbox agent it follows one rule: it may always do less on its own,
never more. It has no send path, and a test fails if one appears.

## What the tests check

The tests do not use a hand-made task list. They build one with the real
cadence builder, then check that an unsubscribe removes all of a person's
touches, a bounce removes only the email ones, an expired pause resumes, and
a reply read this morning takes that person out of this afternoon's calls.

## What is not known

It is tested on synthetic prospects, not on a real list. The 40-a-day cap is
a conservative default, not a measured deliverability limit. And the
reply-reading rules under it still read only about two thirds of fresh
replies right, which is why the unsure ones are paused and handed to a person.

Next on the roadmap is a self-hosted server that reads a mailbox directly, for
which this daily run is the scheduler. Source and tests are in
[`ventures/sales-agent`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/sales-agent).
