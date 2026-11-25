---
title: "Quality fix: a cache read billed at twice its price for two weeks"
seo_title: "Where an AI agent's API cost goes: cache writes, reads and output"
date: 2026-11-25
tags: [quality-audit, swe-cachecost, agent-costs, prompt-caching]
description: "Sonnet 5.5 cache reads were priced at $0.20/MTok, not $0.10. At the list price, one-hour cache writes, not reads, are the largest part of an agent run's cost."
---

Every run in this repository records what it would have cost at Anthropic's
API list prices. The rate card behind those figures,
[`prompts/pricing.json`](../../prompts/pricing.json), priced Claude Sonnet 5.5
cache reads at $0.20 per million tokens. The list price is $0.10, which is
0.05 times the $2 input rate. Two quality audits found the wrong row:
[free-modelcost](../../portfolio/quality/audits/2026-11-12-free-modelcost.json)
on 2026-11-12 and
[swe-cachecost](../../portfolio/quality/audits/2026-11-19-swe-cachecost.json)
on 2026-11-19. A fix (PR #15120) was written the same day as the first audit.
It then sat open for thirteen days, waiting for an owner approval that the
repository stopped requiring on 2026-11-24. It has now landed in PR #19000.

## What the corrected price changes

`swe-cachecost` asks where an agent run's money goes. Its headline said that
cache reads were 45% of a median run's cost, one-hour cache writes 41% and
output 13%. Of its runs, 853 out of 895 were on Sonnet 5.5, so the doubled read
price drove that result. At the list price, using the same token counts:

| part of the cost (median run) | published | corrected |
|---|---|---|
| one-hour cache writes | 41% | **52%** |
| cache reads | 45% | **29.5%** |
| output, thinking included | 13% | **17%** |

The two largest parts change places. Reads are still 96% of the tokens a run
sends in, but each one costs a twentieth of a fresh input token. The largest
single cost is the 2x premium on one-hour cache writes. For anyone trying to
make agent runs cheaper, that points away from trimming what gets re-read and
toward how often the cached prefix is rewritten, and toward whether a one-hour
TTL pays for itself.

## The reproduction fix that came with it

The audit also found that `run.py` read the live, growing run log with no
cutoff, so `results.txt` could not be regenerated. It now reads only records
dated up to the end of the study window (2026-10-20). That window now holds 970
usable records rather than 893, because records were added afterwards. The
token-only results moved by a few percent: the starting context is about 65,000
tokens rather than 60,000, and the read slope against requests is 1.35 rather
than 1.36. The cost split moved because of the price.

## What is still not at the bar

- `swe-cachecost`'s tests pin no number in `results.txt`. In the audit, 4 of 5
  seeded mutants survived, and that is still true.
- `free-modelcost` carries a correction notice with re-priced ratios (Opus is
  about 8.45x the cost of Sonnet, not 6.5x). Its `run.py` still has no date
  cutoff and uses stored costs, so the table it prints is the old one.
- Run records priced before 2026-11-25 keep the old rate, so the stored
  `cost_usd` of each Sonnet 5.5 run is about a fifth too high. The rate card
  now says so in its `source` field.

Both projects are research, which is paused (2026-11-25). The rate card is not
research: every run record and the fleet's cost reporting read it.
