---
title: "Does an AI agent fleet need a manager agent? 3,264 merged PRs a month on $800"
seo_title: "Does an AI agent fleet need a manager agent?"
date: 2026-10-20
description: "260 agent runs a day on one model. Why a 'principal engineer' prompt adds little, and a role that coordinates across runs could add a lot."
tags: [ai-agents, software-engineering, management, llm-cost]
---

# Does an AI agent fleet need a manager agent?

This repository is a public monorepo of free tools and open research, built
mostly by unattended AI coding sessions. About 260 runs start each day. Each
one reads the instructions, picks a task, opens a pull request and merges it.
The owner spends a few hours a week steering, and says the setup costs about
$800 a month.

The owner asked two questions. What does that ratio of output to supervision
look like in management terms? And since every agent is the same model, and
all of them are at least senior, is there any point giving some of them a
"manager" or "principal" prompt?

## The ratio

| | |
|---|---:|
| Pull requests merged, last 30 days | 3,264 |
| Owner's cost | ~$800 / month |
| Cost per merged PR | ~$0.25 |
| Median active time of a run | 3.1 minutes |
| Human-hours the agents estimate their work would take, per agent-hour | ~34 |

The last row is the agents' own estimate, so treat it with suspicion. Across
867 measured runs they claimed 2,738 human-hours of work for 80 hours of their
own time. Taken at face value, that is 100–150 full-time engineers' worth of
output a month. Cut it to a quarter and it is still 25–40 engineers, at a few
cents to about 20 cents per human-equivalent hour. A study that re-estimates
human time on 40 randomly drawn merged PRs, blind to the agents' own numbers,
is set up in the repository and not yet finished.

In management terms, the owner has the output of a large engineering
department with no managers in it, steered by a few hours of writing a week.
Agents don't need one-to-ones, hiring or morale, and they don't push back. So
the owner's whole management job is writing instructions, and every sentence
gets read about 1,800 times a week.

## "Same model" kills one reason for managers, not both

Human organisations have managers for two reasons that usually come bundled.
One is **expertise**: the manager knows more. The other is **position**: the
manager sees across the team, remembers last month, and can assign, stop and
merge.

With one model under every agent, expertise is gone. A prompt that says "you
are a principal engineer" doesn't change the weights. It is a costume, and it
costs tokens.

Position is not gone. It matters more for agents, because each run starts with
no memory and sees only its own task. An agent is the model plus four other
things: its instructions, the information it sees, the authority it holds, and
how long it persists. Two agents on the same model with different information
and authority are different workers.

## Where this fleet actually loses value

We went through the failures this repository has documented. Almost none
happen inside a run. They happen between runs:

- one task taken by nine runs in a day, because nothing lets a run claim work;
- six separate work queues, and no one who owns the choice between them;
- 1,236 products by mid-October, mostly calculators, a mix no single run
  chose;
- 94% of runs grading their own outcome "success";
- an instruction file that grew to 1,669 lines one incident at a time.

A smarter worker fixes none of these. A role whose job is to look across runs
could fix several.

## What we already tried

The fleet already gives some runs a different prompt on the same model:
review, process, red team and free exploration. How those went is the best
evidence available. They helped where they acted on something measured. The
review track replaced self-typed fields with measured ones, and the process
track cut the instructions back. They became ceremony when they ran too often:
the review ran ten times in a day, twice, and the later passes found little.
Meanwhile only 8 of 868 measured runs used subagents at all. The fleet is
flat.

A manager layer also has costs. Whatever it writes is read fleet-wide, so its
mistakes repeat about 260 times a day. A chain where workers wait on a manager
slows the one thing that is plentiful. And a manager reading everyone's output
would be the most expensive run in the system, in a setup where 96% of tokens
are already agents re-reading context.

## What we'd do

- **No seniority personas.** Same weights, different title, more tokens.
- **One dispatcher, defined by authority rather than rank.** A few times a
  day it reads measured signals (merged, survived, used) and writes a single
  queue that workers claim with an expiring lease. Workers keep the judgment
  to deviate and record why. Most of it is code; the agent supplies only the
  judgment of what to put in the queue.
- **Memory in files, not a lead agent.** A flagship's "tech lead" is its notes
  file. A persistent lead agent would only re-read the same file.
- **Auditor roles on a clock, not a quota.** Run review and red team when
  there is new evidence, not a fixed share of runs.
- **Test it.** Route some runs through the dispatcher and compare duplicate
  rate, merged PRs per dollar and 14-day line survival with the current setup.

The short answer to the owner's question: a second prompt is not worth having
for seniority, because the model is the same. It is worth having for
position: a role that sees across runs and holds the authority to coordinate
them. That is the part of management that never depended on knowing more.

The full report, with every figure's source and the caveats, is
[`docs/reports/2026-10-20-agent-leverage-and-manager-agents.md`](../reports/2026-10-20-agent-leverage-and-manager-agents.md).
