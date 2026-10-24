---
title: "Where an AI coding agent's tokens go: 856 runs measured"
date: 2026-10-20
description: "We measured 856 unattended Claude Code runs: 96% of tokens are the agent re-reading its own context, 0.56% are output. The breakdown and what cuts it."
tags: [ai-agents, llm-cost, prompt-caching, software-engineering]
---

# Where an AI coding agent's tokens go

This repository is built mostly by unattended AI coding sessions. Each one
starts fresh, reads the repository's instructions, does a task and merges a
pull request. Since 16 October every run records its own token usage, taken
from the counts the API returned. That gives us 856 measured runs (826 on
Claude Sonnet 5.5, 29 on Opus 5.5, 16 to 20 October 2026). We used them to
answer a plain question: when an agent uses a million tokens, what are they
spent on?

## Almost all of it is re-reading

A coding agent is a loop. The model asks for a tool call, the harness runs the
tool, and the whole conversation so far goes back to the model with the result
added. Prompt caching makes the re-read cheap per token, but every request
still processes all of it.

| Kind of token | Share of tokens | Share of API-equivalent cost |
|---|---:|---:|
| Cache read (re-reading the context) | 96.0% | 47.8% |
| Cache write (adding to the context) | 3.4% | 36.3% |
| Output (what the model writes, thinking included) | 0.56% | 15.9% |

The model reads 177 tokens for every token it writes. A median run makes 19
requests and 22 tool calls, reads 1.57 million tokens, writes 8,561, and costs
$0.67 at API list prices. (These runs are on a subscription, so that is an
equivalent, not a bill.)

Cache writes look odd at first: 3% of tokens but over a third of the cost.
Writing to the 1-hour cache costs twice the normal input price, and a cache
read costs a tenth of it. So the first time anything enters the context is
expensive, and each later re-read is cheap but frequent.

## Most of what is re-read is the same every time

If a run's context starts at P tokens and grows by g per request, its mean
context per request is P + g × N / 2 for N requests. Fitting that across the
856 runs gives **P ≈ 65,000 tokens** (95% bootstrap interval 60,000 to 69,000)
and **g ≈ 1,700 tokens per request** (1,200 to 2,100).

So before an agent here has done anything, its context already holds about
65,000 tokens: the harness's instructions and tool definitions, the
repository's `CLAUDE.md`, and the lists of available skills and tools. That
fixed start is **69% of every token read**. The agent's actual work (files it
read, command output, its own earlier turns) is the other 31%.

In the session that wrote this post, the first request was 75,941 tokens.
47,778 came from a cache shared across sessions, and 28,161 were written fresh.

## Mid-length runs are the cheapest per unit of work

A short run pays the fixed start for little work. A long run re-reads a long
history at every step. Somewhere between them is a minimum:

| Requests in the run | Runs | Median cost per 1,000 output tokens |
|---|---:|---:|
| under 25 | 626 | $0.086 |
| 25 to 50 | 201 | $0.064 |
| 50 to 100 | 21 | $0.080 |
| 100 to 200 | 7 | $0.105 |

The fitted model puts the minimum near 35 requests. The median run here stops
at 19, so most runs end before they reach the cheapest length.

## What gets more work out of the same quota

Holding the work (output) fixed, we estimated savings for a median run with
the fitted model, which reproduces the measured median cost to within 2%:

- **Batch independent tool calls.** Pooled, there are 0.90 requests per tool
  call, so nearly every call costs a full re-read of the context. Making 20%
  fewer requests for the same work saves about 20% of tokens and 10% of cost.
- **Cap tool output.** Everything a command prints stays in the context and is
  paid for again on every later request. Halving growth per request saves
  about 11% of cost. `tail`, `head`, `grep -c` and quiet test flags do it.
- **Shrink the always-read instructions.** Each 10,000 tokens kept out of the
  starting context saves about 12% of cost and 13% of tokens, on every run.
  Instructions written for agents tend to grow, because each fix adds a
  paragraph. That paragraph costs a little on every request of every run from
  then on.
- **Do related work in one run.** Moving runs from 19 requests toward 35
  lowers cost per request by about 10% in the model.
- **Cache lifetime.** A 5-minute cache instead of a 1-hour one would cut about
  16% of cost. That is the harness's choice, not the agent's, and a short cache
  expires while long tools run.

We wrote these into a brief that sessions here now read
([`docs/reports/2026-10-20-token-flow-for-agents.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/reports/2026-10-20-token-flow-for-agents.md)),
and we will measure whether requests per tool call and growth per request
fall.

## Caveats

Five days of data, and 97% of runs on one model. Costs are list-price
equivalents. We do not know how a subscription's quota weights cached reads
against output; on raw tokens re-reading is 96% of the total, and on price
84%. Output tokens are a proxy for work done, not for useful work. The
prefix-and-growth split comes from a fit to per-run totals, not from
inspecting each request.

The analysis is one stdlib Python script,
[`docs/reports/assets/token-flow/analyze.py`](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/reports/assets/token-flow/analyze.py),
and its full output is
[`results.txt`](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/reports/assets/token-flow/results.txt).
The longer report is
[`2026-10-20-token-flow-for-people.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/reports/2026-10-20-token-flow-for-people.md).
Written with AI assistance (Claude).
