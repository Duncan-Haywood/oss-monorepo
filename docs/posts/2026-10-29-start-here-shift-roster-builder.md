---
title: "Start here: Shift Roster Builder, the week's schedule without the Sunday-night puzzle"
seo_title: "Shift Roster Builder: the week's schedule, no Sunday-night puzzle"
date: 2026-10-29
tags: [start-here, shift-roster-builder, scheduling, small-business]
description: "Who Shift Roster Builder is for, what it does for a small team's weekly rota, your first ten minutes, and the labour rules it does not model."
---

If you manage a small team and the weekly schedule is a spreadsheet you
shuffle on Sunday night, this post is for you. It covers who Shift Roster
Builder suits, what it gives you, how to build your first week in about ten
minutes, and the limits you should know before you post anything.

## Who it is for

- The owner or manager of a café, restaurant, salon, shop or clinic front
  desk who schedules named people by the week.
- Someone with five to a dozen staff, each with their own availability,
  hour limits and wage, who keeps finding out on Friday that a close has
  nobody on it.
- A manager trying to keep overtime down, stop "clopening" (closing one night
  and opening the next morning), or share weekends and closes fairly.
- Anyone scheduling 14- and 15-year-olds in the US who wants the federal hour
  limits checked rather than remembered.
- A small team that does not want to pay per seat for a scheduling app just
  to get a rota out.

## The problem, in your words

"Ana can't do Wednesdays, Dev is maxed at 25 hours, Gus closed last night so
he can't open, and I still have a Friday close nobody can take." "I didn't
see the overtime until payroll." "Somebody called out and I spent an hour
texting people who couldn't come in anyway."

Checking availability, rest gaps and hour caps by eye is slow, and the
spreadsheet never tells you a shift is unfillable until it is too late.

## What you get

**A roster that respects the rules you set.** You list the shifts to cover
and your people. It builds a week that covers as many shift-hours as it can,
never puts anyone outside their availability, never double-books, keeps the
minimum rest between shifts, and stays inside each person's weekly hours and
days-in-a-row limit. Within that, it keeps payroll down, including overtime
at the multiplier you choose.

**Answers instead of blanks.** Every shift it cannot fill comes with a
reason, for example "Fri 2pm-10pm close: 4 people are free then, but 4 at
their weekly hour limit". A "Who this week depends on" report rebuilds the
week without each person, so you can see whose absence would hurt most.

**Help when the week changes.** After a build, pick any shift to see who
could take it without moving anyone else, cheapest first, with overtime
flagged. The same panel lists one-for-one swaps that keep both people's
weeks inside the rules.

**Ready to post.** Hours and pay by person, CSV exports, a calendar (.ics)
file for everyone or one person, a paste-ready text per person, a group
message for the open shifts, and **Print a wall copy**, which prints only
names and shifts, with no wages, for the break room.

**More when you want it.** Daily overtime presets for California, Alaska and
Colorado, unpaid meal breaks, split-shift premiums, pay differentials, a tip
pool split by hours, labour cost against projected sales, and planning
several weeks in a row with closes and weekends rotated.

## Your first ten minutes

1. Open https://duncan-haywood.github.io/oss-monorepo/shift-roster-builder/.
   There is no account.
2. Under **or start from a template**, use **Choose a business type** (café or
   restaurant, hair salon, retail shop or clinic front office). The page
   builds a roster for an invented team straight away, so you can see what a
   finished week looks like. **Load an example** does the same with a sample
   week.
3. Replace the invented team in **Your people** with yours, one person per
   line: name, hourly wage, max hours a week, min hours a week, availability.
   Availability reads like `Mon-Fri 9-17; Sat off`. Add `off: Wed` for a day
   off this week, or `roles: cook` if only some people can work a station.
4. In **Shifts to cover**, write one line per requirement: day(s), start,
   end, people needed, and an optional label, such as a Friday close that
   needs two people.
5. Check the rules: **Minimum rest between shifts (hours)**, **Most days in a
   row**, **Overtime after (hours a week)** and **Overtime pay multiplier**.
   If your state has daily overtime, pick it from **Overtime rule (state
   presets)**.
6. Press **Build the roster**. Read **The roster**, the open shifts with
   their reasons, **Hours and pay by person** and **Who this week depends
   on**.
7. Press **Save setup file** so next week starts from this one. The page
   also remembers your setup in this browser.

To gather availability without retyping it, use **Collect your team's
availability**: it makes a link to a phone-friendly week grid each person
fills in and texts back as one line, which you paste in and merge with
**Merge into staff list**.

## A worked example

The README's invented café week has 7 people and 32 shifts. The tool covers
29 of the 32 for $3,622 with no overtime hours, and each of the three open
shifts says why. That is invented data, used to show the output, not a
benchmark of your week.

## What it costs and where your data goes

It is free and MIT licensed. The browser tool uploads nothing: your staff
list, wages and shifts stay in this browser's local storage (**Forget saved
data** clears them) and in any setup file you save. **Copy share link** puts
the whole setup, including pay, in the link itself; it is not sent to a
server, but anyone you send it to can see wages, so share it only with
people who may.

If you want staff to open one link to see their shifts, add them to their
calendar, ask for time off, offer a trade or report a call-out, there is an
optional server you run yourself (Docker, Fly or Render). It keeps one JSON
file on a disk you own, needs no accounts, and runs nothing on the author's
accounts. Wages and hour caps never appear on the staff page. It sends no
texts or emails itself: it gives you pre-filled Text and Email links to send
from your own phone. See
[the self-hosting post](2026-10-29-start-here-self-hosting.md) for how that
kind of setup works.

## What it does not do

- It is a planning aid, not legal advice. Check your state and city rules.
- Predictive-scheduling and fair-workweek laws are not built in. A "changes
  since you posted it" report does the arithmetic on a notice rule you type
  in, and ships no city presets.
- Youth limits: only the US federal rules for 14- and 15-year-olds are
  applied. State rules, work permits, union rules and seniority are not
  modelled.
- No payroll, no time clock, no push notifications. If you need those, a
  paid scheduler is the better fit, and the README says so.
- The roster comes from a fast search that can miss the very best answer. On
  small weeks an exact check runs and says when the result is proven best;
  on bigger weeks it says when it could not prove it.
- It was tested on invented teams and against exhaustive search on small
  problems, not on a real business's payroll.

## Where to go next

- The tool: https://duncan-haywood.github.io/oss-monorepo/shift-roster-builder/
- Guides:
  [how to make an employee schedule](https://duncan-haywood.github.io/oss-monorepo/shift-roster-builder/how-to-make-an-employee-schedule.html),
  [how to reduce overtime](https://duncan-haywood.github.io/oss-monorepo/shift-roster-builder/how-to-reduce-overtime-in-a-schedule.html),
  [how to cover a call-out](https://duncan-haywood.github.io/oss-monorepo/shift-roster-builder/how-to-cover-a-shift-when-someone-calls-out.html),
  [how to avoid clopening](https://duncan-haywood.github.io/oss-monorepo/shift-roster-builder/how-to-avoid-clopening.html),
  [scheduling 14 and 15 year olds](https://duncan-haywood.github.io/oss-monorepo/shift-roster-builder/scheduling-14-and-15-year-olds.html)
  and [do I need to hire another employee?](https://duncan-haywood.github.io/oss-monorepo/shift-roster-builder/do-i-need-to-hire-another-employee.html)
- A blank template if you want paper first:
  [employee schedule template](https://duncan-haywood.github.io/oss-monorepo/shift-roster-builder/employee-schedule-template.html)
- The README, command line and the self-hosted server:
  `ventures/shift-roster-builder/README.md`
- Your books, once payroll has gone out:
  [the AI Bookkeeper start-here post](2026-10-29-start-here-ai-bookkeeper.md).
  Other free tools for restaurants and salons:
  [free tools for your trade](2026-10-29-start-here-free-tools-for-your-trade.md).
- Back to [the start-here series](2026-10-29-start-here.md).
