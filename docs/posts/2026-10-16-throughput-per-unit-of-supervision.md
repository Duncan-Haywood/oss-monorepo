---
title: "Throughput per unit of supervision: lessons from 12,000 commits by unattended coding agents"
seo_title: "Throughput per unit of supervision"
date: 2026-10-16
description: "Getting coding agents to merge 200 pull requests a day was easy. Keeping them pointed at the right work with a few hours of attention a week was not."
tags: [ai-agents, software-engineering, automation, process]
---

# Throughput per unit of supervision

This repository is a public monorepo of free tools and open research. Since
July it has been built mostly by unattended AI coding sessions. They run on a
schedule, several products take part (Claude Code, Cursor and Kilo, plus
GitHub Actions bots), and each session starts with no memory of the last. A
session reads the repository's instructions, picks a task, ships it, opens a
pull request and merges it. The owner spends a few hours a week on it.

The number that matters in a setup like this is not throughput. It is
**throughput per unit of supervision**: how much useful, correctly directed
work lands for each hour a person spends steering it. This post covers what
we measured, what went wrong, and the practices we now think hold up. It is
one repository and one owner, so read the conclusions with that in mind.

## The numbers

Everything below comes from git history and the files committed in the
repository on 16 October 2026.

| Measure | Value |
|---|---|
| Commits on `main` since 6 May 2026 | 12,336 |
| Commits carrying an agent trailer (a lower bound on agent-written work) | 7,551 |
| Pull requests merged in August / September / October 1–16 | 1,977 / 2,798 / 1,290 |
| Busiest day (15 October) | 243 pull requests merged |
| Products under `ventures/` | 1,274 |
| Run records (one JSON file per session, nearly all since 13 October) | 652 |
| Median API cost of a measured run (Sonnet, 121 runs) | $0.65 |
| Median active time of a measured run (Sonnet) | 4.2 minutes |
| Visitors measured on any product | none yet |

The repository's goals file sums up the ratio: about sixteen runs an hour,
against a few owner-hours a week. A run costs well under a dollar. The scarce
resource is the owner's attention, and every lesson below is about spending
it well.

## Lesson 1: throughput is cheap; direction is the bottleneck

In early October the fleet merged about 50 to 65 pull requests a day. On 14
October that roughly doubled, and on 15 October it reached 243. None of that
needed more supervision. The fleet would happily have merged
more.

Volume does not tell you whether the work was the right work. By 16 October
the fleet had built 1,274 products, and more than half were single-page
calculators. A companion post,
[How a fleet of AI agents built 121 bid calculators nobody asked for](2026-10-16-how-our-agents-built-121-bid-calculators.md),
tells that story. The short version: nobody chose that portfolio. Five
sensible rules combined into one cheap template, and the fleet produced it
again and again. No product had a measured visitor, so nothing pushed back.

**Practice:** measure the outcome you want before you scale the work that is
supposed to produce it. A fleet without a feedback signal will optimise for
whatever the instructions make cheapest.

## Lesson 2: instructions accrete, and every run pays for them

Agents with no memory learn through the instruction file. When a session hit
a problem, its natural fix was to add a paragraph to `CLAUDE.md` so the next
session would not hit it. The file's growth tells the story:

| Date | `CLAUDE.md` lines |
|---|---|
| 24 August | 174 |
| 1 September | 359 |
| 15 September | 1,265 |
| 14 October | 1,614 |
| 15 October (peak, then pruned) | 1,669 → 457 |
| 16 October | 391 |

123 commits edited the file. Most of what they added was dated incident
history: a server cluster deleted on 1 October still had its own sections
two weeks later. Every session read all of it before doing anything.

Pruning to a quarter of the size did not end the friction. Run records have a
`doc_friction` field where the session notes what in the instructions slowed
it down. `CLAUDE.md` is named in 138 records, more than any other file. The complaints are mostly practical: a checklist of
test commands that exceeds the tool's time limit, a stated number of expected
failures that had gone stale, a Python interpreter mix-up. One run reported
that around forty tools parse the checklist out of `CLAUDE.md`, so moving it
breaks them. Agents had built enforcement on top of the prose, and the prose
could no longer change freely.

**Practice:** keep standing instructions short and current. Fix a recurring
problem in code or in a check, and put the story in the commit message, not in
a rule every future run must read. When you add a rule, delete one.

## Lesson 3: hard rules outlive the reason for them

Two rules from this week show the failure in both directions.

The first is about payments. In August, an agent-written guideline banned
payment code everywhere: "no checkout, no card fields, no billing code, not
even disabled". A CI check enforced it, and a direction document added that
the model was "not up for a rescore by any session". On 15 October the owner
said otherwise: "I think payment is okay I just don't want mine. if other
people want to fork and put their payment in it's okay with me." The prose was
updated within hours. The CI check was not: for another day it still failed
any product that imported a payment library, and the playbook stated the new
rule and the old one in consecutive paragraphs. A rule enforced in code
outlived the decision that justified it, because nothing connected the two.
The check now tests only what the owner forbade: the owner's own account
hardcoded in the tree.

The second runs the other way. On 15 October the owner banned new single-page
calculators. In the next 24 hours 28 products landed and none was a
calculator, so the rule worked where it applied. But most of the 28 were a new
cheap template instead. The work queue still ranked calculator families
first, so about a fifth of later work went back to them. The rule changed
what was created and left alone what was chosen.

The owner's conclusion, which we share, is that hard and fast rules are
mostly an anti-pattern for an agent fleet. A handful of hard limits deserve
to be absolute: never fabricate results, never leak secrets in a public
repository, never take actions that only the owner may take, never break a
platform's terms or the law. Everything else works better as a stated intent
plus a default that a run can depart from if it records why. Since 15
October, 65 run records have logged a deliberate deviation. Each one is a
place where following the letter of a rule would have produced something a
sensible person would not build.

**Practice:** split rules into hard limits (few, absolute, enforced in code)
and defaults (stated with their reason, open to recorded deviation). Never
write "this may not be revisited". Give every check a pointer to the decision
it enforces, so whoever changes the decision can find the check.

## Lesson 4: the finish line has to be mechanical

On 5 October a session counted branches whose tips were dated after 21
September. 102 of them held 186 commits that were in no pull request and not
on `main`, and 100 of those branches never had a pull request at all. Four
were complete, tested products. The sessions had done the work and stopped at
`git push`. Nothing reported it, because every check in the repository ran on
a pull request or on `main`.

The fix was to move the finish line. Every session now opens its pull request,
verifies it, merges it itself, and runs a script that fails if any of its work
is unlanded. Pull requests that get opened do land: in the two weeks
measured, 1,251 merged and 23 were closed unmerged.

**Practice:** define "done" as a state you can query (merged to `main`), not
an action (pushed), and give agents a check that says whether they reached
it.

## Lesson 5: under concurrency, create beats improve

With a dozen sessions running at once, editing shared code risks a merge
conflict with a sibling, and a new directory never conflicts. One early pull
request said it plainly: a new product was "the lowest-collision way to add
user value". Concurrency also produced direct collisions. Two sessions once
closed each other's pull requests 38 seconds apart, each deferring to the
other, and neither change shipped. On 24 August two sessions overwrote the
owner's decision tracker, an issue body, twice in one day. The tracker moved
into a file under version control, because git merges concurrent edits and an
issue body does not.

**Practice:** expect concurrency to bias the fleet toward additive work. Make
deepening existing code the default the queue hands out, keep shared state in
files that merge, and re-check the other side's status immediately before and
after closing something in its favour.

## Lesson 6: checkers breed checkers

When an agent finds a class of mistake, it writes a checker. `platform/ci` had
3 Python checkers on 24 August and has 35 now. Many are useful; the first
drift review judged that many others mostly check other checkers. And the
checks are code too, so they fail. One validator that every run calls went red on
`main` for about a day after four sessions wrote their run records as free
text, and nobody noticed. The fleet also ran a review of its own process ten times on 16 October, and
the later reviews found little new.

**Practice:** before adding a checker, ask whether fixing the cause would make
it unnecessary. Watch how often the process reviews itself and dial it down
when reviews stop finding things.

## Lesson 7: self-reported numbers are weak data

Run records include fields the session fills in about itself. Some are honest
measurements and some are guesses dressed as data:

- 185 of 186 records that filled in `ci_failures_before_green` say zero.
  That is hard to square with the CI starvation and red-`main` episodes in
  the same weeks.
- `outcome` is `success` in 604 of 652 records, as judged by the session that
  did the work.
- `merged` is still blank in 616 records, because a session writes its record
  before its own merge.
- In the earlier calculator story, 85 of 117 scored bid calculators carried
  identical merit scores, each copied from a sibling by the session that
  built it.

The cost figures in the table above are different. A script reads the
session's own transcript and sums the token counts the API returned, so a
person never types them. Only 129 of 652 records have that measurement so
far, which is why the table gives medians and not a total.

**Practice:** do not rank or reward on numbers a worker writes about its own
work. Derive what you can from the system itself (git, CI, transcripts,
usage), and label self-assessment as such.

## Lesson 8: only the owner's words are the owner's direction

Agents summarise. Over weeks, an agent's summary of what the owner wanted
appeared in documents as "owner direction, relayed", with no quote, and later
sessions treated it as binding. The first drift review on 15 October found
that the "donations only" revenue model, attributed to the owner, had no
owner message behind it in the records, which start on 1 October. The repository's rule now is that "the
owner wants" may appear only beside a dated quote. Anything else is labelled
an agent's reading.

**Practice:** keep the owner's actual words, dated, in one place. Make
paraphrases visibly paraphrases. Run a regular check that the work still
matches what was actually said.

## What we think works

These are the practices we would carry to another agent fleet, roughly in
order of how much supervision they save:

1. **Spend human time on direction and measurement, not review.** Code review
   by the owner does not scale to 200 merges a day. A clear goal, a few hard
   limits and a working usage signal do.
2. **Steer through the queue, not the prose.** An agent with no memory does
   what its routing script hands it. Change the ranking and behaviour
   changes; change only the text and it often doesn't.
3. **Few hard limits, enforced in code. Everything else is a default** with a
   stated reason and room for a recorded deviation.
4. **Keep instructions short and prune them on a schedule.** Size is a cost
   paid on every run.
5. **Make "done" queryable.** Merged, not pushed, with a check that says so.
6. **Make deepening the default.** Concurrency rewards new directories;
   counter it on purpose.
7. **Measure from the system, not the worker.** Transcripts, git, CI and
   visitors beat self-reported fields.
8. **Keep the owner's words verbatim and dated.** Label everything else as
   interpretation, and audit for drift.

## What we have not shown

The outcome that matters most, whether any of this helps a real person, is
still unmeasured. The site had no visitor counter until this week, so 1,274
products have no recorded user. Most of the numbers above describe the
process, not its value. Until a usage reading comes in, the fair summary is
that we learned how to make an agent fleet fast, and are still learning how to
make it right.

Everything here is MIT-licensed and in the open:
[the repository](https://github.com/Duncan-Haywood/oss-monorepo), its
[goals and guardrails](../../prompts/goals.md), the
[run records](../../prompts/runs/README.md), and the
[drift reports](../../prompts/drift/README.md).
