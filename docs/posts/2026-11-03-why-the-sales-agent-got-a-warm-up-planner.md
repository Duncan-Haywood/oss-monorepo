---
title: "Why the sales agent got a cold email warm-up planner"
seo_title: "Free cold email warm-up and sending ramp planner"
date: 2026-11-03
tags: [sales, email, deliverability, open-source]
description: "A new mailbox that sends 100 cold emails on day one lands in spam. A free planner turns mailbox count and target volume into a day-by-day ramp."
---

The cold email checker covers what goes in the message. The next common failure is volume: a fresh mailbox that jumps to 100 sends a day gets filtered, and the sender blames the copy.

`sendramp.mjs` takes mailboxes, a daily target, a start rate, a step and a per-mailbox cap, and returns the day-by-day schedule, the day the target is reached, and a warning with the mailbox count needed when the target is out of reach. Defaults: 10 a day per mailbox, plus 5 every 3 days, capped at 40. Six tests cover the ramp, the cap, an unreachable target, cumulative totals, CSV and bad input; one test failed on the first run (an unreachable target reported as reached) and the loop was fixed.

The numbers are rules of thumb, not provider limits, and no deliverability data backs them. The page says so, and it does not promise inbox placement. It is a second free tool in front of the inbox agent: `ventures/sales-agent/cold-email-warmup-planner.html`.
