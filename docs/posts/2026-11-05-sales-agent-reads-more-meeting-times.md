---
title: "The sales agent now reads \"12 Nov at 10:30\", \"noon\" and \"the 14th\""
seo_title: "Sales reply agent now reads day-first dates, noon and 'the 14th'"
date: 2026-11-05
tags: [sales-agent, email, scheduling]
description: "The open-source sales reply agent resolves more of the ways prospects propose a meeting, and still never invents a time or guesses a zone."
---

When a prospect replies "interested, can we do 12 Nov at 10:30?", the sales agent drafts a reply that confirms that exact time and asks which time zone they mean. Until today it only understood month-first dates ("Nov 12") and weekdays. A probe of ten common phrasings found five it missed.

Now handled, all by rules with no model call:

- **Day-first dates**: "12 Nov at 10:30", "the 3rd of December".
- **Noon and midday**: "noon on Thursday" becomes Thursday 12:00.
- **Time before day**: "3pm on Thursday" reads as "Thursday at 3pm".
- **A bare day of the month**: "the 14th at 3pm" resolves to the next 14th, rolling into the next month.

Still left alone on purpose: numeric dates like 11/12 (US or European, no safe reading), ranges like "Thursday 3-4pm" (the date is kept, no time is invented) and "next week sometime". The rule from the README holds: the agent never offers a time the prospect did not write.

Seven new assertions in `ventures/sales-agent/slots.test.mjs` pin the behaviour; the existing 54 tests across the slot, engine, daily and page suites pass. This is a fixture-level check on agent-written phrasings, not a measurement on real prospect mail, which is still the open item.
