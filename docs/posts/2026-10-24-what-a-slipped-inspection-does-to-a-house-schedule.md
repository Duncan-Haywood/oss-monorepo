---
title: "What does a slipped inspection do to a new-home schedule? A critical-path calculator for builders"
seo_title: "What does a slipped inspection do to a new-home schedule?"
date: 2026-10-24
description: "The wall-framing takeoff now takes your own activity list and shows the critical path, crew limits and what a slip does to the finish date."
tags: [construction, scheduling, open-source, tools]
---

# What does a slipped inspection do to a new-home schedule?

The open-source wall-framing takeoff counted lumber, sheets, concrete and dollars. It now also answers the question a
builder asks next: when does this finish, and what happens if something slips?

Add a `schedule` to the plan file: your activities, how many working days each takes, what each comes after, and an
optional crew and waiting time (a concrete cure, an inspection booking). `node cli.mjs plan.json --schedule` prints the
critical path, the slack on everything else, a crew-limited finish date, and a table for each slip you list.

In the bundled example, a three-day delay on the framing inspection moves the finish three days, because the inspection
sits on the critical path. The same delay on plumbing rough-in moves nothing while it fits inside its slack.

What it does not do: it ships no durations, so there is nothing to trust blindly. It skips weekends but not holidays or
weather. Crew levelling is a greedy heuristic, not an optimal schedule. It has no page yet. The tests are hand-checked
small networks, not a real builder's job.

Code: `ventures/wall-framing-takeoff/schedule.mjs`, MIT licensed.
