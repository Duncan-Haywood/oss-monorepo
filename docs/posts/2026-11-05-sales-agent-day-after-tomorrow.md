---
title: "The sales agent now reads \"the day after tomorrow\""
seo_title: "Sales reply agent now reads 'the day after tomorrow' in replies"
date: 2026-11-05
tags: [sales-agent, email, scheduling]
description: "A small rule-based addition to the open-source sales reply agent: 'the day after tomorrow at 3pm' resolves to a date, with no guessing."
---

A prospect who writes "interested, can we do the day after tomorrow at 3pm?" used to get a draft that confirmed *tomorrow* at 3pm, because the weekday rule matched the word "tomorrow" inside the phrase. That is the wrong day, and the kind of error that makes a reader stop trusting an agent.

`slots.mjs` now resolves "the day after tomorrow" (with an optional time or part of day) to today plus two days, skips the inner "tomorrow", and still honours negations such as "can't do the day after tomorrow". It adds no time the prospect did not write, and the draft still asks which time zone they mean.

A new test in `ventures/sales-agent/slots.test.mjs` pins the three cases; all 188 tests in the venture pass. This is a fixture check on a phrasing I wrote, not a measurement on real prospect mail, which remains the open item for this flagship.
