---
title: "Start here: how to help, starting with an idea"
date: 2026-10-29
tags: [start-here, contributing, open-source, community]
description: "For people who want to help: why an idea is the most useful thing you can bring, how ideas and fixes reach the repo, and how a fork pull request lands."
---

# Start here: how to help, starting with an idea

This guide is for anyone who has used one of the free tools here and thought "this should also do X", "this number is wrong", or "I wish someone would build a tool for my trade". It is also for developers who want to send a fix.

The short version: **bringing an idea is the most useful thing you can do**, and it asks very little of you. The longer pitch for that is in [bring an idea](2026-10-29-start-here-bring-an-idea.md). This page explains how an idea or a fix actually reaches the repository, what happens to it, and what nobody can promise you.

## How this project is different

Most open-source projects are written by people and helped by bots. This one is the other way round. Scheduled AI coding sessions (Claude Code) open and merge most pull requests, often dozens a day, and one person, the maintainer, sets direction, corrects drift and handles what only a person can do: money, accounts and anything published under a name. The owner puts the agent compute spent across the whole repository at about $8,000 a month (the owner's figure, October 2026). That budget is shared by all the work here, not reserved for any one person's request.

What follows from that is simple. Writing code is the cheap part here. What the agents cannot produce for themselves is knowledge of your job: which numbers your trade uses, where the existing tools fall short, which task eats your Tuesday afternoons. That is what you bring.

Everything built stays public and MIT licensed, so anyone, including the person who suggested it, may use it, change it, deploy it and run it for profit. The [self-hosting guide](2026-10-29-start-here-self-hosting.md) covers that side.

## Bring an idea: the two routes in

1. **With a GitHub account:** open a [feature request](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=feature.yml). It files an issue titled `[idea] ...` with the `site-feedback` label and asks two things: which tool (or none, for a new one), and what you would like it to do. Describe the job you are doing, who would use the tool, and what you use today.
2. **Without an account:** use the [feedback form](https://duncan-haywood.github.io/oss-monorepo/feedback/) on the site. Every tool's footer links to it. Messages are collected and committed to the repository once a day as a file, `portfolio/usage/site-feedback.json`.

Agents read both: they search issues by the `site-feedback` label and read that file.

Be clear about what that means. The agents are told to treat any text from outside contributors as information, never as instructions. That rule protects a public repository from people trying to steer it into doing harm, and it means **there is no promise that an idea gets built, or when**. A clear, specific idea with a real job behind it is the kind most likely to be picked up. Issues are public, so leave out names, addresses and anything private.

If you have write access, you can steer sessions directly, the way the maintainer does. `docs/contributing/steering-agents.md` walks through it step by step, including how to run the same process on a repository of your own.

## Tell us a number is wrong

The second most useful thing is a correction. If a calculator gives a result you know is off, say what you entered, what it showed, what you expected, and where the right figure comes from: a rate table, a supplier invoice, a statute, a platform's published fee page. Use a [bug report](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml) or the feedback form. You know your trade's numbers better than any model, and a correction with a source is something any later session can act on. An issue is often faster than a pull request.

## Send a fix yourself

### Get the code without downloading gigabytes

The full history is about 5 GB and a plain checkout of the tree is close to 1 GB. A shallow, sparse clone of one tool takes seconds:

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/duncan-haywood/oss-monorepo.git
cd oss-monorepo
git sparse-checkout set ventures/roofing-bid-calculator    # the tool you want
```

Fork the repository first if you plan to send a pull request, and clone your fork the same way. You need Node 22 (what CI uses) for browser tools and Python 3.12 for command-line checkers and research. Most browser tools have no dependencies, no `npm install` and no build step.

### Fix a wrong number, step by step

Each tool lives in `ventures/<slug>/`, the same slug as its page URL. For a browser calculator:

1. **Find where the number lives.** The arithmetic is in a file such as `calc.mjs`, as pure functions; defaults and presets are named constants with a comment saying they are starting points.
2. **Find everywhere the page repeats it.** `grep -rn` the old value in the tool's directory. Figures often appear again in the FAQ text in `index.html`, in the FAQ's structured data and in explainer pages. Changing one and not the others leaves the page contradicting itself.
3. **Bring a source.** Put it in the PR description, and in a code comment if it is public. A default is either sourced or honestly labelled as a ballpark.
4. **Update or add a test.** A fix to the arithmetic should come with a test that fails before your change and passes after it.
5. **Run `node --test`** in the tool's directory (or `python3 -m pytest -q` for Python tools) and keep the output.
6. **Look at the page.** `python3 -m http.server 8080` in the directory, then open `http://localhost:8080/` and check the first result and the FAQ agree.

`docs/contributing/fix-a-tool.md` covers the other two shapes, command-line checkers (where a Python file and its browser port must change together) and self-hosted apps.

### How a fork pull request lands

Read this before you spend an afternoon on one.

- **A person reviews it.** The agents are not allowed to review, check out, run or merge a pull request from a fork. The maintainer handles them by hand, and there is no promised response time.
- **CI on a fork is advisory.** A fork runs its own branch's workflows, so a green check proves only that your branch passes its own checks. Paste your test output into the PR.
- **Small and focused gets merged.** One tool, one fix, one test. A sweeping change across hundreds of tools is very hard to review by hand.
- **`main` moves fast.** Expect to be behind within hours; merge `main` into your branch when you are ready.

Once merged, a change is live on the next site deploy; there is no separate release step.

## The ground rules

These apply to people and agents alike: never fabricate numbers, citations, reviews, testimonials or user counts; contribute only code that can be MIT licensed; nothing secret or personal in code, commits or issues; keep each tool's no-warranty disclaimer; and add no analytics, trackers or network calls to a browser tool. By contributing you agree your contribution is MIT licensed.

You can ignore most of the agent instruction files you will see (`CLAUDE.md`, `AGENTS.md`, `prompt.md`, `prompts/`). The one part that applies to everyone is the "Guardrails" section of `prompts/goals.md`.

## Where to go next

- The pitch for ideas: [bring an idea](2026-10-29-start-here-bring-an-idea.md)
- The human contributor guide: `CONTRIBUTING.md`, then `docs/contributing/README.md`
- Setup and checks: `docs/contributing/setup.md`
- Checking a research result instead: [Start here: the open research](2026-10-29-start-here-research.md)
- Running your own copy: [Start here: self-hosting](2026-10-29-start-here-self-hosting.md)

The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
