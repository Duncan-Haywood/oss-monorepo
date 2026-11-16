---
title: "Reading Oregon's scheduling law itself: two pricing mistakes and a standby list"
seo_title: "Oregon predictive scheduling: the standby list and the 30-minute rule"
date: 2026-11-16
tags: [scheduling, shift-roster-builder, fair-workweek, oregon, compliance]
description: "Checked against ORS 653.455, Shift Roster Builder priced small start changes and short extra shifts wrong in Oregon; it now has the voluntary standby list too."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) team hub keeps a log of
every change to a posted week and prices each one under a predictive-scheduling rule
set. The first Oregon preset was written from search summaries, because oregon.gov and
the published statutes did not answer from that session. Today the Oregon Legislature's
chapter 653 page did answer, so I checked the preset against
[ORS 653.432, 653.436 and 653.455](https://www.oregonlegislature.gov/bills_laws/ors/ors653.html)
as amended in 2024.

## Two mistakes the summaries hid

**A start or end changed by 30 minutes or less owes nothing, even when hours are lost.**
ORS 653.455(3)(a) says the extra pay does not apply when the employer "changes the start
or end time of an employee's work shift by 30 minutes or less". The preset only waived
*added* time under 30 minutes. A shift that started 20 minutes later was billed half of
those 20 minutes ($2.50 at $15 an hour). It now owes nothing. At 31 minutes it is priced
as before. Widening a shift by 20 minutes at each end still owes the hour, because that
adds 40 minutes of work, more than the 30 that (2)(a)(A) allows.

**An extra shift owes the hour whatever its length.** The "more than 30 minutes" in
(2)(a)(A) is about work added *to* a shift. Scheduling "an additional work shift" is its
own item, (2)(a)(C), with no threshold. The code had let a separate shift of 30 minutes
or less go free, and it did so in every preset. That is fixed too.

Both errors were small. A manager who trusted the old numbers would have underpaid in
the second case and overpaid in the first.

## The voluntary standby list

ORS 653.432 lets an employer keep a list of people who agreed in writing to be asked for
extra hours after an unexpected absence or customer need. Hours someone on the list
agrees to work owe no predictability pay. The statute says what the written notice must
contain: the list is voluntary and how to leave it, how hours are offered and accepted,
that nobody has to accept, and that accepted hours earn no extra pay.

The hub now has the list when `FAIR_WORKWEEK=oregon` is set:

- staff join it on their own page by ticking a written agreement under those four
  statements, and leave it at any time, there or by asking the manager. Every join and
  removal is kept in a dated record;
- each call-out has an "Ask the standby list" button. It posts the hours to the people
  on the list (on the staff page and the team chat webhook), and only they can say yes;
- a shift given to someone who said yes is logged as "standby list" and priced as exempt,
  with the statute cited in the reason.

The statute also adds a condition that is easy to miss. The exemption for cover after a
colleague's absence, the "offer to the whole team" the hub already had, applies only if
the employer "has contacted all of the employees listed on the voluntary standby list"
(653.455(3)(k)(C)). So a team offer taken while people on the list were never asked is
now priced in Oregon, and the reason says how many were skipped. The call-out box tells
the manager to ask the list first.

## What this is and is not

It is the rule text turned into a workflow, with tests on each edge: 20, 30 and 31
minutes, the 40-minute widening, the 30-minute extra shift, and the whole flow in the hub
from joining to the logged cover. It has not been checked by an employment lawyer, and
no real Oregon site has used it yet. The anti-retaliation rule and the $2,000 coercion
penalty are shown to the manager as notes, not enforced by the software. It is an
estimate to check before payroll, not legal advice.
