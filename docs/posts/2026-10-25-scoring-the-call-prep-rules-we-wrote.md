---
title: "We scored our call-prep rules on fresh notes: 61% of fields found, 85% precision"
date: 2026-10-25
description: "Scoring the Sales Agent's call-prep rules on fresh notes: 61% of fields found at 85% precision, and what the misses show."
tags: [sales-agent, evaluation, rules]
---

The Sales Agent turns call notes into a prep brief and a follow-up email. Both
run on keyword rules, so we measured them instead of assuming they work.

**Follow-up line sorting** (is a line ours, theirs, the dated next step, or
recap?) scored 32 of 44 on the first labelled set. Misses were phrasings like
"Promised to email the ROI model", "Send her the guide" and "Follow-up meeting
next Friday". After fixing them it reads 44 of 44, which only proves the floor.
On 26 fresh lines written afterwards it scored 24, then 25 after one more fix
("Need to send Marcus the docs" was read as a person called Need).

**Prep field detection** (which of nine discovery fields a note mentions)
scored recall 48% at the start. On 20 fresh notes after tuning: 12 exact, recall
61%, precision 85%. Paraphrase beats keywords: "two full days every month to
chase receipts" is a pain, and no list of words says so.

The practical reading: when the agent says a field is unknown it is sometimes
wrong, so you get one extra question on the agenda; when it says known, it shows
the quote. All notes were written by an agent, not taken from real calls. The
next step is a set labelled by a person. Code and data: `ventures/sales-agent/eval/`.
