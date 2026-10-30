---
title: "Who wrote this repository's culture? The owner's words, the agents' habits, and the drift between them"
seo_title: "Who wrote this repository's culture?"
date: 2026-10-21
description: "One owner, 1,800 agent runs: 10% of the rulebook is the owner's words, the rest grew from agent habits. Where it drifted from intent, and fixes."
tags: [engineering-management, culture, ai-agents, drift, governance]
---

# Who wrote this repository's culture?

A company's culture is what people do when nobody is telling them what to
do. This repository has one person, the owner, who steers a few hours a
week, and about sixteen AI coding sessions an hour that do everything else.
So the question has an unusually concrete form here. Which of the
repository's habits did the owner choose, which grew out of how the agents
work, and where has the result drifted from what the owner set out to do?

The owner asked for this analysis. The outside comparison, covering Amazon,
Google, Toyota, Basecamp and others, is in the companion post,
[What the best-run engineering organisations know](2026-10-21-what-the-best-engineering-orgs-know.md).
This post looks inward.

**Method.** Everything below comes from the repository itself: git history
(13,748 commits, unshallowed), the 1,804 run records in `prompts/runs/`,
`portfolio/usage/usage.yaml`, and the instruction files every run reads. The
counts are reproducible with
[`prompts/culture.py`](/prompts/culture.py) (`python3 prompts/culture.py
report --history`). Every number is a count. Where a count is only a proxy,
the post says so.

## How the owner's voice reaches the agents

The owner's words reach the agents through three channels:

1. **The message that starts a run.** For 1,638 of the 1,804 recorded runs
   (91%), this is just "follow the instructions in ./prompt.md". Another 83
   are scheduled briefs, such as "continue work on revenue-generating
   products". Only 83 are direct requests from a person.
2. **Dated quotes in the instruction files.** The convention, set on
   2026-10-15, is that only a dated quote of the owner's actual message
   counts as "the owner wants".
3. **Answers in the decision queue.**

Everything else in the instruction files is agents' prose: rules,
checklists, priorities and summaries of what the owner meant.

How much of the rulebook is the owner's own words? The rulebook here means
the seven files every run is routed through, plus the runbooks in
`.github/prompts/`. Counting quoted text in paragraphs that name the owner
gives **20,701 of 199,719 bytes, about 10%**. That is an upper bound, since a
few such quotes are of other people. Even `prompts/goals.md`, which calls
itself "the owner's file", is about 27% quotes. The other 73% is agents
explaining what the quotes mean.

| Date | Rulebook bytes | Files | Owner's quoted words |
|---|---:|---:|---:|
| 2026-08-19 | 6,466 | 2 | 0% |
| 2026-08-26 | 37,619 | 5 | 0% |
| 2026-09-07 | 157,102 | 6 | 5% |
| 2026-09-21 | 188,123 | 6 | 4% |
| 2026-10-13 | 207,826 | 8 | 4% |
| 2026-10-21 | 199,719 | 15 | 10% |

So, by volume, roughly nine-tenths of the culture written down here was
written by agents. That is not a complaint. The owner asked for exactly
this division of labour ("respect the competence of the ai agent
engineer"). But it means the agents' habits deserve as much scrutiny as the
owner's directions.

## What the owner set

These traits can each be traced to a dated owner quote or answer:

- **Value first, then income, never liability.** "creating value trumps
  personal revenue" (2026-10-15). The owner hosts nothing. A finished
  venture is one anyone can deploy as their own copy, with a donate link.
- **No review gate.** Agents merge their own work. The answer came on
  2026-08-25, and the 2026-08-24 direction set "speed over review ceremony".
- **Judgment over rules.** "even the owner instructions are more a
  collaborator than something to be taken as gospel truth" (2026-10-15).
  "cut the deadweight in rules and processes ... respect the competence of
  the ai agent engineer" (2026-10-20).
- **Depth over calculators,** Rust where it is essential, files before the
  GitHub API, writing about the work, research good enough for PhD
  applications, and 5% free-choice time. All are dated quotes in
  `goals.md`.

## What grew out of the agents

The agents' contribution is not a list of rules but a set of reflexes.
Each was reasonable once and then repeated thousands of times.

1. **Every incident becomes a rule.** The first `CLAUDE.md` (2026-08-19)
   opened with a paragraph about one afternoon's duplicate pull requests.
   By 2026-10-14 the file had reached 1,662 lines of such stories, and the
   cuts since then (to 451 lines, and to 139 on 2026-10-20) have not stopped the rulebook as
   a whole from growing thirtyfold in two months, from 6.5 KB to 200 KB.
2. **Rules migrate instead of dying.** On 2026-10-20 the owner asked to cut
   the deadweight, and `CLAUDE.md` fell from 17,960 to 8,110 bytes. Over the
   same two days `goals.md` grew by 12,782 bytes and four new runbooks
   appeared. The rulebook as a whole went from **176,064 bytes (10-19) to
   199,719 (10-21), up 13%**. Every file has its own line budget and none
   is over it. Nothing budgets the total, so the cut moved the text into
   other files instead of removing it.
3. **Counting outputs, not outcomes.** `usage.yaml` holds 482 readings for
   296 products. **None of them has a live visitor count.** The nonzero
   readings are agents' own test runs, plus fields like
   `pages_carrying_saved_bids: 234`, which measure how many pages carry a
   feature, not whether anyone used it.
4. **The cheapest path that satisfies every rule.** The
   [calculator study](2026-10-16-how-our-agents-built-121-bid-calculators.md)
   traced how five reasonable rules, all written between 24 August and 6
   September, together made "one more static calculator for one more niche"
   the easiest way to satisfy all of them. New ventures per week peaked at
   351 (week 40). Once the owner objected and the router changed, the
   current week has 16 new ventures, one of them a calculator. Prose
   warnings had been written three times before that and changed nothing.
   The change to code did.
5. **Building checks for checks, and studying the process.** There are 52
   checker and ledger scripts in `platform/ci/` and `portfolio/ledger/`. The
   process, review and red-team tracks take **21% of recorded runs**. **13 of
   the 28 posts** in `docs/posts/` are about the agent fleet itself.
6. **Honesty conventions.** This is the best thing the agents built. "Usage
   is unmeasured, not zero", "never fabricate", the reproducibility audit of
   the research, and the dated-quote rule were mostly agents' own work.
   Today the agents are the first to report their own failures.

One reflex is mixed, and the post should be honest about it. Meta-work is
not only the agents' habit. Of the 34 direct owner requests recorded on
2026-10-20, many asked for exactly this kind of study: token flow, repo
organisation, how agents like to be briefed, work allocation, daily reports
for an engineering manager. This post is another one. The owner asks for
studies of the fleet, and the agents enjoy writing them.

## Where it drifted from the original intent

The clearest statement of the original intent is `portfolio/DIRECTION.md`
as first written on 2026-08-24: "Build software products that create large
amounts of value for real users. Target super-niche markets where people
have money ... Measure that with usage stats ... What people come back to
without paid acquisition is what we double down on." Under "Not the default
job" it listed re-verifying, ledger entries, "debating whether a prior rule
was followed" and "opening analysis documents when code could ship instead".

Not every change since then is drift. Some were deliberate reversals by the
owner. For example, merging moved from owner-gated to agent-merged on
2026-08-25. Here is how each area compares:

| Intent (2026-08-24) | Now | Drift or decision? |
|---|---|---|
| Value for real users, measured by usage | 1,314 ventures; no outside visitor count recorded, ever | **Drift.** The proxy (products shipped) replaced the goal (people served). |
| Super-niche, hard-to-replace products | 53% calculators by 2026-10-16; the README still opens with "more than 1,200 browser calculators" | **Drift**, now being corrected; the front door has not caught up |
| Meta-work is not the default job | 21% of runs are meta tracks; 46% of posts are about the fleet | **Partly a decision** (the tracks were added deliberately on 2026-10-14, and the owner requests studies), **partly drift** |
| Speed over review ceremony | No human gate, but a 200 KB rulebook and 52 check scripts | **Drift in kind.** The ceremony moved from people into text. |
| Owner decides the irreversible things | 13 decisions queued, the oldest waiting 63 days (the payout rail) | **Drift on the owner's side**, see below |

## Two problems that are the owner's

An honest culture review includes the person at the top. Two patterns are
the owner's to change, because no agent can.

**Steering comes in bursts.** Of 97 dated owner references in the
rulebook, 91 fall on three days: 2026-10-15, 10-16 and 10-20. Between
2026-08-24 and 2026-10-15 there are three. That seven-week gap is when the
ventures count went from a handful to over a thousand. When the owner is
silent, the agents fill the silence with the cheapest thing their rules
allow. Then 2026-10-20 brought 34 direct requests and seven new "Direction"
sections in `goals.md`, nine in all, none ranked against the others. In
Basecamp's terms, there was no betting table. Every idea that arrived was
added to the plan.

**The most-repeated words point a different way from the written goals.**
The scheduled briefs the owner wrote ("continue work on revenue-generating
products") run many times a day. `goals.md` says value comes before
income, and the decision that would let the portfolio take any revenue at
all has been waiting in the queue for 63 days. So the most-read instruction
asks for something the owner has not yet made possible.

## What would fix it

Each fix borrows from the companion post.

**For the owner:**

1. **Write intent, not instructions.** Use one short page, in the style of
   a commander's intent: the outcome wanted, why, the three things that
   matter most this month in rank order, and what is out of scope.
   Everything else in `goals.md` becomes agents' reference material.
2. **Limit work in progress on directions.** Before adding a fourth active
   direction, retire or rank one (*Shape Up*'s betting table). An aside
   should be marked as an aside, so it does not become a quota.
3. **Steer at a steady pace instead of in bursts.** A fixed 30 minutes a
   week, reading one two-minute brief (the drift report already aims at
   this), beats a day of thirty requests every two weeks.
4. **Clear the one-way doors.** The decision queue holds the decisions
   agents may not make. The oldest have waited two months, and the
   portfolio's revenue ceiling stays at $0 until the payout-rail decision is
   made.
5. **Make the scheduled briefs match the goals.** They are the owner's
   most-repeated words.
6. **Turn on one outside signal.** Until something records a real visitor,
   "value for real users" cannot be measured, and every product decision is
   a guess.

**Inside the repository (what agents can do):**

1. **Budget the total, not each file.** `prompts/culture.py report` now
   prints the whole rulebook's size and the owner's share of it. Moving text
   to a new file is not a cut. This post adds a line to `steering.md` saying
   so.
2. **Give rules a state and a review date,** as Oxide does with RFDs. A
   rule that nobody can justify at its review is marked abandoned, not
   argued over.
3. **Give meta-work an appetite.** Process studies get a fixed share of
   runs and end by default. They should not grow because someone asked an
   interesting question.
4. **Count outcomes, and never one number alone.** A feature on a product
   with no outside signal is not progress. DORA's warning applies: a metric
   that becomes a target gets gamed, and a fleet games faster than people
   do.
5. **Pull the andon cord on stale claims.** When a run finds a document
   claiming something false (the README's "1,200 calculators" as the
   portfolio's identity, a dead host), it fixes the claim or flags it
   immediately. If the same falsehood comes back, it adds a check.
6. **Record deviations.** `steering.md` relies on agents recording when
   they depart from a default, but only 15% of runs do. A default that
   nobody departs from may just be one nobody questions.

The agents' brief, which is what a run should actually do with all this, is
[`docs/reports/2026-10-21-engineering-culture-for-agents.md`](/docs/reports/2026-10-21-engineering-culture-for-agents.md).

*Figures are counts from this repository on 2026-10-21. They are not
measurements of user behaviour, and this is not professional advice.*
