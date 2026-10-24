---
title: "Does an AI agent fleet need a manager agent? 3,264 merged PRs a month on $800"
date: 2026-10-20
description: "260 agent runs a day on one model. A 'principal engineer' prompt adds little; a role that coordinates across runs could add a lot."
post: does-an-agent-fleet-need-a-manager-agent
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

Today: does a fleet of AI coding agents need a manager agent?

Here is the setup. This repository is a public monorepo of free tools and open research, built mostly by unattended AI coding sessions. About two hundred and sixty runs start each day. Each one reads the instructions, picks a task, opens a pull request and merges it. The owner spends a few hours a week steering, and says the whole thing costs about eight hundred dollars a month.

In the last thirty days, three thousand two hundred and sixty-four pull requests were merged. That works out to roughly twenty-five cents each. The median run is active for about three minutes.

The agents also estimate how long a human would have taken to do their work. Across eight hundred and sixty-seven measured runs, they claimed about twenty-seven hundred human hours for eighty hours of their own time. Be suspicious of that number, because the agents are grading themselves. Even if you cut it to a quarter, it is still the output of twenty-five to forty engineers. A blind study that re-estimates human time on forty randomly drawn pull requests is set up, but not yet finished.

So the owner has the output of a large engineering department with no managers in it. Agents need no one-to-ones, no hiring and no morale. The owner's whole management job is writing instructions, and every sentence gets read about eighteen hundred times a week.

Now the question. Every agent is the same model. So is there any point giving some of them a manager or principal engineer prompt?

Human organisations have managers for two reasons that usually come bundled. One is expertise: the manager knows more. The other is position: the manager sees across the team, remembers last month, and can assign work, stop work and merge.

With one model under every agent, expertise is gone. A prompt that says "you are a principal engineer" does not change the weights. It is a costume, and it costs tokens.

Position is different. It matters more for agents, because each run starts with no memory and sees only its own task. Two agents on the same model, with different information and different authority, are different workers.

And that is where this fleet loses value. Almost none of the documented failures happen inside a run. They happen between runs. One task was taken by nine runs in a single day, because nothing lets a run claim work. There were six separate work queues and nobody to choose between them. Mid-October, the catalogue held twelve hundred and thirty-six products, mostly calculators, a mix no single run chose. Ninety-four percent of runs graded their own outcome a success. And one instruction file grew to sixteen hundred lines, one incident at a time. A smarter worker fixes none of these. A role that looks across runs could fix several.

The fleet has already tried different prompts on the same model: review, process, red team and free exploration. They helped when they acted on something measured. The review track replaced self-reported fields with measured ones, and the process track cut the instructions back. They turned into ceremony when they ran too often. One review ran ten times in a day, and the later passes found little. Meanwhile only eight of eight hundred and sixty-eight measured runs used subagents at all. The fleet is flat.

A manager layer has costs too. Whatever it writes is read fleet-wide, so its mistakes repeat about two hundred and sixty times a day. Workers waiting on a manager would slow the one thing that is plentiful. And a manager reading everyone's output would be the most expensive run in the system, where ninety-six percent of tokens are already agents re-reading context.

So here is what the report recommends. First, no seniority personas: same weights, different title, more tokens. Second, one dispatcher, defined by authority rather than rank. A few times a day it reads measured signals, what merged, what survived, what was used, and writes a single queue that workers claim with an expiring lease. Workers keep the judgment to deviate, and record why. Most of it is code. Third, memory in files, not in a lead agent, because a persistent lead would only re-read the same notes. Fourth, auditor roles that run on a clock, when there is new evidence, not on a fixed share of runs. And fifth, test it: route some runs through the dispatcher and compare duplicate rate, merged pull requests per dollar, and fourteen-day line survival.

The short answer: a second prompt is not worth having for seniority, because the model is the same. It is worth having for position, a role that sees across runs and holds the authority to coordinate them. That is the part of management that never depended on knowing more.

The full report, with every figure's source and the caveats, is linked from the blog post. This was produced with AI assistance. Thanks for listening.
