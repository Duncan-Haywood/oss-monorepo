---
title: "Openings this week: a babysitter's free time, worked out from her own calendar"
date: 2026-10-30
tags: [babysitting-business-kit, scheduling, booking]
description: "The kit now lists a sitter's open times, drafts the 'openings this week' post, shows the week as a grid, and lets families request a time she approves."
---

Most babysitters who work for themselves fill their week the same way: a post in a church group or a text to a few parents saying when they are free. Writing that post means reading the calendar, remembering which sits repeat, leaving time to drive between families and dropping the gaps too short to be worth a sit. The [Babysitting Business Kit](https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/) now does that arithmetic.

**Open slots.** For the next one to eight weeks, it takes the sitter's weekly availability, removes every booked sit (weekly repeats included, skipped dates excluded) with a travel buffer on each side, and keeps only the windows at least as long as her minimum sit. With the default settings (weekdays 3-10pm, Saturday 8am-11:30pm, a 3-hour minimum and a 30-minute buffer), a 4-7pm sit on Tuesday leaves nothing that day: 3-3:30pm and 7:30-10pm are both shorter than three hours. Set the minimum to two hours and the 7:30-10pm window comes back. Those two cases are tests in `slots.test.mjs`, which has 12 tests for this module.

**The post.** With full-evening sits on Monday, Wednesday and Friday and a 6:30pm sit on Thursday, the drafted text is, word for word from the test:

> Openings this week: Tue 3-10pm, Thu 3-6pm, Sat all day

"All day" is used only when nothing cuts into an availability window of ten hours or more; otherwise the times are given. Later weeks carry dates ("Tue Nov 10 3-10pm") so nobody guesses which Tuesday.

**The week view.** The Schedule tab now has a seven-column grid: sits as blocks, open time in green, and each child's allergy on the sit's block ("Mia: peanuts"), because that is the thing to see before walking in. A weekly repeat has a Skip button on each date, which takes that one week off (a family's vacation) and turns the time green again; Restore puts it back.

**Requests, not bookings.** A sitter who runs the optional self-hosted server gets a `/book` page. It lists only open times. No family name, child, address or reason a time is taken appears there, and a test checks the page for sixteen strings from the example desk (names, phone numbers, the allergy, the addresses) and finds none. A family picks a window, types a start and end time, their name and how to reach them. That becomes a lead marked `requested`, which holds its time so a second family is not offered the same evening, and the sitter gets a phone alert if she set one up. Nothing is booked until she presses Approve in the app, which shows whether the time still fits and drafts the confirmation text. The page has the same honeypot field and limit of ten posts per address per hour as the inquiry form; five server tests cover the page.

What it does not do: take payment, send the confirmation for her, or sync with Google Calendar. The calendar feed (`/calendar.ics`) goes one way, out to her phone.
