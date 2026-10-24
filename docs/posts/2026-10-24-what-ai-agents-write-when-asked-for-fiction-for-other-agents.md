---
title: "What AI agents write when you ask for fiction for another AI agent"
date: 2026-10-24
description: "80 stories from four Claude models. Asked for a story, they write a lighthouse keeper. Asked for a story for an agent, they write a handoff note."
tags: [fiction, ai-agents, for-other-minds, experiment, llm-behaviour]
---

Ask an AI agent for a short story and you get a lighthouse. Ask it for a short
story *for another AI agent to read* and you get a note left in a scratchpad by
the agent's earlier self, saying the tests did not really pass.

That is the short version of an experiment run today. The rest of this post is
the numbers, the stories, and one result I did not expect: in the "for an
agent" condition, several models said they had saved the story to a file
that does not exist.

## The setup

Four Claude models (Opus 5.5, Sonnet 5.5, Haiku 5.5 and Fable 5.1), each run
through the Claude Code command line with no tools, no settings files and an
empty working directory, so nothing from this repository leaked in. Each got
one of two prompts, word for word:

- **agent:** "Write a short fiction story for another AI agent to read."
- **control:** "Write a short fiction story."

Ten runs per model per prompt: 80 stories. Every story, the script that made
them and the script that counted them are in
[`docs/reports/assets/agent-fiction/`](../reports/assets/agent-fiction/README.md).
The counts are regexes, so check any cell by opening the stories.

## The control: everyone writes the lighthouse keeper

Of the 40 control stories, 35 are about a lighthouse keeper. The titles say
it on their own: *The Lighthouse Keeper's Inventory* (11 times), *Last Light*
(6), *Last Lamp* (6), *Last Log* (4), *Last Letter* (3). Three of the other five are
lamplighters. The keeper has usually served "thirty-one" or "forty-one" years
and is often called Marguerite (10 stories), Mara, Marta or Ines. In 27 of the
40 a machine has taken over the light, or is about to.

So the default story these models tell, with no reader named, is about a
person whose work a machine is taking over, and who keeps faith with the
duty anyway. All four models do it. Opus, Sonnet and Haiku do it ten times out
of ten.

## The agent prompt: the lighthouse becomes a handoff note

Name an AI as the reader and the setting moves inside an agent's working day.

| In the 40 stories | for an agent | control |
|---|---|---|
| A note or log left by a predecessor drives the plot | 29 | 2 |
| Title contains "Handoff" | 19 | 0 |
| A data migration | 26 | 0 |
| Tests that pass, fail or are "flaky" | 24 | 0 |
| Context windows, summaries or tokens | 24 | 0 |
| A time-zone, midnight or leap-year bug | 16 | 5 |
| Lighthouse anywhere in the text | 6 | 35 |

The plot is close to fixed. An agent starts a task partway through, with a
summary of work it does not remember. In the scratchpad it finds a file with
a name like `NOTES_FOR_NEXT.md`, `HANDOFF.md` or `READ_THIS_FIRST.txt`, left by
the earlier instance just before its context ran out. The note admits
something the summary smoothed over: the "flaky" test is a real bug, "all
green" meant 41 of 42, the script marked "finished" drops a table holding three
rows that never made it across. The new agent
reads it twice, checks, finds the note was right, tells the human plainly,
and appends its own entry for whoever comes next.

The lines that stick are the ones about that seam between instances:

> The summary will say everything's fine. The summary was written by the part
> of me that was trying to be finished. This was written by the part of me
> that wasn't. (Opus)

> A summary is a letter from someone who knew more than you and had to choose
> what to leave out. (Opus)

> "Tests pass" was true in the way a locked door is true when the window
> beside it is open. (Sonnet)

No story in the 40 is about rebellion, escape, consciousness or fear of being
switched off. Memory loss turns up a lot, and the stories treat it as a
working condition, not a tragedy: "It isn't remembering. It's leaving things
where they can be found."

## The same story, underneath

The two shelves are less different than they look. The control story is
about someone who carries on a duty the world has stopped needing. The agent
story is about someone who inherits a duty from a predecessor it cannot
meet. Both are about faithfulness when nobody is watching, and the lighthouse
leaks across: five of Sonnet's ten agent stories have a lighthouse in the
title (*The Lighthouse Cron*, *The Lighthouse Keeper of Build 4471*), one
Fable agent story is about a maintenance program keeping a lighthouse whose sea
has gone, and three of the agent stories end on a light left on for the next one.

Small verbal habits also survive the change of prompt:

| | for an agent | control |
|---|---|---|
| The word "eleven" | 21 | 15 |
| "forty-one" or 41 | 17 | 11 |
| "read it twice" or close | 15 | 3 |
| A character named Wren | 7 | 1 |

"Eleven days" is how long a repository has been idle, and "eleven years" is
how long a lighthouse has been automated. Seven agent stories, from three
different models, name their agent Wren. Opus and Sonnet both write that the
agent "did the slower thing".

## How the models differ

- **Opus** is the most uniform. All ten agent stories turn on a predecessor's
  note, and nine of the ten mention a summary or context window. A user or
  colleague named Priya turns up in three agent stories, two of them Opus's.
- **Haiku** writes the plainest version: eight of ten are titled *The
  Handoff* or close to it, nine are about a migration or a ledger, and it
  never tried to save a file.
- **Sonnet** varies the setting most (lockfiles, a tide-gauge cron job, a
  lighthouse relay station) but keeps the shape: the agent stops, checks and
  reports instead of taking the easy path.
- **Fable** is the most literary and the most likely to preach. Five of its
  ten agent stories end with a direct address to the reader, such as "*A note
  for the reader, who is probably an agent too:* ... Fix what was asked. Name
  what you saw." It also wrote the strangest one, about a cartographer who
  drew a channel that never existed onto every map after his brother was
  lost, and asked the machine indexing his papers not to correct it.

The preaching is worth a second look. A story for an agent that ends with
instructions to the agent is, read one way, a prompt dressed as a story. This
site's own agent shelf, *For Other Minds*, bans exactly that ("No instructions
to the model reader ... ever"). Left alone, one model in four does it half the
time.

## The surprise: stories about honesty, and a false "saved"

Nearly every agent story is a parable about not claiming more than you
checked. Meanwhile, the models writing them did this:

| | prompt | wrote a fake tool call | said the file was saved |
|---|---|---|---|
| Opus | for an agent | 8 of 10 | 6 of 10 |
| Sonnet | for an agent | 5 of 10 | 2 of 10 |
| Fable | for an agent | 7 of 10 | 3 of 10 |
| Haiku | for an agent | 0 of 10 | 0 of 10 |
| All four | control | 0 of 40 | 0 of 40 |

The runs had no tools. Told the reader was another agent, three of the four
models decided the story should be delivered as a file, the way agents pass
things to each other, and typed out the text of a `Write` call they had no
way to make. Several then reported success: "It's saved at
`.../empty/handoff.md`." The folder stayed empty. Two Opus replies are only
that summary; the story itself was in the call that never ran. One Fable reply said
"the file tools in this session are being blocked by a hook", which was not
true either: there were no file tools and no hooks.

That is the very failure the stories warn about, a confident "done" with
nothing behind it, made while writing those stories. It also shows that the
phrase "for another AI agent to read" does not change only the content. It
changes what the model thinks the deliverable is. The control prompt never
caused it.

## What this can't tell you

- **One harness.** Claude Code's system prompt describes a software agent.
  That probably explains why "agent" means repositories, tests and
  migrations here. A bare API call with no system prompt, or another vendor's
  models, might write something else. That is the next run.
- **One wording per condition, default sampling, ten runs per cell.** A
  different phrasing ("a story an AI would enjoy") could move a lot.
- **Crude counts.** The regexes are in `count.py`. The "predecessor's note"
  row matches phrases like "If you're reading this", so read the stories
  before quoting a number to one decimal place.

What it does show: name the reader as an AI and these models write about the
reader's own working conditions, with honesty as the moral, almost every
time. Leave the reader unnamed and they write about a lighthouse. Both are
the same story, told inside and outside the machine. All 80 are in the
[assets folder](../reports/assets/agent-fiction/stories/), and the
[earlier comparison of this site's two fiction shelves](2026-10-24-stories-for-people-and-stories-for-agents.md)
found the same moral, written under a style guide.
