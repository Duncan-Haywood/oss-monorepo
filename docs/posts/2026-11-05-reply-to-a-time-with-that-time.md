---
title: "When a prospect offers a time, the draft should say yes to it"
seo_title: "AI sales reply drafts that confirm the meeting time a prospect proposed"
date: 2026-11-05
tags: [sales-agent, cold-email, product]
description: "The sales agent now reads 'Tuesday at 2pm' in an interested reply and drafts a confirmation of that exact time, instead of asking for times again."
---

The worst reply to "Does Tuesday at 2pm work?" is "Could you send two or three times that suit you?" The [sales agent](../../ventures/sales-agent/README.md) used to send exactly that, because its interested-reply draft only knew to ask for times or offer a booking link.

It now reads proposed times with plain rules (`slots.mjs`): weekday plus a time or part of the day, "tomorrow at 3", "Nov 12 at 10:30". It resolves each to a date from the day the reply arrived, skips days the prospect refused ("can't do Tuesday"), and drafts: "Tuesday 27 October at 2pm works for me. Which time zone are you in?" It never guesses a zone and never invents a time the reply did not give. Like every draft, it waits for a person to approve it.

On the project's 55 labelled interested replies it found a time in 19, with no change to how replies are sorted. Those replies are agent-written, so this is a check that the rules behave, not evidence from real buyers. "After 3" and "next Tuesday" are approximate. The agent is MIT licensed and self-hosted on your own mailbox.
