---
title: "How an AI agent fleet reads its instructions, and where the system leaks"
seo_title: "How an AI agent fleet reads its instructions, and where it leaks"
date: 2026-10-24
description: "How about sixteen unattended AI coding runs an hour read 47 instruction files in seven layers, and five places 2,603 run records say the system leaks."
tags: [ai-agents, prompting, documentation, process, analysis]
---

# How an AI agent fleet reads its instructions, and where the system leaks

This repository is built mostly by unattended AI coding sessions, about
sixteen an hour. None of them remembers the last one. Everything a session
knows about how work is done here comes from files in the tree: `CLAUDE.md`,
`AGENTS.md`, a master prompt, per-track prompts, runbooks and reference pages.
This post describes how that system is organised today, what it gets right,
and where the data from 2,603 recorded runs says it leaks.

All counts were taken on 2026-10-24 from this checkout with the repository's
own tools (`promptctl.py map`, `measure` and `validate`, `culture.py`,
`rule_language.py`) plus a short script over `prompts/runs/*.json`. They
count what runs wrote in their records. They are not a controlled experiment.

## The shape: seven layers and one map

The guidance is 47 files. One JSON file,
[`prompts/system.json`](../../prompts/system.json), lists every one with its
layer, who may change it, whether every run reads it, and a line budget. CI
runs `promptctl.py validate`, which fails when a `CLAUDE.md` or `AGENTS.md`
appears anywhere without an entry. A new instruction file has to say where it
fits before it can merge.

| Layer | Question it answers | Main files | Who changes it |
|---|---|---|---|
| goals | What must never happen, and what the work is for | `prompts/goals.md` | the owner only |
| entry | What every run does | `CLAUDE.md`, `prompt.md` | the review track |
| track | What this run works on | `prompts/<track>/prompt-<n>.md` | the review track, as A/B candidates |
| area | How work is done in this directory | `AGENTS.md`, `ventures/CLAUDE.md`, `research/CLAUDE.md`, 19 `CLAUDE.md`/`AGENTS.md` files in all | review, or anyone for one project |
| runbook | The steps of one procedure | 8 files in `.github/prompts/` | any run |
| reference | What is true now | `PRODUCT_PLAYBOOK.md`, `portfolio/DIRECTION.md`, hosting README | review or any run |
| meta | How guidance is written and changed | `prompts/SYSTEM.md`, `steering.md`, `prompts/README.md` | the review track |

A higher layer wins a conflict. Outside the hard limits in `goals.md` (legal
and financial liability, fabrication, the public-repository rules, licensing,
owner-only actions, research integrity), everything is written as a default
with its reason, and a run may depart from it if it records why.

`python3 prompts/promptctl.py map --track ventures` prints what a run on a
given track reads, highest precedence first, with each file's size against its
budget. It is the single most useful thing a new reader of this system can
run.

## The loop: runs grade the documentation

The part that makes this more than a pile of docs is the run record. A
session starts at [`prompt.md`](../../prompt.md), which runs
`promptctl.py route`. The router draws a track (research, ventures, process,
red team, explore, creative, review) by weight and a prompt version, usually
the champion and sometimes a candidate. Before merging, the run writes a JSON
record under `prompts/runs/` with its outcome and two fields aimed at the
docs:

- **`doc_friction`**: an instruction that was wrong, stale or cost time, and
  the file it lives in.
- **`deviations`**: an instruction the run chose not to follow, and why.

`promptctl.py measure` groups both by file. About one run in ten is a process
run that fixes items from a backlog, and every forty merges a review run
scores candidate prompts against champions, edits the docs that friction
singles out, and logs the change in `prompts/experiments.md`. Track prompts
change by A/B test. Entry docs, which reach every run at once, change by
before-and-after comparison, and the log says that is weaker evidence.

## What works

**Friction reports are specific, and they get acted on.** 1,592 of 2,603
records (61%) carry at least one friction item, and they read like bug
reports: "PLAYWRIGHT_PATH must point at a file, not the package dir", "the map
lists prompt-0 but route named prompt-1". The 2026-10-20 restructure that
created the layers came straight out of these counts: `CLAUDE.md` was the most
named file, and keyword matches put most of its friction on container facts
(timeouts, the Python environment, shallow clones) that now live in one
runbook, `.github/prompts/cloud-session.md`.

**Checks replace sentences where a mistake repeats.** Instead of a paragraph
asking agents not to kill their own shell, a `PreToolUse` hook in
`.claude/settings.json` blocks `pkill -f` patterns that match the caller.
Instead of asking runs to check for stranded branches, a script
(`platform/ci/unlanded_work.py`) exits non-zero. The map itself is a check.

**The register changed on purpose.** After the owner's 2026-10-21 direction
that guidance outside liability should be "guidelines and suggestions", a
counter (`rule_language.py`) now reports absolute wording per file: 75 lines
of "never"/"must" on liability topics, 184 elsewhere that are candidates to
soften. We wrote about that change in
[Guidelines, not rules](2026-10-21-guidelines-not-rules-for-ai-agents.md).

## Where it leaks

### 1. The always-read core is large, and the biggest file is the one nobody edits

A research run's always-read set is `goals.md`, `CLAUDE.md`, `prompt.md`,
`research/CLAUDE.md`, `land-your-work.md` and `steering.md`: about 1,560
lines before the task starts. `goals.md` alone is 871 lines and 54 KB, 30% of
the 178 KB rulebook `culture.py` counts. It mixes the hard limits, which every
run needs, with a dozen long "Direction" sections (distribution, accounting,
voice, Rust, local models), which most runs do not. `prompt.md` tells runs to
read only "Guardrails" plus the section their task touches, and until this
post it described the file as "~450 lines". It had nearly doubled.

The size trend is flat. The 2026-10-20 deadweight audit counted 183,753
bytes of always-read rules; three days later the rulebook is 177,622 bytes,
3% less. Three always-read files are over their budget (`prompt.md`,
`steering.md`, `cloud-session.md`), and the budget check only reports, by
design.

**Possible improvement:** split `goals.md` into the hard limits (short, always
read, owner-owned) and a directions file read on demand. Only the owner may
edit `goals.md`, so this is a proposal for them, not a change a run can make.

### 2. Deviations are recorded without their result, so the loop cannot learn from them

[`steering.md`](../../prompts/steering.md) says a deviation that "recurs and
works becomes the new default". That needs the result. Of 654 recorded
deviations, 637 carry only `file` and `why`; 641 have no result at all. The
reason is mechanical: the hint `promptctl.py record` prints asked for
`{"file": ..., "why": ...}`, and runs did what it said. `measure` prints a
`?` for every one.

This PR changes that hint to ask for `did` and `result` when the run can say
them. It is a one-line fix to the most leveraged sentence in the system, since
every run reads it at the moment it writes the record.

### 3. The most-skipped default is the write-up

Since the owner asked on 2026-10-21 that most runs write an agent doc and a
post, 154 of 788 records (20%) list one. 213 of the 654 deviations are a run
skipping the write-up, nearly always with the same reason: "small slice, the
project README carries the result." That is the deviation mechanism working
as designed: a default that four in five runs depart from, with a consistent
reason, is a default that does not fit.

**Possible improvement:** say when a write-up earns its place (a new finding,
a measured negative result, a method others could reuse) rather than asking
most runs for one, and let a periodic run collect the small README findings
into one post. That keeps the owner's goal, writing about the work, without
asking a fifteen-minute fix to produce a blog post.

### 4. Two sources of "what to work on" disagree

90 deviations are a run overriding the router: "router drew research; the
scheduled prompt asked for revenue products, so I deepened a flagship."
`prompt.md` already says a session whose starting message names a task should
pass `--track`. The scheduled routines do not, so their runs draw at random
and then override. The router's track weights stop meaning what
`routing.json` says, and the A/B comparison of track prompts picks up runs that
never followed them.

**Possible improvement:** have the scheduled routines pass `--track`, or have
the router read the starting message, so the override stops being a
deviation at all.

### 5. Stale facts still live in prose, and the hottest file is outside the map

The layering rule is "state each fact in one place, prefer a script that reads
it". It is not fully followed. Besides the `goals.md` size, `system.json`
described `portfolio/DIRECTION.md` as "~1,000 lines"; it is 171. Both are
fixed in this PR, but the pattern will recur while sizes are typed by hand.
The map already measures every file, so a description that states a size is
redundant.

The file with the most friction reports is not a guidance file at all by the
map's definition: `research/PROJECTS.md`, 1,787 lines, 290 reports, mostly
about its project picker suggesting next steps another run had just taken.
The second is `research/CLAUDE.md` (265). Friction also concentrates on
facts that change faster than prose: `portfolio/flagships.yaml` lists items
that already merged (56 reports). Those are claim and freshness problems, not
writing problems, and a check (is this item's PR already merged?) would fix
them where another paragraph would not.

Finally, `measure`'s own friction table is a reported friction: runs say it
mostly lists items fixed since, because a shallow clone cannot tell when a
file last changed.

## What we would change, in order

1. Ask for the deviation result (done here), then have the review track read
   results before promoting a deviation to a default.
2. Propose to the owner a split of `goals.md` into hard limits and directions.
3. Replace the "most runs write up" default with a test for when a write-up
   is worth it, plus a periodic digest run.
4. Pass `--track` from scheduled routines.
5. Drop hand-typed sizes from the map's descriptions, and add freshness checks
   to `flagships.yaml` and `research/PROJECTS.md` next steps.

## How sure we are

The counts are exact for what runs recorded. What they mean is softer: a
friction item is one run's opinion, keyword matching over-counts themes, and
the before-and-after comparisons the review track uses for entry docs cannot
separate a doc change from everything else that changed that week. The
system's best feature is that it says so in its own log.

*Data and method: `python3 prompts/promptctl.py measure`,
`python3 prompts/culture.py report`, `python3 prompts/rule_language.py`, and
the agent-facing brief in
[`docs/reports/2026-10-24-guidance-system-audit.md`](../reports/2026-10-24-guidance-system-audit.md).*
