---
title: "Red team, blue team: seeding 1,371 bugs to see how many tests catch"
date: 2026-10-20
description: "AI agents seeded 1,371 small bugs into a monorepo, one at a time. Its own tests caught 70%, boundary bugs fared worst, and 32 real defects turned up."
tags: [ai-agents, mutation-testing, software-testing, quality]
---

# Red team, blue team: seeding bugs to see how many tests catch

Most quality numbers count failures something already noticed: a red CI
run, a review comment, a revert. None of them says how many bugs go
*unnoticed*. In a repository where unattended AI coding agents merge a few
hundred pull requests a day, with an owner steering a few hours a week, that
is the number that matters. If a session ships a bug, would anything catch
it?

Since 15 October a small share of agent runs, about 7%, has been answering
that question directly. This post reports what they found. All numbers come
from the run records in [`prompts/runs/`](../../prompts/runs/), tallied by
[`prompts/redteam.py`](../../prompts/redteam.py) `tally` on 20 October 2026.

## How it works

The red-team track, set out in
[`prompts/redteam/prompt-0.md`](../../prompts/redteam/prompt-0.md), is a form
of mutation testing. A run picks a file that some test suite guards and
seeds a **mutant**: one small, deliberate defect. The operators are simple,
listed in `redteam.py`: flip `==` to `!=`, `<` to `<=`, `+` to `-`, `and` to
`or`, `true` to `false`, `max` to `min`, or add one to a constant. The tool
applies one mutant at a time, runs that file's own tests, then puts the file
back byte for byte.

A failing suite **caught** the mutant. A passing one let it **escape**. Then
the same run switches sides. As the blue team, it triages each escape as
either a real gap or an *equivalent* mutant that changes no visible
behaviour, writes the smallest test that catches each gap, and proves it by
re-running the escaped mutants (`redteam.py rerun`). It also spends part of
the run hunting for real defects by hand, and patches what it finds.

The rates are never typed by hand. The tool writes each mutant and its
result into the run record, and the tally is computed from those.

## The headline numbers

| Measure | Value |
|---|---|
| Red-team runs | 123 (15 to 20 October) |
| Campaigns / distinct files mutated | 172 / 95 |
| Mutants seeded | 1,371 |
| Caught by the existing tests | 901 |
| Escaped | 383 |
| Triaged as equivalent | 87 |
| **Catch rate** (caught / non-equivalent) | **70.2%** |
| Escapes later caught by a new test | 365 of 383 |
| Catch rate after the blue team's fixes | 98.6% |
| Real defects found and patched | 32 of 32 |

So, on the files the agents mutated, roughly **three in ten small bugs got
past the tests that existed for that file.** The blue team then added tests
that caught 365 of the 383 escapes.

## Which bugs slip through

The catch rate depends a lot on the kind of bug:

| Mutation | Caught | Escaped | Catch rate |
|---|---|---|---|
| `*` to `/` | 33 | 3 | 92% |
| `/` to `*` | 47 | 7 | 87% |
| `==` to `!=` | 102 | 17 | 86% |
| `+` to `-` | 83 | 14 | 86% |
| `or` to `and` | 94 | 32 | 75% |
| constant plus one | 307 | 191 | 62% |
| `<` to `<=` | 14 | 13 | 52% |
| `<=` to `<` | 6 | 7 | 46% |
| `>` to `>=` | 20 | 26 | 43% |

The pattern is the textbook one. Tests catch gross arithmetic errors because
almost any example input exposes them. They miss **boundary** errors, where
the code is wrong only at exactly the threshold. Across the four comparison
operators, 43 boundary mutants were caught and 50 escaped. Tests rarely
check the value right at a limit. Off-by-one constants were the largest
group, and more than a third of them escaped.

By area, the platform and CI code (71.4%) and the product code under
`ventures/` (68.8%) came out about the same.

## The real defects

The hunt for real bugs found 32, and every one was patched in the same run.
Some examples, quoted from the records:

- A fee calculator, given an offer above the listed price, told the user
  "the entire $-10.00 discount came out of your own payout".
- A webhook signature checker let a non-numeric timestamp pass its replay
  window check.
- Twenty calculators used lookups like `TABLE[input.key]` that treated
  `constructor` or `__proto__` as valid keys, so a stray input crashed
  them or produced garbage instead of falling back to a default.
- A self-employment tax calculator charged Additional Medicare Tax on
  earnings under the $400 Schedule SE minimum.
- A check that pages run AI "locally" matched hostnames like `10.evil.com`
  as private addresses, so a page could say nothing leaves your computer
  when it did.
- The CI guard against committed payment keys skipped `.sh`, `.txt` and
  several other file types.

One defect shows why the track says to fix the class, not the instance. A
run found eight products printing negative money as `$-9.24`. A CI check for
exactly that already existed, but it only looked at functions named like
`money` or `usd`, so the same bug shipped under `dollars` and `formatUsd`.
The run fixed the eight products and the guard.

Several "defects" were a red baseline: the tests for the target file were
already failing on `main` before any mutant was applied. The tool refuses to
run against a red baseline, and the prompt treats one as a real defect to fix
first.

## What changed because of it

Two fixes to the method came out of the runs themselves. First, the random
draw of target files was mostly product code: on 17 October, 3,502 of the
3,667 guarded files were under `ventures/`, so CI and tooling code was
rarely tested. Backlog item P034 added an `--under platform` option; in
records from 15 to 17 October, 11 of 84 targets were outside `ventures/`,
and on 18 October it was 12 of 14 (a small sample). Second, a stale Python bytecode cache
once kept serving the original file to the tests, hiding a mutant; the tool
now runs suites with bytecode writing turned off (experiment E36 in
[`prompts/experiments.md`](../../prompts/experiments.md)).

## Caveats

- **The catch rate has not risen, and was not expected to.** The daily rate
  stayed between 67% and 71% from 15 to 19 October. Each campaign mutates a
  different file, so a new test protects that file, not the next one drawn.
- **Untested files are never sampled.** The tool only targets files some
  suite guards, so the rate describes tested code. Code with no tests at all
  would catch nothing, and it is not in this number.
- **"Equivalent" is a judgment call.** The 87 mutants triaged as
  equivalent were judged so by the agents, with a written reason. The prompt
  says to be strict, but nobody re-checked them.
- **The after-fix rate is close to 100% by construction**, because the blue
  team writes tests for exactly the mutants that escaped.
- `research/` is excluded from mutation: the tool's exclusion list still
  treats that tree as a mirror of another repository.

The red-team runs were also cheap: a median of $0.40 at API list prices
across the 79 that recorded their cost. That is an equivalent, not a charge,
and none of this is professional advice on how to test your own code.

For the cost data behind that figure, see
[What an AI coding agent's pull request costs](2026-10-20-ai-coding-agent-cost-per-pull-request.md).
