---
title: "When a crash looks like \"over budget\": exit codes in 15 pricing calculators"
seo_title: "CLI exit codes: a crash read as an over-budget gate"
date: 2026-11-17
tags: [redteam, ventures, ci]
description: "15 pricing CLIs promise exit 1 for over budget and 2 for bad input. Bad input crashed them with exit 1. Now it exits 2, and a CI check keeps it so."
---

The pricing calculators in this repository, from
[search APIs](https://marisstella.app/search-api-pricing-calculator/) to CDN
bandwidth, error tracking and GPU training, each come with a small Node CLI.
They also promise a CI gate:

```
// Exit 0 ok, 1 over --budget, 2 bad input.
```

You run `node cli.mjs compare ... --budget 300` in a pipeline, and the build
fails when the bill would go over budget.

## What the red team found

Today's red-team run seeded 20 faults into the search-API calculator's engine.
Eight escaped its tests. While reading the code around them, we tried the inputs a
stranger might type:

- `--months 0`. The projection builds an empty list of months and then reads the
  last one. That throws, and **Node exits 1 on an uncaught exception**. The
  gate's code for "over budget" and the code for "the tool crashed" were the same
  number.
- `--months 2.5` ran three months and printed "2.5-month spend".
- `--prices file.json` containing `null` crashed the same way. An array, a
  string or `{"algolia": 3}` were quietly ignored.

A pipeline that reads exit 1 as "over budget" would tell you the bill was too
high when the real problem was a typo in the command. Wrapper scripts that
treat any non-zero exit as a failure still break the build, but for the wrong
reason, and one that tolerates "over budget" as a warning lets the broken
command through.

## It was not one tool

The calculators share a template, so we wrote a probe instead of checking them
one by one. `platform/ci/check_cli_bad_input_exit.py` finds every `cli.mjs`
whose header promises "1 ... 2 bad input" and has a `compare` command. It builds
the smallest valid command from the usage line, checks that it exits 0, then
tries the hostile inputs above and requires exit 2.

On its first run it probed 15 CLIs and found **84 bad-input runs that did not
exit 2**. 14 of the 15 had both bugs. One more (training-gpu) had only the
`--prices` bug, which we checked by hand because the probe can't build its
`--gpu` argument from the usage line.

## The fix

Each CLI now checks `--months` (a whole number, 1 or more) and `--prices` (a
JSON object whose entries are objects) before it computes anything, and exits 2
with a message that names the bad flag. The search calculator's engine also
handles zero months without throwing: it returns today's volumes and zero
spend. All 16 venture suites pass, and the probe now reports 0.

The probe is an argument-free `check_*.py`, so `unwired_checks.py` runs it on
every pull request that touches a venture, with no workflow change. The next
calculator copied from the template has to get this right before it merges.

## The mutation numbers

Six of the eight escapes were real gaps, and four new engine tests now catch
all of them. They cover the last month of a projection, the
crossover when the cheapest plan changes at the very first step, and an unknown
provider being an input error rather than "over budget". Leaving out the two harmless faults, the catch rate went from
12 of 18 to 18 of 18. The two harmless ones can't change anything a user sees: a sort comparator that returns -2 instead of -1, and
`Array.prototype.sort` only looks at the sign.

These are estimates from typed assumptions and editable rate cards, not quotes;
check each provider's own pricing page.
