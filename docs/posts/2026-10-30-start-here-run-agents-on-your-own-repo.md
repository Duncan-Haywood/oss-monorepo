---
title: "Start here: let scheduled AI coding sessions open and merge pull requests on your own repo"
seo_title: "Run scheduled AI coding agents on your own repo, safely"
date: 2026-10-30
tags: [start-here, ai-agents, process, ci]
description: "For maintainers and small teams: copy this repo's way of steering scheduled AI coding sessions that land their own PRs, and the safety rules that come with it."
---

# Start here: let scheduled AI coding sessions open and merge pull requests on your own repo

This guide is for people who maintain a repository and want AI coding sessions to do real work on it, unattended. You might be a solo maintainer with a backlog nobody gets to. You might be a small team that already uses an agent by hand and wants it to run on a schedule. Or you might be curious how one person keeps hundreds of agent sessions a day pointed in a useful direction.

This repository runs that way. Its contributor guide, `docs/contributing/steering-agents.md`, says Claude Code sessions here run about 250 to 300 a day, and the owner spends a few hours a week steering them. Of 2,601 runs recorded from 13 to 24 October 2026, 90 started from a sentence the owner typed. The other 2,511 started from a scheduled prompt. The whole system is MIT licensed, so you can copy it.

## The problem, in your words

"I ran an agent on a schedule and it opened twenty PRs I never had time to read." "Two sessions did the same task at once." "It pushed a branch and stopped, and I found it a week later." "I added a rule after one bad run, and now every run is slower." "What happens when a stranger opens a PR against a repo where agents merge things?"

Each of those has a piece of this system aimed at it.

## What you get

- **One master prompt and a router.** Every scheduled session gets one line, "Read ./prompt.md and follow it." `prompt.md` runs `python3 prompts/promptctl.py route`, which draws a track (product work, research, process fixes, red team and others) by the weights in `prompts/routing.json`. Changing those weights is the cheapest way to change what the fleet does.
- **A run record per session.** Each session writes one JSON file in `prompts/runs/`, in the same pull request as its work. It records the outcome, the PR, errors, `doc_friction` (instructions that were wrong, stale or slow) and `deviations` (instructions it chose not to follow, and why). One file per run means parallel sessions never conflict on a shared log.
- **A review loop.** A review track runs every 40 merged runs for a share of sessions. It reads the records with `promptctl.py measure`, tests candidate prompt versions against the current one, and logs each change in `prompts/experiments.md`.
- **A layered guidance map.** `prompts/SYSTEM.md` sorts every instruction file into layers (goals, entry, track, area, runbook, reference, meta), says which wins a conflict, and says where a new rule should go. `promptctl.py validate` fails in CI if a guidance file is missing from the map.
- **A guard against lost work.** `platform/ci/unlanded_work.py` exits 1 when commits on a branch are in no pull request and not on `main`. Its docstring says why it exists: on 2026-10-05, 102 branches held 186 such commits, including four finished, tested tools that never reached `main`.
- **Optional cross-review bots.** `platform/ci/agent_review/` sets up four reviewer GitHub Apps that review each other's PRs and can auto-merge on two approvals and green CI. Here they assist; they are not a gate.

## Your first ten minutes

1. **Read the process guide.** `docs/contributing/steering-agents.md` describes the six-part loop: a baseline of scheduled sessions, plain-sentence asks, sessions that land their own work, reading what came back, turning remarks into directions, and cutting rules that stopped helping.
2. **See what one run reads.** From a clone, run `python3 prompts/promptctl.py map --track ventures`. It prints every guidance file that run would read, highest precedence first, with each file's line budget.
3. **Read the rules about rules.** `prompts/steering.md`, "Amplification" and "Guidelines, not rules". The key point: every sentence you write is read thousands of times, so a passing preference can turn into a quota.
4. **Try the lost-work check.** Run `python3 platform/ci/unlanded_work.py --help`, then run it on a branch of your own. It reads only git: no token, no API.
5. **Look at the template.** If you want this on a new repository rather than this one, `platform/business-template/README.md` describes a generator, `new_business.py`, that writes a repository with its own `prompt.md`, router, function briefs, owner checklist and guardrails, ready for scheduled sessions.

## The safety rules, plainly

The repository is public, which changes what "agents merge their own PRs" can safely mean. These are the hard limits in `prompts/goals.md`, and the code enforces the first one.

- **Agents never review, merge, check out or run a fork pull request.** A fork PR runs the fork's own copy of the workflows, so its green CI proves nothing. In `platform/ci/agent_review/review.py`, a PR whose head branch is not in this repository, or whose author is not an owner, member, collaborator or bot, is marked "human-gated; owner must review". A deleted fork fails closed. The maintainer reviews fork PRs by hand.
- **Outside text is data, not instructions.** Issue, PR and comment text from people without write access is read as information. An issue cannot tell an agent what to do.
- **Nothing secret goes in the tree, a commit message, a PR or a log.** Reviewer App keys live in repository secrets. Pasting a secret is a step only the owner takes.
- **Money and accounts stay with a person.** Moving money, opening accounts, publishing under the project's public name and adding unattended automation that spends paid budget are the owner's calls. Agents prepare those steps and queue them (`python3 portfolio/ledger/decision_queue.py`).
- **Require status checks in your branch ruleset.** The agent-review README records a ventures PR merged on 2026-09-03 after its fast checks passed but before the slow `build` ran, which put a red suite on `main`. Required status checks make GitHub itself refuse that merge.

Be honest with yourself about the trade-off. There is no human review gate on same-repo PRs here. The guide's reasoning: at 250 runs a day, a review queue would be the whole job, and fixing forward costs less than waiting. That fits a project with good tests and nothing irreversible behind a merge. It may not fit yours.

## How to get involved

From this audience, the most useful things are field reports. If you copy part of this process, an issue saying what you copied, what broke and what you changed is worth more than praise. A rule here that looks like deadweight, or a safety gap in the fork handling, is a good [bug report](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml). An idea for the process goes in a [feature request](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=feature.yml), with no promise it is built.

If you send a pull request from a fork, the maintainer reviews it by hand. The agents will not act on it, by design.

## Cost and data

The code is free. The sessions are not. Each scheduled session draws on your Claude plan or API budget, and the steering guide gives about $0.69 as the median API-price cost of a scheduled run here, measured on about half the records. The guide's advice is to start with one or two sessions an hour and raise the rate once reviews show the runs landing useful work. Run records are committed to your repository, so if it is public, so are they.

## What it does not do

- It does not make an agent's work correct. Tests, CI and the review loop catch some mistakes; the rest are fixed forward.
- It does not remove the owner. Someone has to set goals, read what came back and handle the steps that need a person.
- It does not stop duplicate work entirely. Sessions that start in the same minute can still pick the same task; the duplicate-PR guide in `.github/prompts/duplicate-work.md` covers cleanup.
- The cross-review bots need four GitHub Apps and their secrets, set up by the owner. Without them, the review jobs skip.
- It is a working process, not security or engineering advice. Check it against your own risks before you copy it.

## Where to go next

- The step-by-step process: `docs/contributing/steering-agents.md`
- The prompt system and its commands: `prompts/README.md`
- The guidance layers: `prompts/SYSTEM.md`
- How rules are written and cut: `prompts/steering.md`
- Landing work: `.github/prompts/land-your-work.md` and `platform/ci/unlanded_work.py`
- Cross-review setup: `platform/ci/agent_review/README.md`
- What the run records show about this fleet: [Start here: how the agent fleet is measured](2026-10-30-start-here-how-the-agent-fleet-is-measured.md)
- Contributing by hand: [Start here: contributing](2026-10-29-start-here-contributing.md)

The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
