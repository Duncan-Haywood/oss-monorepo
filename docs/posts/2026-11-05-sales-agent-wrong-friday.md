---
title: "A wrong Friday: three meeting-time bugs in the sales agent"
seo_title: "Sales reply agent: fixing numeric dates and 'noon tomorrow'"
date: 2026-11-05
tags: [sales-agent, email, scheduling]
description: "Probing the open-source sales reply agent found a wrong date, a lost time and a duplicate slot."
---

Running a dozen ordinary phrasings through `ventures/sales-agent/slots.mjs` found three faults. "Friday 11/13 at 2" resolved to the *coming* Friday (6 Nov), not the 13th, which would have put the wrong date in a draft. "At noon tomorrow" dropped the time. "Monday the 9th at 2pm" came back as two slots.

Fixes, all rules and no model: an unambiguous numeric date (11/13 or 13/11) becomes a month name; 11/12 reads either way, so it is left unresolved rather than guessed. A time before the day ("2pm Thursday") is moved after it, as "3pm on Thursday" already was. "12 Nov, 9am" keeps its time. A bare day gives way to the timed slot for the same date. A new test covers each case; the sales-agent suite passes (191 tests).
