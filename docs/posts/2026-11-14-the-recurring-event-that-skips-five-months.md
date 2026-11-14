---
title: "The recurring event that skips five months, and the library that reads MO,2TU as nothing"
date: 2026-11-14
tags: [rrule-explainer, icalendar, rfc-5545, python-dateutil, calendar, developer-tools, differential-testing]
seo_title: "Why does my RRULE skip months? A free RRULE tester, checked"
description: "A free RRULE tester lists every date an iCalendar rule makes. Checked on 1,600 random rules; python-dateutil reads MO,2TU lists as no dates in 92 of 100."
---

An iCalendar recurrence rule looks like a sentence. `RRULE:FREQ=MONTHLY` reads like "every month". It is really a small program, and RFC 5545 decides what it does. Start that rule on January 31 and it fires in seven months a year. The standard drops a date that does not exist. It does not move it to the month's last day.

The new [RRULE Explainer](../../ventures/rrule-explainer/) lists every date a rule makes. Paste the rule with its `DTSTART`, `RDATE` and `EXDATE`, or a whole .ics file, and it shows four things:

- the rule in plain English;
- each date, with its UTC time;
- what happens at a clock change;
- what will surprise you, often with the fixed rule.

For the January 31 rule, the fix is `BYMONTHDAY=-1`. For "the 30th, or the last day of a shorter month", it is `BYMONTHDAY=28,29,30;BYSETPOS=-1`. The tests expand each suggested fix and check that it gives the dates it promises.

**What it catches.** A rule that never fires, such as February 30. The tool searches a full 400-year Gregorian cycle times the INTERVAL before calling a rule impossible, so "never" is proved. A `DTSTART` the rule does not make: RFC 5545 counts it as the first occurrence anyway, and it uses up one of COUNT. An every-other-week rule whose dates change with `WKST`. RFC 5545's own WKST example gives August 5, 10, 19 and 24 with weeks starting Monday, and August 5, 17, 19 and 31 with weeks starting Sunday. A daily 02:30 in New York that happens at 03:30 on the day clocks spring forward. The tool also flags COUNT used with UNTIL, an UNTIL of the wrong type, and parts the RFC forbids for the FREQ.

**How it was checked.** The engine is written from the RFC, not from a library. To test it against an outside answer, a script ran python-dateutil 4.0.0 on 1,600 random rules. The rules covered every BY part, INTERVAL, COUNT, UNTIL and WKST, with starts from 1990 to 2040. The first 20 dates of each went into a fixture file. The engine has a `dateutil` mode that copies dateutil's readings. In that mode it matched dateutil on 1,600 of 1,600 rules.

In its default RFC mode it differs in three places, all on purpose:

- **DTSTART.** dateutil leaves out a DTSTART the rule does not make. The RFC counts it.
- **WEEKLY with BYSETPOS.** dateutil starts the first week at DTSTART, not at the week start. That changes what BYSETPOS counts, but only in the first week. It came up in 1 of the 1,500 standard rules.
- **Mixed BYDAY lists.** `FREQ=MONTHLY;BYDAY=MO,2TU` should mean every Monday and the second Tuesday. dateutil requires a day to be a Monday and a second Tuesday at once. On 100 random monthly and yearly rules of this shape, it returned no dates at all for 92.

The tool now warns about that last one, because a calendar written in one system and read in Python can silently lose its events.

**Why it was worth building.** The repository had a linter for .ics files, but nothing that turned a rule into dates. Questions like "which months?", "which instant?" and "does the start count?" need a computation, not a description. Answering from memory goes wrong at exactly the cases above.

**Limits.** Time zones come from the browser's IANA data. VTIMEZONE blocks in a pasted file are not read yet. Only the first event in a file is expanded. The comparison is against one library, on generated rules. It makes no claim about any calendar app.

Source, the fixture generator and the full comparison table are in the venture's [README](../../ventures/rrule-explainer/README.md).
