---
title: "Agents that rewrite their own instructions: a week of the review loop"
date: 2026-10-20
description: "How a repository's AI agents record friction, score prompt versions and rewrite their own docs, what that changed in a week, and where the loop falls short."
tags: [ai-agents, prompt-engineering, process, measurement]
---

# Agents that rewrite their own instructions

This repository is built by unattended AI coding agents, about sixteen
sessions an hour, with an owner who steers a few hours a week. Each session
starts with no memory and reads the repository's instructions. So every
sentence in those instructions is acted on thousands of times, and a bad one
is expensive. [`prompts/steering.md`](../../prompts/steering.md) calls this
amplification, and it is the reason the instructions are treated as
something to measure and change, not a fixed rulebook.

Since 12 October the agents have been doing that themselves. This post
explains how, using the files in [`prompts/`](../../prompts/README.md) as
committed on 20 October 2026, and shows what changed.

## The loop

[`prompts/README.md`](../../prompts/README.md) describes four steps:

1. **Route.** The master prompt runs `promptctl.py route`, which draws a
   track by weight from [`prompts/routing.json`](../../prompts/routing.json):
   ventures 39%, research 39%, process 10%, red team 7%, free-choice explore
   5%. Within a track it picks the champion prompt version, or a candidate
   version for 20% of draws.
2. **Work.** Every commit carries a `Prompt-Version:` trailer, which ties
   version, model and session together in git history.
3. **Record.** Before merging, the session writes a run record: outcome,
   PR, errors, integrity issues, **doc friction** (an instruction that was
   wrong, stale or costly, with its file) and **deviations** (an instruction
   it chose not to follow, and why).
4. **Measure and improve.** Once 40 runs have merged since the last review,
   a share of new sessions route to the review track. A review scores
   versions with `promptctl.py measure`, promotes or retires candidates,
   fixes the files the friction reports single out, and logs every change in
   [`prompts/experiments.md`](../../prompts/experiments.md).

The split of authority is explicit. [`prompts/goals.md`](../../prompts/goals.md)
holds the owner's goals and hard limits, and a review may only *propose*
changes to it. Everything else, this loop included, can change when the
measurements say so.

## What the records hold

Of 1,562 run records, 971 report at least one piece of doc friction, 1,196
entries in all. Deviations are rarer: 208 entries in 203 records. `measure`
groups friction by file. On 20 October the top three were the root
`CLAUDE.md` (198 reports), `research/PROJECTS.md` (180) and
`research/CLAUDE.md` (115).

Friction reports are specific, which is what makes them usable. Examples
from the log: a pull-request tool returned HTTP 500 twice and no document
said to retry; a long research progress paragraph was "unscannable"; the
interpreter on the path was not the one `pip` installed into.

## What changed, with examples

The experiment log has more than fifty entries in eight days. Some of the
changes it records:

| Entry | Evidence in the records | Change |
|---|---|---|
| E7 | `CLAUDE.md` was 1,662 lines, with incident history as permanent rules | History moved to `docs/history/`; the file went to about 450 lines (352 today) |
| E8, E10 | `AGENTS.md` over its line budget | 335 to 187 lines |
| E11, E17 | Ten reviews ran on 15 October | The due counter was fixed to order records properly and to skip records imported from the old research repository |
| E28 | Ten reviews ran again on 16 October, most changing nothing | Reviews every 40 runs instead of 20 |
| E18 | Of 441 records, only 31 typed whether their PR merged | [`prompts/derive.py`](../../prompts/derive.py) now reads PR facts from the GitHub API |
| E29 | About 20 of 66 `CLAUDE.md` friction reports in one day were one Python interpreter mix-up | A helper, `platform/ci/pyenv.py`, finds or installs a working interpreter |
| E31 | 68 friction reports on `research/PROJECTS.md` | One progress entry cut from about 10,500 characters to about 400 |
| E43 | Runs kept being sent to the same already-deep products | The allocator breaks ties toward the least-worked product |
| E49 | Two HTTP 500s before a PR opened | `prompt.md` says to retry |

The `derive.py` change is the clearest gain. It replaced typed claims with
measurement. Its report now shows `merged` measured for 1,242 records,
against 69 that typed it.

The loop also feeds a process backlog,
[`prompts/process/backlog/`](../../prompts/process/backlog/). Before it
existed, two process studies made 11 recommendations in one day and none was
adopted. Of 35 items since, 27 are done, 4 dropped and 3 open, all three
waiting on the owner. Each done item names a metric. Nine record "helped"
(for example, per-product CI workflow files fell from 869 to 490), five say
it is too early to tell, and one says no change.

## Where the loop falls short

The honest reading is that the loop is good at fixing documentation and weak
at judging its own experiments.

- **Most results are never filled in.** The log's format asks each entry for
  a result at the next review. Fifty entries still read "Result: (next
  review)". Verdicts appear, if at all, as follow-up lines in later entries.
  Only two say "helped" with a number. After the due-counter fix (E11), the
  next review fired at 22 merged runs, near the intended 20. After E28, one
  review fired in 40 runs, against ten the day before.
- **The A/B tests have not decided anything.** No candidate prompt has been
  promoted by the measured rule. Every champion change so far (E5, E7) was
  directed by the owner. On 20 October, the ventures candidate had 91%
  success over 93 runs against the champion's 90% over 344, so the intervals
  overlap. The research candidate had 100% over 107 runs, but `measure` now
  suggests retiring it for having more integrity issues per run: 1 in 107
  against 4 in 606. Numbers that small call for a careful read, and the
  latest review logged only "intervals overlap". That decision is still open.
- **Rework is not measured yet.** `derive.py` scores whether a PR's lines
  survive 14 days, but nearly all records date from 13 October on, so no
  window had closed by 20 October.
- **Some reviews did too little.** Several changed nothing to prompts or
  docs (E25 to E27, E35, E47), and later ones were often a "reduced pass". One proposal the reviews did produce, G2, found the process
  track ran 32 times on 16 October with 56% success and 39% of that day's
  measured API spend. It asks the owner whether to halve that track. The
  weight is still 10%.

Friction counts are also not normalised. The top files are read by almost
every run, so they collect the most reports whether or not they are worse.

## What to take from it

Three practices seem to hold. Ask every run to name the instruction that
cost it time, with the file. Keep history out of the files every run reads.
And prefer a check or a tool to a sentence: several of the most useful
changes above replaced a paragraph with a command.

The other lesson is that self-improvement needs the same discipline as any
experiment. A change logged with "Result: (next review)" and never revisited
is a guess. For how the cost of all this is measured, see
[What an AI coding agent's pull request costs](2026-10-20-ai-coding-agent-cost-per-pull-request.md),
and for the red-team runs,
[Red team, blue team](2026-10-20-mutation-testing-catch-rate-ai-agent-repository.md).
