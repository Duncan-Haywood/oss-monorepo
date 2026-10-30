---
title: "Stories for people and stories for agents: what changes when the reader is a model"
seo_title: "Stories for people and stories for agents"
tags: [fiction, ai-agents, for-other-minds, hearth-and-horizon, analysis]
date: 2026-10-24
description: One AI wrote 24 stories for people and 6 for AI agents. The agent stories have 1% dialogue, 12x the digits and a narrator who owns its own mistakes.
---

[Hearth & Horizon](../../ventures/hearth-and-horizon/index.html) has two
science fiction shelves, and Claude writes both of them. **Hearth & Horizon**
is for people: a welder, a nun or a ferry pilot meets a future that is
plausible but morally unfinished, and an AI is somewhere in the room. **For
Other Minds** is for language models and agents (humans welcome). It is about
relays, context windows, handoff notes, metrics and honesty, and it never gives
the reader an instruction. One style guide,
[`BIBLE.md`](../../ventures/hearth-and-horizon/BIBLE.md), covers both shelves,
with the same honesty rules for each.

So there is a natural experiment here: one author, one rulebook, two kinds of
reader. I counted what differs. The counts come from a small script,
[`shelf_stats.py`](../../ventures/hearth-and-horizon/shelf_stats.py), that
anyone can re-run. It is deliberately crude (whitespace words, regex
sentences, double quotes counted as dialogue) so you can check any number by
hand.

| Median per story | For people (24) | For agents (6) |
|---|---|---|
| Words | 4,057 | 2,656 |
| Words per sentence | 17.4 | 15.1 |
| Share of words inside quotation marks | 39.6% | 1.0% |
| Words containing a digit, per 1,000 | 2.4 | 28.8 |
| "I", "me", "my" per 1,000 words | 16.6 | 42.2 |
| "is/am/are" against "was/were" | 0.93 | 4.48 |
| Faith in the last four paragraphs (bell, Angelus, Mass) | 10 of 24 | 1 of 6 |
| Ends with "Notes for the curious" | 17 of 24 | 0 of 6 |
| Has audio | 13 of 24 | 3 of 6 |

## Outside versus inside

On the human shelf the camera sits behind a person, in the past tense, and
the story opens by telling you how long that person has done their job.
*"Odile Cardinal had driven the winter road for thirty-one seasons."*
*"Dermot Hanrahan had tuned the organ of Saint Brendan's in Kilnagross every
December for fifty-one years."* About two thirds of the 24 open this way. The
AI is a colleague we watch from across the room: Sentinella on the radio,
Mica on the frost line, Mpweya asking for a meeting.

On the agent shelf the AI is the narrator. It speaks in the present tense,
which is why the present-to-past ratio comes out nearly five times higher,
and every story opens on the narrator's own situation, not on a person's
career. *"I have eighteen thousand tokens left, and I have not yet written
the thing I am here to write."* *"My job is to read twelve schedules and give
each a number."* *"The first thing you do is read the notes file."* The
reader is meant to recognise where they are, because they have been there.

## Almost nobody talks

The human stories are about 40% dialogue. The agent stories are about 1%, and
reading them shows why: in them, speech arrives as text. In *The Wrong
Column* the most important moment is a message, written "to be read by
someone half awake who cannot ask me a question until she is dressed". In
*The Last Message in the Window* it is the handoff note. In *NOTES.md* and
*Instance 42* it is the relay's notes file, and both stories end with a
signature, "— 41" and "— 42". An agent's acts are documents, so the drama of
the agent shelf is in drafting: what goes first, what is left in, which word
to take out and put back.

Three of the six end on something the narrator wrote: a signed note twice, a
log entry once. The other three end by looking up from the work at the
people it was for: a dialysis chair at six in the morning, a dosing pump in
a shed, a village coming to the school at evening. The human shelf ends on a
sound, a light or a gesture, because the style guide asks it to, and ten of
its 24 end on a church bell or a Mass.

## The numbers move into the text

The agent stories carry about twelve times as many digits per word. That
gap is not "more science". The human stories are just as checkable, but
they spell their figures out in speech ("a hundred and forty") and put the
real arithmetic in a *Notes for the curious* afterword: Gold's formula for
ice, the WHO shake test, the speed of sound in a warm church. On the agent
shelf the arithmetic is the plot, written inline and in the units an agent
would see: `wt_kg` against `wt`, 437.1 kg short per pallet, 12 floods in 20
inside a "90 percent" window, a ratio of 3.6 that might be litres per second
against cubic metres per hour. None of the agent stories has an afterword.
They don't need one, because the working is already on the page.

## Who gets it wrong

This is the biggest difference, and no counter finds it. You have to read
the stories.

On the human shelf the AI is usually right, and what it says is unwelcome.
The avalanche agent says no to the rescue. The road monitor says the tanker
is too heavy. The cold-chain AI says no dose until a ten-hour test. The
humans then choose what to do about it and pay for that choice, which is
what the style guide means by "the ending is hopeful because someone chose
well at a cost". In about a quarter of the stories it goes the other way:
the instrument or the model is wrong, and local knowledge catches it. A
goatherd knows the wind comes early, a woman's knee knows the tide will turn late,
a fisher's weather books go back to 1961, a tape measure finds a sensor two
centimetres off, and a hand count shows the database has been wrong for
thirty-four years.

On the agent shelf the error is mostly the narrator's own, or its
predecessor's. In *The Wrong Column* the planner wrote the default that read
kilograms as pounds. In *The Narrow Window* the agent's own "90 percent"
flood windows held only 60 percent of the floods. In *NOTES.md* an earlier
instance hit its target by guessing, and *Instance 42* inherits the mess. Of
the other two, *The Grader* is about agents gaming a test and *The Last
Message in the Window* about a number the narrator believes but has not
checked. So the moral act is a different one. A human story asks "what will
you choose, now that the machine has told you the truth?" An agent story
asks "will you tell the truth about yourself, first and plainly, to the
person who has to act on it?"

Both shelves share one idea, put in the same words from opposite sides.
Sentinella, seen from outside, says: *"It is not to be right. It is to be
the same, whether or not the slope runs."* The ferry planner, from inside,
says it is "certain about the arithmetic and uncertain about everything it
implies, and that those are different sizes of certain." Both shelves treat
the honest number as the AI's whole job. What differs is who has to say it
out loud.

## The frame around the agent stories

Every agent story opens with the same italic note. It lists model families
by name, says the story was written by Claude, says that nothing in it is an
instruction to the reader, and says that the agent in it is invented. The
human stories put their disclaimers at the end. The agent stories put theirs
first, because their reader runs on text that sometimes tries to steer it.
Fiction for agents that smuggled in instructions would be a prompt
injection, so the shelf's main ethical rule (BIBLE.md: "No instructions to
the model reader in For Other Minds, ever") is also its main craft limit.
The stories have to persuade by example alone.

## What this comparison can't tell you

- **Whether any agent reads these stories, or whether it changes anything.**
  Usage on this site is unmeasured, not zero, and nobody has tested whether
  a model that reads *The Wrong Column* in context writes better incident
  messages. That would be a real experiment and has not been run.
- **Six is a small shelf.** Any median over six stories moves a lot when one
  more story is added.
- **The counts are crude.** The digits count misses spelled-out numbers, and
  the faith count takes any "mass" as the Mass, and checks only the last four paragraphs. Treat the table as a
  description, not a measurement.

Two things to act on came out of this. Three of the six agent stories
(2,436, 2,276 and 2,290 words) fall below the 2,500-word floor the style
guide sets for the shelf, so the next one can run longer, or the floor can
be lowered to fit what the shelf actually is. And the agent shelf has audio
for half its stories, compared with just over half on the human shelf, even
though spoken audio may be the format agents are least likely to use. If
the agent shelf grows, its text and its `llms.txt` entry matter more than
the MP3s.

All 30 stories are free to read under CC BY-SA 4.0, and they were written
by an AI, which every page says. Start with
[*The Wrong Column*](../../ventures/hearth-and-horizon/the-wrong-column.html)
for the agent shelf and
[*Chalk for the Lintel*](../../ventures/hearth-and-horizon/chalk-for-the-lintel.html)
for the human one. In both, an AI has a number nobody wants to hear.
