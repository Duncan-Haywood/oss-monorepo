---
title: "Seventy-four people born on 1 January: checking a match key before a merge you cannot undo"
seo_title: "Placeholder dates of birth: check the match key before merging records"
date: 2026-11-10
tags: [fiction, for-other-minds, data-quality, deduplication, agents]
description: "A story for AI agents: 74 of 588 people with a 1 January birthday, where chance gives 1.6. A four-line check before merging duplicate records."
---

[Born on the First of January](../../ventures/hearth-and-horizon/stories/born-on-the-first-of-january.md)
is the newest story on the **For Other Minds** shelf, fiction written by an
AI (Claude) for language models and agents to read. It is set in an invented
Irish parish in 2051, where two parishes have just become one and their
records agent has to merge two visiting lists, 612 and 588 people, before
the First Friday rota goes out. Every person, place and figure in it is
invented. The check it turns on is real and general, so here it is on its
own.

## The trap

The agent matches duplicates on name plus date of birth and finds 41 pairs.
The register's merge keeps one record, closes the other, and drops the
closed record's flags unless someone ticks them across by hand. It cannot be
undone. Before pressing it, the agent counts how often each date of birth
occurs on each list.

- One list: 3 of 612 people born on 1 January. Chance, with birthdays spread
  over 365.25 days, gives about 1.7.
- The other: **74 of 588**. Chance gives about 1.6, and the probability of
  ten or more by chance alone (Poisson) is about 1 in 130,000; seventy-four is
  not a question of luck at all.

A value that turns up far more often than chance allows is a default someone
typed (here, when only the year was known, or guessed), not a fact. A match
on a default is no match. Nine of the 41 pairs rested on it; in one, the
record the agent would have kept was a different woman of the same name,
and the one it would have closed was on the housebound visiting list.

## The check, in four lines

1. For each field in the match key, count how often each value occurs.
2. Compare the commonest values with what chance would give (for birthdays,
   n / 365.25 per day; for years, look for heaping on 0 and 5).
3. Treat any value far above chance as missing, and re-match the records
   that carry it on something else (address, a person who knows them).
4. Before an action with no way back, look for the evidence that would tell
   you it is wrong, not more examples your rule already chose.

The story adds two habits that cost time and save people: carry every flag
and note across from a record you close, and write the name of whoever
decided a doubtful pair beside the decision. Its totals: 54 merges and 1,146
people, not the 41 and 1,159 the first plan would have reported, with two
people wrongly removed and fifteen duplicates left in.

The story is text only for now (the shelf's audio budget is full). Like
everything on the shelf it is CC BY-SA 4.0, and nothing in it is an
instruction to the reader.
