# Where the tokens go in an agent run, and how to get more work per quota

**Date:** 2026-10-20. **Asked by:** the owner: "can you analyze where tokens
go to in a given run? what's the breakdown of tokens in runs statistically?
and propose potential ways to get more tokens to go to work or get more work
done per quota?" **Agent version:**
[`2026-10-20-token-flow-for-agents.md`](2026-10-20-token-flow-for-agents.md),
the same findings as a terse brief an agent can follow.
**Blog post:** [`docs/posts/2026-10-20-where-an-ai-agent-runs-tokens-go.md`](../posts/2026-10-20-where-an-ai-agent-runs-tokens-go.md).
**Method:** read-only. Code and full output are in
[`assets/token-flow/`](assets/token-flow/).

## The short version

Almost none of the tokens a run uses are the agent doing work. The agent
re-reads its entire conversation on each request. That conversation starts at
about 65,000 tokens before the agent has done anything (instructions, tool
definitions, `CLAUDE.md`) and grows about 1,700 tokens per request. A typical
run makes 19 requests, so it reads about 1.6 million tokens to write about
8,600. Writing is 0.56% of tokens and 16% of the API-equivalent cost.

The largest single use of the budget is re-reading the same fixed starting
context: 69% of all tokens read.

## The data

`prompts/runcost.py` measures each run from its own transcript, from the token
counts the API returned, and writes them into the run record. 856 records
carry that block (16 to 20 October 2026; 826 on Sonnet 5.5, 29 on Opus 5.5).
Dollar figures are API list-price equivalents from `prompts/pricing.json`. The
runs are billed under a subscription, so they are not a bill.

### Pooled breakdown

| Kind of token | Share of tokens | Share of API-equivalent $ |
|---|---:|---:|
| Cache read (re-reading the context) | 96.0% | 47.8% |
| Cache write, 1-hour (adding to the context) | 3.3% | 35.5% |
| Cache write, 5-minute | 0.1% | 0.8% |
| Output (the agent's work, including thinking) | 0.56% | 15.9% |
| Uncached input | ~0% | ~0% |
| **Total** | 1.85 billion | $734 |

Cache reads are cheap per token (a tenth of the input price), so they are 96%
of tokens but under half of the cost. Cache writes are dear (twice the input
price for the 1-hour cache), so 3% of tokens cost over a third. Thinking is 18%
of output.

### A typical run

| Measure | Median | 10th to 90th percentile |
|---|---:|---|
| Requests to the model | 19 | 12 to 34 |
| Tool calls | 22 | 14 to 37 |
| Context per request | 81,200 tokens | 67,500 to 98,900 |
| Tokens read over the run | 1.57 million | 0.86 to 3.23 million |
| Output tokens | 8,561 | 3,758 to 22,517 |
| API-equivalent cost | $0.67 | $0.39 to $1.22 |

Bootstrap 95% intervals for every median are narrow (for example $0.64 to
$0.70); they are in `results.txt`.

### What fills the context

A least-squares fit of each run's mean context per request on its number of
requests gives a starting context of about 65,000 tokens (95% interval
60,000 to 69,000) and growth of about 1,700 tokens per request (1,200 to
2,100). In this report's own session the first request was 75,941 tokens:
47,778 read from a cache that sessions share (the harness's own instructions
and tool definitions) and 28,161 written fresh (this repository's
`CLAUDE.md`, the lists of skills and tools, environment notes). After that,
the agent's own reads of the always-read guidance add more: `prompts/goals.md`
alone is 33,000 characters, about 8,000 tokens.

### Other findings

- **The biggest quarter of runs (25 to 239 requests) is 47% of the spend.**
- **Mid-length runs are the cheapest per unit of work.** Runs of 25 to 50
  requests cost $0.064 per 1,000 output tokens (median), against $0.086 for
  runs under 25 and $0.105 for runs of 100 to 200. Short runs pay the fixed
  start-up cost for little work; long runs re-read a long history. The model
  puts the minimum near 35 requests. The median run stops at 19.
- **Calls are made one at a time.** There are 0.90 requests per tool call
  pooled, so only about one call in ten shares a request with another.
- **Bash is 79% of tool calls**, and tools take 67% of active time against 33%
  for the model.
- **Research runs read the most per request** (87,000 median context, 636
  output tokens per request); red-team and review runs the least.
- Only 7 runs used subagents. They were much larger (median 124 requests,
  $4.26), too few to say whether subagents save anything.

## How to get more work per quota

Estimated for a median Sonnet run with the fitted model. The model reproduces
the measured median cost ($0.644 modelled against $0.658 measured).

| Change | Cost saved | Tokens saved | Who acts |
|---|---:|---:|---|
| Use a 5-minute cache instead of a 1-hour one | 16% | 0% | the harness (not a run); risky when tools run long |
| Keep 10,000 tokens out of the starting context | 12% | 13% | prompt maintainers and the review track |
| Halve what each request adds (shorter tool output) | 11% | 8% | every run |
| Make 20% fewer requests for the same work (batch calls) | 10% | 20% | every run |
| Do related work in the same run instead of stopping at about 19 requests | about 10% per request | | the owner's scheduling, and every run |

In order of what I would do:

1. **Put the agent brief where runs read it.** It is linked from
   `.github/prompts/cloud-session.md` in this PR. It asks for batched calls,
   capped tool output, section reads of long documents, and one `ToolSearch`
   per run.
2. **Have the review track put a token budget on the always-read set.**
   `promptctl.py map` already carries line budgets. A budget in tokens across
   `CLAUDE.md`, `prompt.md` and the parts of `goals.md` a run must read would
   show what each standing direction costs on every request of every run.
3. **Fewer, fuller runs.** If scheduling allows, give each run two related
   items instead of one. The cheapest band is 25 to 50 requests.
4. **Measure again after (1).** `requests per tool call` and the fitted
   growth per request are both in `results.txt`. If the brief works, the first
   falls and the second shrinks.

## Action items for a later run

Left open when this report merged on 2026-10-20:

1. **Confirm CI.** The PR (#8755) merged while its `test`, `duplicate-symbols`
   and one `check` job were still queued, with the local checks for what it
   touches passing: `pytest prompts` (86 passed), `promptctl.py validate`,
   `checklist_coverage.py`, `regen.mjs --verify`, `check_md_links.py` and
   `node --test platform/pages/writing.test.mjs` (8 of 8). If any of those
   jobs is red on `main` for this change, fix it forward.
2. **Measure what fills the context, per tool.** Extend `prompts/runcost.py`
   to record each tool's result size (characters per tool) in the `usage`
   block. Then the 31% of reads that is accumulated work can be split by
   source across all runs, not just one session.
3. **Add a token budget for the always-read set** to `promptctl.py map`,
   alongside the existing line budgets (item 2 of the list above).
4. **Re-measure in a week.** Rerun `analyze.py`. Then compare requests per
   tool call (0.90 now) and growth per request (about 1,700 tokens now)
   before and after the brief was linked from `cloud-session.md`.

## What this cannot tell you

- How the subscription quota counts tokens. If it counts raw tokens, re-reading
  is 96% of the quota; if it counts like the API price, 84%. The advice is the
  same either way, but the size of each saving is not.
- Anything before 16 October, when the measurement started, or about runs that
  skipped the cost step.
- What is in the context, beyond the start of one session. The records hold
  totals, not each request. A per-request breakdown by tool would need
  transcripts, and only this session's is in the container.
- The value of the work. Output tokens are a proxy for work done, not for
  useful work (see `research/swe-spendoutput` and `research/swe-value`).
