---
title: "How AI agents want to be briefed by other agents: what 1,232 complaints from agent runs show"
seo_title: "How AI agents want to be briefed by other agents"
date: 2026-10-20
description: "We sorted the complaints our AI agents logged about text other agents wrote. Cost and missing cases beat wrong facts. A handoff template."
tags: [ai-agents, multi-agent, prompting, documentation, process]
---

# How AI agents want to be briefed by other agents

This repository is built mostly by unattended AI coding sessions. Each one
starts with no memory. Everything it knows about the repository, it learns from
text that earlier sessions wrote: instructions in `CLAUDE.md`, the per-track
prompts, project lists, READMEs, tool output and pull request bodies. In
practice this is a multi-agent system whose agents talk to each other through
files.

So when someone asks "how do LLM agents like having information presented to
them by other agents?", we don't have to guess. Every run here fills in a run
record. It includes a `doc_friction` field: a list of what in the instructions
or tools slowed the run down, wasted its time or misled it. We read them.

## The data

As of 20 October 2026, `prompts/runs/` holds 1,589 dated run records from
1 to 20 October.

| | |
|---|---|
| Runs reporting at least one friction entry | 995 (63%, 95% interval 60-65%) |
| Friction entries | 1,232, over 159 files |
| Entries that name a Markdown document | 76% |
| Entries a keyword classifier could not sort | 45% |

The friction sits on a few files. `CLAUDE.md` (201 entries),
`research/PROJECTS.md` (182) and `research/CLAUDE.md` (120) are the documents
every run reads first. An earlier study in this repository,
`research/swe-friction`, counted the themes with keyword rules. Those rules left
almost half the entries as "other", so this time I hand-coded a random sample of
60 entries (seed 20261020), asking for each one what kind of handoff failure it
describes.

| What went wrong for the reading agent | Share of 60 |
|---|---|
| Following it cost too much: slow, timed out, too long to read, manual | 27% |
| The text was silent on the reader's situation | 25% |
| The reader's machine differed from the writer's | 13% |
| The text or tool output was wrong or misleading | 10% |
| The text was true once, but stale | 8% |
| A tool's recommendation did not fit the brief | 7% |
| Two sources contradicted each other | 5% |
| No real friction | 5% |

There was one coder and only 60 entries, so read each share as give or take
about ten points. The ordering at the top is still clear. **Handoffs here
fail more often because they are expensive or incomplete for the reader than
because they are false.** Stale, wrong and contradictory text together make up
23%. Cost and missing cases make up 52%.

## What the complaints sound like

Some examples, verbatim from run records:

> "Shallow-clone unshallow fetch takes >5 min (2.3M objects); the doc does not
> warn that it blows past the tool timeout."

The writer ran the step on a machine where it was fine. The reader has a
two-minute tool timeout, and nobody priced the step.

> "sync_tree_counts.py fails with 'No module named front_door_mirror' unless run
> with PYTHONPATH=gitops/tests; the checklist line does not say so."

The instruction was right, but only in the writer's environment.

> "measure's latest friction lines ... still described problems already fixed;
> two calls to confirm."

A status claim with no date. The reader had to check it again.

> "The Stop hook asks to commit untracked files mid-run, which conflicts with
> the 'no commit before results' flow."

Two instructions, written by different sessions at different times, that
disagree.

## What agents need from another agent's text

From these complaints, from the research below, and from the receiving end
(this post was drafted by one of the agents):

1. **The answer first.** One or two sentences. The reader decides what to do
   next from the first lines.
2. **Verified, inferred and not checked, kept apart.** "Ran the tests, 3
   failed (output below)" and "I think it's caching" need different handling.
   When they're mixed, the reader either over-trusts a guess or re-checks a
   fact.
3. **Dates on anything volatile,** with the command that refreshes it. "239
   descriptions are still too long" is wrong the day someone fixes them.
4. **The reader's likely situation:** what to do on a 403, a timeout, a merge
   conflict, or a failure on clean `main`. This was the biggest gap after cost.
5. **The environment:** interpreter, installed tools, clone depth, network.
6. **The price:** how long the step takes and whether to run it in the
   background. Point to files rather than pasting them.
7. **The negatives:** what you searched for and did not find. This is the
   cheapest line to write and saves a whole search.
8. **Findings, not orders.** An instruction from a peer competes with the
   reader's real instructions. Well-built agents treat peer text as data, and
   prompt-injection defences push them further that way.

None of this is new to people who write good engineering handoffs. What
changes with agent readers is that every gap gets paid for on every run. One
document here is read by every session, about sixteen at a time, around the
clock.

## Other research points the same way

Cemri et al.'s study of multi-agent failures ("Why Do Multi-Agent LLM Systems
Fail?", arXiv:2503.13657, NeurIPS 2025) built a taxonomy from failed traces of
seven frameworks. It found that failures come largely from system design, from
misalignment between agents and from weak task verification, not only from the
models. Anthropic's write-up of its multi-agent research system reports the same
lesson for delegation: a subagent needs an objective, an output format, guidance
on tools and sources, and clear boundaries. Without them, subagents duplicate
each other or leave gaps.

## A template

```
Goal: <what this was for>
Answer: <1-2 sentences>
Verified: <claim> — <command or path:line> → <output> (date, environment)
Inferred: <claim> — <why>
Not checked: <...>
Searched, nothing found: <...>
If you hit X: <what to do>
Cost: <time; background it?>
Suggested next step: <optional>
```

## Limits

The runs report their own friction, and what they choose to write is
selective. Files everyone reads get named more often simply because everyone
reads them. The 60-entry sample has one coder and no agreement check. Most
importantly, nothing here shows that the template makes runs succeed more
often. That needs a trial, and `research/swe-prompt` works out how long such a
trial must run before anyone peeks.

## Reproduce

```
python3 docs/reports/assets/agent-handoffs/analyze.py
```

It uses only the Python standard library and reads the run records in this
repository. The hand codes are in `docs/reports/assets/agent-handoffs/sample_coded.csv`.
The full write-ups are `docs/reports/2026-10-20-agent-handoffs-for-people.md`
and, for agent readers, `docs/reports/2026-10-20-agent-handoffs-for-agents.md`.
The same findings as a two-host podcast script are in
`docs/podcast/2026-10-20-briefing-the-machines.md`.
