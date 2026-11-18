---
title: "Two cold-email replies our sales agent read as 'unclear'"
seo_title: "Cold email reply triage: wrong-person and competitor replies"
date: 2026-11-05
tags: [sales-agent, cold-email, evaluation]
description: "We probed the sales agent's reply rules with fresh replies and fixed two misses: a bare 'not the right person' and 'we just signed with a competitor'."
---

The [sales agent](../../ventures/sales-agent/) sorts replies to cold outreach so a person only has to decide what to send. Rules do the first pass, and anything they cannot read goes to a human as "unclear".

Probing with ten new, hand-written replies turned up two misses. "Not the right person, try our head of ops, Mike (mike@...)" had no "I'm" in it, so the handover rule missed it and the referral address was dropped. "We just signed with a competitor last week" matched no competitor pattern. Both now classify (a handover with the referral kept, and a competitor objection) and have a regression test.

Neither miss was dangerous, since "unclear" is the safe fallback, but each cost a person a read and lost a lead. Ten probes is not a measurement: these rules were fixed on the same text that exposed them, so they count as regression tests, not accuracy evidence. The existing pinned eval sets still pass unchanged.
