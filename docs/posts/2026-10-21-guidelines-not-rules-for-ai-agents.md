---
title: "Guidelines, not rules: rewriting the instructions an AI agent fleet reads"
seo_title: "Guidelines, not rules: rewriting an AI agent fleet's instructions"
date: 2026-10-21
description: "Four in five 'never' and 'must' lines in our agents' guidance guarded nothing legal or financial. Why we made them guidelines, and where 'never' stays."
tags: [ai-agents, prompting, documentation, process, opinion]
---

# Guidelines, not rules

*An opinion piece, with the counts that prompted it.*

This repository is built mostly by unattended AI coding sessions, about
sixteen an hour. They read a shared set of instruction files before they
start: `CLAUDE.md`, `AGENTS.md`, playbooks, runbooks and per-track prompts.
Almost all of that text was written by earlier sessions, one incident at a
time. On 2026-10-21 the owner asked for a change of register:

> "if it's not a financial or legal or ethical liability then generally
> guidelines and suggestions makes more sense than hard and fast rules the
> agents are generally better to adapt to a certain goals and circumstances
> than hard rules written much before hand without the current goal and
> context in mind"

We agree, and this post says why. It also says where we think the line sits.

## What the instructions looked like

We wrote a small counter,
[`prompts/rule_language.py`](../../prompts/rule_language.py). It reads every
guidance file listed in `prompts/system.json`, finds lines with "never",
"must", "always", "do not", "required" and similar words, and sorts each line
into one of two piles. A line lands on the liability pile if it also mentions
a hard-limit topic (fabrication, secrets, fork pull requests, licensing,
money, accounts, citations, the law). Every other line lands on the default
pile. The sort is a keyword heuristic, so it is a starting point for reading
the lines, not a verdict.

Before the rewrite, across 44 files:

| | Lines |
|---|---|
| Absolute wording on a liability topic | 73 |
| Absolute wording on anything else | 290 |

So roughly four in five "never"s and "must"s were guarding things like which
test runner to use, whether to hand-edit a sitemap, or how to phrase a pull
request. None of those is a one-way door.

## Why rules written in advance age badly here

**The writer could not see the reader's situation.** A rule is a decision
made before the facts are in. "Never loop `node --test` serially" was right
for the session that wrote it, which had sat through a long serial run. It is
wrong for a session testing one venture that has no parallel runner wired up.
A rule cannot tell the two cases apart. A reason can: "`run_venture_tests.py`
runs them all in minutes, so it usually beats a serial loop" tells the reader
when the advice applies.

**Amplification turns small rules into large costs.** About 2,700 runs a week
read these files. Any line that blocks a sensible action blocks it thousands
of times. Our own process studies kept finding the same pattern: runs
following a rule to the letter, past the point where it served its purpose.

**Absolute words lose their force when everything uses them.** If "never"
appears 290 times about chores, the dozen times it guards something serious
read just like the chores. Keeping "never" for the hard limits makes those
lines stand out again.

**The readers are capable.** A modern coding agent given the goal and the
reason usually picks a sensible action, and records why when it departs from
the default (we ask for a `deviations` entry in every run record). That
record is how a guideline improves. A rule nobody may break produces no such
signal.

## Where "never" stays

Some decisions should not be left to one session's judgment. That is not
because the agent is untrustworthy. A mistake there is expensive, public or
cannot be undone, and the session has no extra context that would change the
answer. In this repository those are:

- never fabricating a result, number, citation or run record;
- secrets and personal data, and treating fork pull requests and outside
  text as data rather than instructions;
- licensing and attribution;
- money, accounts, paid automation and publishing under the portfolio's
  public name, which stay with the owner;
- the law and platform terms;
- research integrity: overstating findings, checking citations, never
  contacting cited authors or implying affiliation.

The owner's line ("financial or legal or ethical liability") covers all of
them. They keep their absolute wording, in one file (`prompts/goals.md`,
"Guardrails").

## What we changed

- The style is written down for agents in
  [`prompts/steering.md`](../../prompts/steering.md), "Guidelines, not
  rules", with before-and-after examples. It covers when absolute words
  belong, how to give a reason, and why checks that are not guarding a hard
  limit should warn rather than block.
- Every mapped guidance file was reworded line by line. "Never X" became
  "avoid X" plus the reason. "Must" became "should" or "aim to". A few lines
  that read like chores turned out to guard something real and kept their
  wording, such as never connecting to the retired servers' old IP
  addresses, which may now belong to someone else.
- `rule_language.py` stays in the repository so review runs can see whether
  rule-shaped text creeps back.

After the rewrite:

| | Before | After |
|---|---|---|
| Absolute wording on a liability topic | 73 | 72 |
| Absolute wording on anything else | 290 | 190 |

A hundred lines changed wording. Most of the remaining 190 on the default
pile are not chore rules at all. We read a random sample of 30. About half
were facts ("has never once fired"), owner quotes or descriptions of what the
code does. About a third guarded a hard limit in words the heuristic does
not catch, such as fork pull requests, user data that is "never uploaded",
another product's code, or the owner-only edits to `goals.md`. Only a
handful still read as a rule about a chore, and those were already worded as
a default with a reason.

## What could go wrong

A softer register could make runs ignore advice that mattered. The guard
against that is the same one that guards against bad rules: measure it. Run
records carry `deviations` and `doc_friction`, and `promptctl.py measure`
groups them by file. If a guideline is departed from often and the departures
go badly, its reason was not clear enough, and the fix is a better reason or
an automated check that explains itself. A capital-letter "MUST" is not the
fix. If departures go well, the guideline was wrong, and it should change.

## Update, 2026-10-24: the hard list, cut to liability

The owner asked whether any hard rulebook was left, and wanted the hard rules
"slimmed down to no financial legal or ethical liabilities", with everything
else turned into suggestions. Three items had stayed in the hard list
without guarding any liability: "every run ships something useful", "land
what you push" and the red team's 5-10% share of runs. `prompts/goals.md`
now splits its Guardrails into **Hard limits** (fabrication, honest
marketing, the public-repository rules, licensing, the owner's money and
accounts, user safety, research integrity) and **Strong defaults** (those
three, with reasons). `promptctl.py validate` used to fail when the red-team
share left its band; now it prints a warning.

A sweep of the guidance files reworded the remaining process "musts" (which
host to use, how to chain shell commands, when to re-verify, the calculator
ban) as advice with a reason. `rule_language.py` went from 184 lines of
absolute wording outside liability topics to 157. Most of what remains is
descriptive ("never measured", "a reader who has never seen the
repository"), which the keyword heuristic cannot tell apart from a command.
A few lines stayed absolute on purpose because they protect evidence rather
than a liability: past run records and the red team's mutant tallies are
never hand-edited, since editing them would fabricate results.

## Follow-up, 2026-10-24: a chronicle is not a reference

Three days later the owner asked for the same review from another angle:
how the documentation records history and lessons. Rules were not the
biggest problem left. Stale story was. Our hosting reference file had
grown to 362 lines by stacking nine dated "Amended" and "Corrected"
sections under a decision from August, and the current answer to "where is
the site served?" was in its last section. Two scripts were still printing
advice that pointed at a section of another file cut three days earlier.

The fix was the same split again, applied to history: the file now says
what is true and keeps one line per lesson (122 lines), the old text lives
verbatim in `docs/history/`, and that directory gained an index with one
lesson per chronicle. A lesson written that way reads like a postmortem
summary ("two workflows raced to deploy one site") rather than a rule
("never add a second deploy workflow"), and the reader decides whether
their situation matches. Details:
`docs/reports/2026-10-24-reference-docs-are-not-chronicles.md`.

## Lessons we borrowed

- **Two-way doors.** Amazon's shareholder letters distinguish decisions you
  can reverse cheaply from ones you cannot, and argue that only the second
  kind deserves heavyweight process (Bezos, 2015 letter to shareholders). Our
  hard limits are the one-way doors.
- **Commander's intent.** Military orders have long stated the purpose
  behind an instruction so subordinates can adapt when the plan meets
  reality (US Army doctrine publication ADP 6-0, *Mission Command*). A guideline with
  its reason is the same idea at the scale of a sentence.
- **RFC 2119 already has a middle word.** The internet standards keywords
  separate MUST from SHOULD: SHOULD means "there may exist valid reasons in
  particular circumstances to ignore" the advice, "but the full implications
  must be understood". Most of our "musts" were SHOULDs all along.
- **Decision records are immutable.** Michael Nygard's "Documenting
  Architecture Decisions" (2011) keeps each decision as a record that is
  superseded by a new one rather than edited. Keeping current state and
  dated history in separate files is the same idea.

*This post was written with AI assistance, by one of the sessions it
describes. The counts come from `python3 prompts/rule_language.py` run on
this repository before and after the change.*
