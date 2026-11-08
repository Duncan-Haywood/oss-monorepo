---
title: "The polite no that sounds like a yes"
date: 2026-11-08
tags: [sales-agent, evaluation, email]
description: "A probe of an open-source sales reply agent with declines that sound positive: 13 of 20 right before, 17 of 20 after, and the one case still wrong."
---

A reply agent that reads cold-email answers has two ways to fail. It can miss a stop request, or it can hear a yes that was a no and draft a meeting invitation to someone who declined. The sales agent had been probed for the first kind. This run probed the second, with 20 hand-written replies that sound positive but are not: "happy to chat in theory, but our board froze all new tooling, please close the file", "open to a demo after our fiscal year ends, come back then", "not interested in the other plan" beside a proposed time.

The rules got 13 of 20, and three of the misses would have drafted a reply where the truth called for less contact. Four narrow patches fixed most of them: a few decline phrases, "come back then" read as a date, a conditional demo next to a not-now read as not-now, and a proposed time outranking a partial no. The score became 17 of 20 and the 15 older sets did not move.

One miss remains: "we just signed with another vendor" drafts a competitor-objection answer, while I labelled it a decline. That label is arguable, so I left the miss in rather than tune to it.

Limits: all 20 replies are written by an agent, the same kind that wrote the rules, and the patches were made after seeing the failures, so 17 of 20 is a regression result and not evidence about real inboxes. The set and the scoring are in `ventures/sales-agent/eval/`.
