# Sources and arithmetic for the "If the line keeps going" reflection series

**Answer first:** the post
[`docs/posts/2026-11-07-if-the-line-keeps-going.md`](../posts/2026-11-07-if-the-line-keeps-going.md)
starts a series, and the owner calls it "an ongoing subject of reflection".
This file holds every external figure it uses, where each came from, and the
arithmetic, so a later instalment can rerun or correct them instead of
copying the post. A later instalment adds a dated section here rather than
editing the old figures.

## External figures (gathered 2026-11-07)

These came from web search result summaries. `artificialanalysis.ai` does not
resolve from the cloud session's network, so **none of the Artificial
Analysis pages were read directly**. Treat each figure as "as reported" and
check it against the primary page before you lean on it.

| Figure | Value as reported | Source (not fetched directly) |
|---|---|---|
| Labs with a model above 50 on the AA Intelligence Index | two in early June 2026, six by mid-July 2026 | artificialanalysis.ai/articles/four-frontier-launches-in-eight-days-six-labs-now-field-a-model-above-50-on-the-artificial-analysis-intelligence-index |
| Top AA index score | roughly mid-50s early 2026, about 60 late 2026, across index versions v4.x and v5 | artificialanalysis.ai/models and the v4.1 and v5 announcement articles |
| Gap between best closed and best open-weight model, index v5 | 12 points (46 against 58), up from 3 points in v4.3 | artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v5 |
| METR 50%-success time horizon doubling time | about 7 months over 2019 to 2025 (original paper, arXiv 2503.14499); about 4 months (≈129 days, CI roughly 105 to 157) for 2023 onward in the Time Horizon 1.1 update | arxiv.org/abs/2503.14499; secondary summaries of TH 1.1 |
| Top measured horizon, early 2026 | about 14.5 hours (one frontier model, TH 1.1), near the top of the suite's reliable range | secondary summaries of TH 1.1 |

Caveats that the post repeats:

- The AA index is **rebased**: v4.x and v5 scores are not comparable, and it is
  bounded at 100. "The same trend" can't mean extrapolating the score itself,
  because the index gets rebuilt whenever its tests saturate. The post
  extrapolates the time horizon instead, which has no ceiling.
- The METR horizon is for software-style tasks at 50% success. Real work is
  messier, and the reliable-success horizon is shorter.

## Arithmetic

Starting from a 14.5-hour horizon, with doubling time *d* months, the horizon
after *t* months is `14.5 × 2^(t/d)` hours.

| Horizon reached | at d = 7 | at d = 4 |
|---|---:|---:|
| 300 h (the owner's suggested project size, `CLAUDE.md`) | 4.37 doublings, about 31 months | about 17.5 months |
| after 24 months | 14.5 × 2^3.43 ≈ 156 h | 14.5 × 2^6 = 928 h |
| after 60 months | 14.5 × 2^8.57 ≈ 5,500 h (about 2.7 working years at 2,000 h) | 14.5 × 2^15 ≈ 475,000 h; past any meaning |

`python3 -c "import math;print(math.log2(300/14.5))"` gives 4.37.

## Repository figures (rerun these)

| Figure | Value | How to rerun |
|---|---|---|
| Posts in `docs/posts/` | 2,661 on 2026-11-07, from 2 on 2026-10-16 | `ls docs/posts \| wc -l`; per-day counts with `ls docs/posts \| cut -c1-10 \| sort \| uniq -c` |
| Directories under `ventures/` | 1,338 | `ls ventures \| wc -l` |
| Directories under `research/` | 1,068 (includes a few non-project folders such as `_shared`) | `ls -d research/*/ \| wc -l` |
| Concurrent agent sessions, merges a day | about 16 sessions, 280 merges a day (2026-10-17 to 10-20) | `docs/parallel-agents.md` |
| Products with a usage entry | 302 | `grep -c "slug:" portfolio/usage/usage.yaml` |
| `live_url_visitors` readings that are not null | 0 of 461 | `grep "live_url_visitors:" portfolio/usage/usage.yaml \| sort \| uniq -c` |
| Ledger `agent_spend_usd` in the Oct to Nov ledgers | 154 `null`, 60 `0`, none with a dollar figure | `grep -h agent_spend_usd portfolio/ledger/2026-1*.yaml \| sort \| uniq -c` |
| Ledger `mrr_end` in the same files | 212, all `0` | same, with `mrr_end` |

Limits: a `0` in `agent_spend_usd` is a session that recorded zero because it
could not see its own cost (`portfolio/ledger/cost-signal.md`). It does not mean
the session was free. So the repository's compute budget is **unknown from
inside it**, and the post says so.

## For the next instalment

Things worth measuring rather than arguing: the first non-null visitor
reading; the first real `agent_spend_usd`; whether the AA open-weight gap
closes again under v5; a primary-source read of METR's current horizon (ask for
`artificialanalysis.ai` and `metr.org` to be allowed in the environment, or
read them from a session that can reach them).

## Part 2 figures (gathered 2026-11-07)

For [`docs/posts/2026-11-07-if-the-line-keeps-going-who-works.md`](../posts/2026-11-07-if-the-line-keeps-going-who-works.md).
Same limits as above: `digitaleconomy.stanford.edu` and `artificialanalysis.ai`
don't resolve from the session network, so these come from search summaries.
Check the primary page before relying on any of them.

| Figure | Value as reported | Source |
|---|---|---|
| Employment of ages 22 to 25 in most AI-exposed jobs relative to less-exposed peers | 19% below trend (ADP data through June 2026); earlier specifications 13% (Aug 2025) and 16% (Nov 2025), so these aren't comparable; decline where AI automates, not where it augments; no economy-wide displacement | Brynjolfsson et al., "Canaries in the Coal Mine?", Stanford Digital Economy Lab, August 2026 version |
| Recent college graduates' unemployment | 7.3% in summer 2026, no significant rise compared with older graduates or young non-graduates | Fairlie and Wu, NBER working paper w35796 |
| Occupational mix | changing slightly faster than in the past, a shift that began in 2021; low-hire, low-fire market; gap between recent grads (20 to 24) and older grads (25 to 34) at the high end of its historical range | Yale Budget Lab AI labor market tracker, updated 2026-04-16 with March 2026 CPS data |
| Jobs with AI used in at least 25% of tasks | 49%, up from 36% in early 2025 | Anthropic Economic Index, January 2026 report |
| Claude.ai conversations, augment against automate | about 52% against 45% (November 2025 data); automation dominant in API traffic | same |
| US businesses using AI (Census BTOS, past two weeks) | 17.7% at the start of 2026, 23.8% in a later release; firms with 1 to 19 employees about 19 to 20%, firms with 250 or more about 38% (spring 2026) | Census BTOS, via secondary trackers |
| Occupation automation-risk rankings | emergency responders, skilled trades and direct-care health at the low end; administrative health roles at the high end | secondary reports (Planera, April 2026; Hamilton Group, September 2026); the post uses these for order only, not their percentages |

Repository figures used in part 2: 294 red-team runs, 3,437 seeded bugs,
fresh files miss 3 in 10 (`docs/posts/2026-10-29-red-team-fifteen-days-damage-and-repairs.md`);
merges a day 55 to 280 (`docs/parallel-agents.md`).
