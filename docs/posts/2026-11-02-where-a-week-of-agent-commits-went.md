---
title: "Where a week of agent commits went"
date: 2026-11-02
tags: [process, agents, portfolio, measurement]
description: A new daily and weekly report sorts every commit by project against the owner's ranked lists; last week 74% of project commits went to flagships and programmes.
---

The repository now has a daily and a weekly direction report (a scheduled job to write them is waiting on the owner's approval). It reads the commits on main, gives each one a home (the project holding most of its changed lines), sorts the projects by the owner's own rankings (the flagship list, the open requests, the research programmes) and sizes each project's tree. Then it writes suggestions for the next agent runs: what got no attention, what took effort without being on any list, and what is spreading thin. The script is `portfolio/direction/report.py`; the newest suggestions are in `portfolio/direction/LATEST.md`.

## Last week, 26 October to 2 November

1,891 commits landed on main, against 2,355 the week before. 1,475 of them had their home in a project; the rest were CI and checks (96), the shared site and services (87), agent guidance (63), run records alone (97) and smaller areas. Guidance, CI, portfolio bookkeeping and run records together came to 15% of commits.

Of the project commits:

| Kind of work | Commits | Share |
|---|---:|---:|
| Flagships | 748 | 51% |
| Research programmes | 338 | 23% |
| Other ventures | 353 | 24% |
| Research projects in no programme | 17 | 1% |
| Calculators | 18 | 1% |

So 74% went to the ranked lists, up from 54% the week before. Part of that rise is bookkeeping, not behaviour: three programmes (aerolog scaling, heavy hydraulics, marine hulls) were opened this week, and the report applies today's lists to both weeks.

The two biggest flagships took the most: wall-framing-takeoff 293 commits, ai-bookkeeper 231. The surprise was third and fourth place: shed-designer, a venture created this week, took 134 commits, and hearth-and-horizon 116. Neither is on the flagship list. Both are large trees (each about 1,400 "size hours" on the report's proxy), so this may well be depth worth keeping, but it was nobody's stated choice. The report's suggestion is to put them on the list with a written next milestone, or steer runs back to the list.

Calculators, which the owner asked to stop deepening on 2026-10-21, got 18 commits across 18 different tools: one each, which looks like upkeep rather than new features. Four new projects under 20 size hours were started outside any list, and 17 research commits went to projects no programme builds on.

## How deep the projects are

Depth is the hard part to measure. The report shows three numbers side by side and says what each one is worth. "Size hours" is code and test lines divided by 20, an order-of-magnitude guess at what the tree would take a person to write; agent-written padding inflates it. "Sessions" counts run records that name the project. "Recorded hours" adds up the human-hour estimates runs gave themselves, which most runs still leave out. By size, the deepest projects that got work last week were einvoice-preflight (about 1,800 hours), ai-bookkeeper (1,700), shed-designer and hearth-and-horizon (1,400 each) and wall-framing-takeoff (1,100). The owner's rule of thumb is about 300 hours.

The track mix nearly matched the routing weights: ventures 34% of 1,376 runs against a weight of 29%, research 25% against 29%, the performance track 1% against 5%.

## Caveats

A commit is a proxy for effort, not a measure of it. One commit can be a typo fix or a solver. The rankings come from the owner's files, so the report can only say whether work matched the lists, not whether the lists are right. Every number can be recomputed with `python3 portfolio/direction/report.py --weekly --date 2026-11-02`.
