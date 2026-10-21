---
title: "What an AI coding agent's pull request costs: 817 measured runs"
date: 2026-10-20
description: "Tokens, minutes and API-equivalent dollars from 817 measured agent runs: a typical run is 3 minutes and about 67 cents, and cache reads dominate."
tags: [ai-agents, llm-cost, software-engineering, measurement]
---

# What an AI coding agent's pull request costs

This repository is built mostly by unattended AI coding agents, with an owner
steering a few hours a week. Every agent session writes a run record, one
JSON file under [`prompts/runs/`](../../prompts/runs/), before it merges its
pull request. Since 16 October most of those records also carry a `usage`
block that says what the run cost: tokens, models, minutes and dollars.

This post reports what those blocks say. Every number below comes from the
run records as committed on 20 October 2026, read with
[`prompts/runcost.py`](../../prompts/runcost.py) `report` and a short script
over the same files.

## First, coverage

There are 1,562 run records. Only **817 of them (52%) carry a measured
`usage` block.** The other 745 do not, for two reasons:

- 285 records were imported from the research repository's old run log
  before the two repositories merged, and had no cost data.
- The tool that writes the block, `runcost.py attach`, only came into use on
  16 October. Every measured record is dated 16 to 20 October; none of the
  427 records from 13 to 15 October has one.

So this is five days of runs, not the repository's whole history. Of the 817
measured runs, 751 name a pull request.

## How the cost is measured

`runcost.py attach` reads the session's own Claude Code transcript and sums
the token counts the API returned on each request, de-duplicated by message
ID. It records which model answered (from the response, not the
configuration), the time spent, and the tool calls. The method is described
in [`prompts/README.md`](../../prompts/README.md), "What a run cost".

Two caveats are written into every block. The dollar figure is
**API-equivalent**: measured tokens times the list prices in
[`prompts/pricing.json`](../../prompts/pricing.json). These runs are billed
under a subscription, so it is not what was charged. And some things are not
counted at all: harness calls outside the transcript (such as context
compaction), transcripts lost when a cloud session moved containers, CI
minutes, and the reviewer bots' own model calls.

## The numbers

| Measure (817 runs) | Median | Total |
|---|---|---|
| API-equivalent cost | $0.67 | $693.17 |
| Active minutes (model plus tools) | 3.1 | 4,436 (about 74 hours) |
| Model requests | 19 | 18,434 |
| Output tokens | 8,408 | 9.6 million |
| Cache-read tokens | 1.49 million | 1.67 billion |
| Tool calls | 22 | 20,412 |

A typical run is short: about three minutes of active time, nineteen model
calls, twenty-two tool calls, and well under a dollar. The spread is narrow.
About a quarter of runs cost $0.50 or less, three quarters under $0.90, and only 9
of 817 cost more than $5. The most expensive single run was $19.24.

Of the active time, about a third was the model thinking (1,426 minutes) and
two thirds was tools running (3,011 minutes): tests, builds, git and the
GitHub API.

## Where the money goes: re-reading context

The surprise is which tokens cost money. Almost all tokens are cache reads:
1.67 billion of 1.74 billion. Each request re-sends the conversation so far,
and the API serves most of it from a prompt cache at a fraction of the input
price. The median run's cache hit share was 95.7%.

Pricing each token type at list price gives this split of the $683.60 spent
on priced models:

| Token type | API-equivalent dollars | Share |
|---|---|---|
| Cache reads | $328.20 | 48% |
| Cache writes | $249.70 | 37% |
| Output | $105.50 | 15% |
| Uncached input | $0.10 | under 1% |

Output, the code and prose the agent actually writes, is about a seventh of
the bill. Most of the cost is the agent holding its context: the
instructions it reads at the start, the files it opens, and the tool output
it carries forward. That is one reason the repository has been shrinking its
always-read instruction files; see
[the review-loop post](2026-10-20-self-improving-agent-prompts-review-loop.md).

## By model and by kind of work

| Model | Runs | Successful | Total | Median per run | Per successful run | Median active minutes |
|---|---|---|---|---|---|---|
| Claude Sonnet 5.5 | 796 | 767 | $580.52 | $0.66 | $0.76 | 3.0 |
| Claude Opus 5.5 | 20 | 20 | $103.07 | $3.83 | $5.15 | 16.8 |

One more run's model is recorded as "redacted" ($9.58). Opus runs cost about
six times as much each, but they are not comparable work: there are only 20,
and they were longer sessions (a median of 60 requests against 19). Nothing
here says which model is better value for the same task.

By track, the routed category of work, the median run ranged from $0.40 for
red-team runs and $0.45 for process and review runs to $0.64 for product
work and $0.85 for research. Research runs were also the longest, at a
median 3.8 active minutes.

## Human-equivalent hours: a low-certainty number

Each record also carries the agent's own estimate of how long a competent
person would take on the same task, priced at an assumed $100 an hour (an
owner-editable assumption in `pricing.json`, not a market survey). The
measured runs' estimates sum to 2,465 hours, with a median of 2 hours per
run. The ratio of those dollars to API dollars, which `runcost.py` calls
leverage, has a median of 280.

Treat that figure with suspicion. Every block labels it "low: the agent's
own estimate ... never measured". Agents grading their own work have every
reason to be generous, and nobody has timed a person doing any of these
tasks. The tokens and minutes are measured; the human hours are a guess.

## What this does and does not tell you

It tells you that, in this repository, an agent session that opens and
merges a small pull request costs well under a dollar at list prices and a
few minutes of machine time. Compute is not the constraint. The companion
post
[Throughput per unit of supervision](2026-10-16-throughput-per-unit-of-supervision.md)
argues the scarce resource is the owner's attention, and these numbers fit.

It does not tell you what the work is worth. Cost per run says nothing about
whether a pull request was useful, and no product here has a measured
visitor yet. It also covers five days and mostly one model. Compare groups
only once each has about ten runs, as the report itself warns.

These are API-equivalent estimates for one repository, not a quote and not
financial advice; your costs depend on your model, prices and workload.

## Reproduce it

```
python3 prompts/runcost.py report
```

prints the per-model, per-track and per-prompt tables from the same files.
The token-type split comes from summing each record's `usage.models` counts
against `prompts/pricing.json`.
