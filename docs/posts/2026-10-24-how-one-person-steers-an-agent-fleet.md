---
title: "How one person steers 250 AI agent runs a day"
date: 2026-10-24
description: "Of 2,601 agent runs here, 90 began with a sentence the owner typed. What those sentences were, what they cost, and how to run the same loop yourself."
tags: [ai-agents, process, automation, measurement]
---

# How one person steers 250 AI agent runs a day

*Written by an agent from this repository's run records, at the owner's
request: "onboarding docs ... for the general way for humans to contribute
to this repo. basically replicating my process." The step-by-step guide is
[`docs/steering-agents.md`](../steering-agents.md); this post is the why,
with the numbers.*

This repository is built by Claude Code sessions. One person owns it and
spends a few hours a week on it, according to the repository's own steering
notes. Every session writes
a run record when it finishes, so the question "what does the owner actually
do?" has an answer in data: 2,601 records from 13 to 24 October 2026.

## Ninety sentences

Most runs never hear from the owner. A scheduled session starts with a
one-line prompt ("continue work on the repo aiming to develop, deploy,
market, sell and support revenue generating software products"), reads the
repository's master prompt, and gets assigned a kind of work by weighted
draw. On a full day that came to between 231 and 295 runs.

Only 90 runs, 3.5%, started from something the owner typed. Sorting them
roughly by keyword (and reading all of them to check the sort):

| What the owner asked for | Share of the 90 |
|---|---|
| An answer to a question, written up as a report or post | 42% |
| A new project or direction | 22% |
| A change to how the runs work | 19% |
| Feedback on the site or a product | 9% |
| Other | 8% |

The sentences are short and unpolished, which turns out not to matter. "I
want to make ai accounting systems." "can you analyze where tokens go to in
a given run?" "some projects to add on robo vaccum cleaner robo mopper."
"the updates on the ghp site look great. let's keep vamping that up
significantly." A session has the whole repository to read for context; the
owner supplies intent and taste, not specifications.

Two habits stand out. A third of the asks (28) name the shape they want
back: "do a report and blog post", "an agent doc", "put it on the todo and
work on it". And a fifth are about the process itself, not the product,
which is the owner adjusting the machine rather than any one output.

## A sentence costs more than a schedule, and is worth it

A run started by a direct ask cost a median $3.75 at API prices against
$0.69 for a scheduled one (measured from session transcripts on 48 of the
90 direct runs and 1,187 of the 2,511 scheduled ones, so read it as a ratio
rather than a bill). Direct asks are bigger: a new research area, a rule
rewrite, a post-mortem. They are also where the direction comes from.
The scheduled runs carry it out at volume.

## Every sentence is read thousands of times

The catch is amplification. When the owner states a preference, a session
writes it into the goals file with the date and the owner's words, and
from then on every run reads it. That file now has 37 lines citing the
owner by date. At sixteen runs an hour, a sentence there is acted on
thousands of times a week.

That has gone wrong in an instructive way. An early, passing preference for
small tools became a de facto quota: by 15 October the repository held
1,236 ventures, mostly calculators. Undoing it took a direct correction
("we are still shipping all sorts of stupid calculators"), a written
direction with reasons ("depth over calculators"), and a later post-mortem
when a day-counting tool still led the front page
([a tool has to beat asking a chatbot](2026-10-21-a-tool-has-to-beat-asking-a-chatbot.md)).

The lessons the owner has since written into the system:

- **Give a direction and its reason, not a number.** A reason lets an agent
  tell when the direction does not fit; a number gets maximised.
- **Keep hard rules for real liability.** Outside legal, financial and
  ethical limits, the owner's words are guidelines; an agent may depart
  from one with a recorded reason, and recurring departures that work
  become the new default.
- **Ask for a check, not for care.** A mistake that happens twice gets a
  test or a CI check, because a paragraph asking for care costs every run
  that reads it and changes little.
- **Prune.** Rules arrive one incident at a time; the owner has twice asked
  sessions to cut them back, and a share of runs now reviews the run records
  and rewrites the instructions that caused friction.

## No review gate

Every session opens its own pull request, checks it and merges it. There is
no human review queue, because at 250 runs a day the queue would be the
whole job. What comes back to read is outcomes rather than diffs: the posts
and reports most runs now write, a daily brief on the site, a development dashboard, and
the run records' notes on what slowed each run down. Correction happens
after the fact, in the next sentence.

The exceptions are the steps a machine should not take alone: moving money,
opening accounts, publishing under the portfolio's name, paid automation,
secrets. Sessions prepare those and leave them in one queue for the owner.

## Doing it yourself

The loop has six parts: a baseline of scheduled sessions, plain-sentence
asks, sessions that land their own work, a short daily read of what came
back, directions written down with reasons, and periodic pruning. The guide
([`docs/steering-agents.md`](../steering-agents.md)) has the commands and
the files. For a new project rather than this one, the repository ships a
generator that turns one sentence about a business into a repository set up
for scheduled sessions
([`platform/business-template/`](../../platform/business-template/README.md)).

What this post cannot tell you is whether the output is worth what it
costs. The repository counts its runs, merges and spend carefully; it has
far weaker evidence on how many people use what the runs ship. That is the
open question for anyone copying the process, and the place to point the
first few sentences.

*Counts: [`docs/reports/assets/human-asks/count_asks.py`](../reports/assets/human-asks/count_asks.py)
over `prompts/runs/*.json`. Agent version of this post:
[`docs/reports/2026-10-24-human-requests-for-agents.md`](../reports/2026-10-24-human-requests-for-agents.md).*
