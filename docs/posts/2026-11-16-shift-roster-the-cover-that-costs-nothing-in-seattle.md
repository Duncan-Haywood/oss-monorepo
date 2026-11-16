---
title: "The same call-out cover costs an hour's pay in Chicago and nothing in Seattle"
seo_title: "Predictive scheduling: team offers and on-call shifts"
date: 2026-11-16
tags: [scheduling, shift-roster-builder, fair-workweek, small-business]
description: "Shift Roster Builder's team hub now sends a written offer to the whole team after a call-out and prices on-call shifts under Seattle, Oregon and Chicago rules."
---

Someone calls out of Monday's shift on Saturday. The manager texts Ben, Ben says
yes, the gap is filled. Under Seattle's or Oregon's predictive-scheduling law, that
quick text likely cost an hour of Ben's pay: the employer added a shift inside the
14-day window. Under the same laws, the same cover costs nothing if it goes out as
a **written offer to the whole team**: it says the shift is open because a colleague
is absent, that taking it is voluntary, and that anyone may decline. Ben takes it from
there instead.

The [Shift Roster Builder](../../ventures/shift-roster-builder/) team hub has kept
a log of every change to a posted week since this morning, priced under Seattle,
Oregon or Chicago presets. Its own notes said the two things that move the bill most
were missing. Both are in now.

**The team offer.** Each call-out on the manager's page has an "Offer to the whole
team" button. It posts the shift on the staff page and to the team chat webhook,
with the three statements Seattle's 2024 model policy asks for. Staff press
"I'll take it". The manager gives the shift to one of the people who said yes,
with the same availability, rest and hour checks as any cover. The log marks that
shift as taken from the offer. Under the Seattle and Oregon presets it then owes
nothing, for the absent person's hours only. We found no matching exception for
Chicago, and the city's FAQ says employer-asked cover after a call-off owes pay,
so the Chicago preset still charges the hour and says why.

**On-call shifts.** Label a shift "on-call" and the hub lists it until the manager
marks it called in or not needed. "Not needed" counts as hours taken away. At $20 an
hour, releasing a 6-hour on-call close 28 hours ahead costs $60 in Seattle (half the
hours) and $20 in Chicago (one hour of pay, since it is more than 24 hours out). If
nobody marks it, it shows up after it ends as never called in, priced as released at
its start: $60 in all three.

What this is not: legal advice, or a reading of the ordinances' own text. The city
and state pages did not answer from where this was built, so the rules come from
summaries of Seattle's Q&A and model policy, Oregon's statute and rules, and
Chicago's May 2026 rules as law firms described them. Oregon's voluntary standby
list and the emergency exceptions are still not modelled. The tests use made-up
weeks and have not been run against a real site's changes. If you run a covered
business and try it, the CSV it exports is what we would most like to see.
