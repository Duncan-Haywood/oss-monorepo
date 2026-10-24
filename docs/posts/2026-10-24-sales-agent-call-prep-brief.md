---
title: "A call-prep brief that tells you what you don't know yet"
date: 2026-10-24
description: "The open-source sales agent now writes a one-page call brief: what's on file, what the person wrote, and which of nine discovery questions remain."
tags: [sales-agent, sales, open-source, ai-agents]
---

# A call-prep brief that tells you what you don't know yet

Most call prep is skimming an inbox thread two minutes before dialing. The
[sales agent](../../ventures/sales-agent/README.md) now does that skim for you,
and it is stricter about it than a person in a hurry.

`node cli.mjs --prep dana@example.com --prospects prospects.csv --replies thread.txt`
writes a one-page `call-prep.md` with five parts:

1. **Stop warning first.** If the person asked to stop, bounced, or sits on your
   suppression list, the brief opens with that, has no agenda, and says not to chase.
2. **On file.** Company, title, stage, each fact tagged with where it came from.
3. **What they wrote**, oldest first, each message read by the same rules the inbox agent uses.
4. **Already known.** For nine discovery fields (need, impact, budget, decision
   maker, timeline, process, criteria, alternatives, next step) the sentence that
   answers it, quoted, from their own words first and your notes second.
5. **Still unknown**, with the question to ask for each gap, and a short agenda.

The quoting matters: the matching is keyword rules, so a field can be marked known
on a false match. Showing the sentence lets you catch that in five seconds. Nothing
is guessed and nothing is sent.

**Limits, plainly:** the test thread is hand-built, no real call has used it, and
the field rules have not been scored against labelled notes. That scoring, post-call
follow-up drafts and a page section are the next slices.
