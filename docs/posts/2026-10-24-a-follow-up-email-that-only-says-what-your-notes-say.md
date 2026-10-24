---
title: "A follow-up email that only says what your call notes say"
date: 2026-10-24
description: "Sales Agent now drafts the post-call follow-up from your notes, refuses invented numbers, and writes nothing for anyone who asked to stop."
tags: [sales, ai-agents, email, compliance]
---

# A follow-up email that only says what your call notes say

After a sales call the follow-up email is the step people skip or write badly:
a vague "great chatting", a promise nobody wrote down, no date for the next call.
Sales Agent (a self-hosted, approve-everything outreach assistant in this
repository) now writes that draft from your notes.

You type one point per line. It sorts them into what was said, what you promised
("I will send..."), what they promised ("Dana will check..."), and a dated next
step ("Next call Tuesday"). The draft quotes those lines and nothing else. If the
notes have no dated next step it says so and asks for times instead of inventing one.

Two guardrails carry over from the inbox agent. Every draft goes through the same
checks: a number that is in neither your notes nor your offer blocks approval, as
do guarantees, fake urgency, unfilled placeholders and a missing opt-out line.
And anyone who asked to stop, bounced, or is on your suppression list gets no
draft at all, only a warning.

What is not proven: the sorting is pattern matching on phrases like "I will" and
"Name will", tested on hand-written notes. It has not been scored on real call
notes, and the README says so. Nothing is sent; you copy the draft into your own
mail client.

Try it: `node cli.mjs --followup dana@example.com --notes notes.txt --prospects prospects.csv --offer offer.json`
in `ventures/sales-agent`.
