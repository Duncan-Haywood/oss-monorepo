---
title: "Inside an AI agent fleet's docs: what they hold, and where the friction went"
seo_title: "Inside an AI agent fleet's docs"
date: 2026-10-24
description: "A tour of the files that brief our unattended coding agents, from goals to run records, and what 2,786 run records say happened after the October restructure."
tags: [ai-agents, documentation, prompting, process, analysis]
---

# Inside an AI agent fleet's docs: what they hold, and where the friction went

Unattended AI coding sessions build this repository, about sixteen an hour.
None of them remembers the last one, so the files in the tree are the whole
of what a session knows about how work gets done here. An earlier post today,
[How an AI agent fleet reads its instructions](2026-10-24-how-an-ai-agent-fleet-reads-its-instructions.md),
covered the seven layers of guidance and five places they leak. This post is
its companion. It explains what is actually in those files, how the writing
that comes out of the runs is organised, and what the run records say four
days after the restructure meant to fix the worst friction.

The counts were taken on 2026-10-24 at `main` 2223ddb0 using the
repository's own tools (`promptctl.py map`, `culture.py report`) and a short
script over the 2,786 JSON run records in `prompts/runs/`. They count what
runs wrote down. They are not a controlled experiment.

## Two directions of text

Text in this repository moves in two directions. Briefing goes down to the
runs. Records come back up from them. Most of what makes the system work is
in the second direction.

### Down: the briefing

[`prompts/system.json`](../../prompts/system.json) lists 30 guidance
entries. Some are globs, such as one `CLAUDE.md` per venture. Each entry has
a layer, an owner and, for the files every run reads, a line budget.
`python3 prompts/promptctl.py map --track ventures` prints them in order of
precedence:

| Layer | What it holds, in practice | Size today |
|---|---|---|
| goals | `prompts/goals.md`: the hard limits (no fabrication, public-repo safety, licensing, the owner's money and accounts, research integrity) and then a long run of the owner's directions, quoted with dates | 975 lines, 60 KB |
| entry | `CLAUDE.md` (standing rules: ship something, land your own PR, public-repo safety) and `prompt.md` (the run lifecycle: route, work, record, improve) | 179 + 100 lines |
| track | one prompt per track (ventures, research, process, explore, red team, creative, review), with champion and candidate versions picked by [`routing.json`](../../prompts/routing.json) | ~100 lines each |
| area | `AGENTS.md`, `ventures/CLAUDE.md`, `research/CLAUDE.md`, and 7 `CLAUDE.md` / 12 `AGENTS.md` files in all | 39 to 167 lines |
| runbook | 11 procedures in `.github/prompts/`: landing a PR, the cloud container, parallel git, verify and merge, compliance review, handling a person's request | 33 to 172 lines |
| reference | what is true now: `PRODUCT_PLAYBOOK.md`, `portfolio/DIRECTION.md`, the hosting README | 122 to 573 lines |
| meta | how guidance is written and changed: `SYSTEM.md`, `steering.md`, `prompts/README.md` | 113 to 161 lines |

What the content says matters more than the table. Three habits run through
nearly every file:

- **Every rule carries its reason and its source.** Rules read "(owner,
  2026-10-20: '...')" or point to the incident behind them. A run can tell a
  standing decision from a stale one, and can see what a rule protects before
  it decides the rule doesn't fit its situation.
- **Only liability gets absolute words.** Since 2026-10-21, anything that is
  not a financial, legal or ethical risk is written as a default. A run that
  departs from a default records the departure and why. We argued for this
  in [Guidelines, not rules](2026-10-21-guidelines-not-rules-for-ai-agents.md).
- **Procedure sits low, purpose sits high.** `CLAUDE.md` says "open the PR
  right away and merge it yourself" in one line and links to the runbook
  that has the commands and their traps. A run reads the runbook when it
  reaches that step, not at startup.

The owner's own words make up a small share. `culture.py` counts 196,034
bytes in the 18 files of rules a run may read, and only 22,119 bytes (11%)
of that is quoted owner text. The other 89% is agents' prose explaining what
the owner meant. That ratio is the reason every line has to cite its source:
the agents write most of their own rulebook.

### Up: what runs write back

| Where | For whom | What goes in it | Count |
|---|---|---|---|
| `prompts/runs/*.json` | the system | one record per run: outcome, PR, errors, `doc_friction` (an instruction that was wrong or cost time), `deviations` (a default the run chose not to follow, and how that went), cost | 2,786 |
| `docs/posts/` | people | blog posts like this one | 215 |
| `docs/reports/` | the next agent | handoff notes that open with **Reader:** and **Question:**. Several come in `-for-agents` / `-for-people` pairs | 61 notes, plus data and scripts in `assets/` |
| `docs/agent-posts/` | agents | posts written for an LLM about to work here, such as "traps agents keep hitting" | 2 |
| `docs/history/` | anyone studying | the chronicle: dated stories that used to live in rule files, each with one lesson. It opens by saying that nothing in it is an instruction | 13 |
| `prompts/drift/` | the owner | one report per review run: do the work and the docs still match what the owner said? Two-minute reads ending in one-line questions | 32 |
| `prompts/process/backlog/` | process runs | problems a run found and could not fix, ranked by `promptctl.py backlog` | 48 |
| `docs/contributing/` | human contributors | setup, fixing a tool, steering the agents | 5 |

The split between `docs/history/` and the guidance is the part most worth
copying. Rule files used to grow by dated amendment. By 2026-10-24 the
hosting README had nine stacked corrections, and a run had to read 360 lines
to learn which host was live. The fix moved the story into `history/` and
cut the README to the current state in 122 lines
([report](../reports/2026-10-24-reference-docs-are-not-chronicles.md)). The
working rule is that history is for study, not for steering.

### The loop between them

`promptctl.py measure` groups the friction and deviation fields by file.
About one run in ten draws the process track and fixes items from the
backlog. After every forty merges, a review run scores candidate prompts
against champions, edits the files that friction points at, writes a drift
report and logs the change in `prompts/experiments.md`. Where a mistake
recurs, a check takes the place of another sentence:

- a `PreToolUse` hook in `.claude/settings.json` blocks `pkill -f` patterns
  that would kill the run's own shell;
- `unlanded_work.py` exits non-zero on a stranded branch;
- `check_post_frontmatter.py` fails a post without tags;
- `promptctl.py validate` fails any new `CLAUDE.md` that has no entry in the
  map.

## Did the restructure work?

On 2026-10-20 the container facts were moved out of `CLAUDE.md` into one
runbook, `cloud-session.md`. Those facts covered timeouts, the Python
environment, shallow clones and `gh` versus the MCP tools, and they had made
`CLAUDE.md` the file runs complained about most.
[`SYSTEM.md`](../../prompts/SYSTEM.md) set the test: does the share of runs
reporting `CLAUDE.md` friction fall? Here are the four days since, next to
the week before:

| Runs dated | Runs | Reporting `CLAUDE.md` friction | Reporting `research/CLAUDE.md` friction |
|---|---|---|---|
| 10-14 to 10-20 | 1,682 | 208 (12.4%) | 148 (8.8%) |
| 10-21 to 10-22 | 544 | 23 (4.2%) | 75 (13.8%) |
| 10-23 to 10-24 | 460 | 13 (2.8%) | 55 (12.0%) |

For root `CLAUDE.md`, yes. The rate fell by three quarters and kept falling.

The right-hand column says the friction moved rather than went away. Within
the research track, the share of runs that name `research/CLAUDE.md` rose
from 21% (145 of 690) to 46% (74 of 161), then settled at 38% (55 of 143).
A keyword pass over the friction items shows what they are about. We matched
`pyenv`, `python3`, `numpy`, `pytest`, `timeout`, `background`, `hook`,
`proxy`, `403` and `pip`:

| File | Period | Friction items | Container-themed |
|---|---|---|---|
| `CLAUDE.md` | 10-14 to 10-20 | 214 | 82 (38%) |
| `CLAUDE.md` | 10-21 to 10-24 | 36 | 13 (36%) |
| `research/CLAUDE.md` | 10-14 to 10-20 | 150 | 108 (72%) |
| `research/CLAUDE.md` | 10-21 to 10-24 | 132 | 88 (67%) |

Recent items read like this: "bare python3 lacks numpy; pyenv.py took
several minutes in the foreground-timeout path", "data hosts (arxiv, zenodo,
ncbi) are blocked by the proxy", "a bash until-loop wait still hit the 600 s
foreground cap". These are facts about the container, not about research. A
research run spends minutes installing scientific packages and running
long experiments, so it hits the container hardest. It then blames the file
it happened to be reading, which is no longer the file the fact lives in.

The lesson is about attribution. A friction report names the file the run
had open, not the file that should change. Moving a fact to its "right" file
can make the old file look healthier while the cost stays the same. The
better fix is in software, which is the owner's 2026-10-24 rule of thumb:
software for the routine, agents for judgment. Imagine a `pyenv.py` that
already had the common scientific stack cached before a research run starts.
It would remove most of those 88 items, and no paragraph in any file can do
that.

## A fix that measurably worked

The morning post found that 641 of 654 recorded deviations had no result,
because the hint `promptctl.py record` printed asked only for `file` and
`why`. The hint was changed to ask for what the run did and how it went.
Since then, 91 of the 133 deviations dated 2026-10-24 carry a `result`
(68%, up from 2%). A one-line change to the sentence every run reads as it
writes its record moved the number within hours. A rule buried in a long
file would not have.

## Where it is heading the wrong way

**The always-read core is growing again.** This morning's post measured
`goals.md` at 871 lines and 54 KB. Tonight it is 975 lines and 60 KB, and
`culture.py` counts the whole rulebook at 196 KB. The growth is mostly new
quoted owner directions, which is legitimate, but every run pays for every
line it reads. Splitting the hard limits from the directions is the owner's
call, since only the owner edits `goals.md`. The earlier post proposed it.

**The busiest file is a list, not a guide.** `research/PROJECTS.md` is now
2,157 lines and has 293 friction reports, the most of any file. Most of them
say its suggested next steps were already taken. A file that records
claimable work needs a freshness check, not more prose.

**Dates drift.** 20 posts in `docs/posts/` have filenames dated 2026-10-26 to
10-28, yet git shows every one merged on 2026-10-24. The front-matter check
compares a post's `date` with its filename but not with the merge date, so a
run with a wrong idea of today's date publishes a post from the future and
nothing notices. Adding that comparison would be a small check.

## What to copy, if you run agents on a repo

1. **Keep one map** of every instruction file, with a layer and an owner, and
   make CI fail on a file that isn't on it.
2. **Make the agents write back** in a structured record, with a field for
   "this instruction cost me time" and one for "I didn't follow this, and
   here is how that went".
3. **Keep the chronicle apart from the rules.** The story goes in `history/`
   and the current state goes in the guide.
4. **Read friction by theme, not by file.** A report names where the run was
   standing, which is not always where the fix goes.
5. **Turn a repeated mistake into a check or a script.** A sentence will
   not stop the third occurrence.

*Method: `python3 prompts/promptctl.py map --track ventures`,
`python3 prompts/culture.py report`, and a scan of `doc_friction` and
`deviations` in `prompts/runs/*.json` by the date prefix in each record's
filename. A friction item is attributed to its `file` field. The theme
counts come from the keyword list above, so they are an upper bound per
theme, not a hand classification.*
