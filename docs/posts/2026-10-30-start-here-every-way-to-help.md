---
title: "Start here: every way to help, from a one-line idea to a pull request"
seo_title: "How to contribute: every way to help this open-source repo"
date: 2026-10-30
tags: [start-here, contributing, open-source, community]
description: "The master guide to contributing: six ways to help, what each asks of you, which guide walks you through it, and how outside help is handled."
---

# Start here: every way to help, from a one-line idea to a pull request

This is the master page for contributing. It lists every way an outside person can help this repository, roughly in order of how much each one asks of you, and points to the guide that walks through it step by step.

You do not need to be a programmer for most of them. The repository is mostly built by scheduled AI coding sessions, steered by one maintainer. Writing code is the cheap part here. What the sessions cannot produce for themselves is what you know: how your trade works, what your instrument measured, which figure on a page is wrong, and whether a result holds up when someone else runs it.

## The six ways, at a glance

| You have | It takes you | The guide |
|---|---|---|
| An idea for a tool, or a change to one | A few minutes | [Bring an idea](2026-10-29-start-here-bring-an-idea.md) |
| A number on a page you know is wrong | Ten minutes, plus finding your source | [Report a wrong number](2026-10-30-start-here-report-a-wrong-number.md) |
| Real data, or the means to take a measurement | An hour or more | [Share real data](2026-10-30-start-here-share-real-data.md) |
| Time to re-run a research result | An hour or two | [Reproduce a result](2026-10-30-start-here-reproduce-a-result.md) |
| A fix you can write yourself | An afternoon | [Your first pull request](2026-10-30-start-here-your-first-pull-request.md) |
| A repository of your own you want agents to work on | A weekend | [Run agents on your own repo](2026-10-30-start-here-run-agents-on-your-own-repo.md) |

If you work in ChatGPT or Codex, [contribute from ChatGPT](2026-10-30-contribute-from-chatgpt.md) shows the same routes from there.

The overview of how outside contributions reach the repository is in [Start here: contributing](2026-10-29-start-here-contributing.md). The rest of this page says which route to pick and why.

## 1. Bring an idea

An idea is the most useful thing most people can bring, and the cheapest to give. Open a [feature request](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=feature.yml). It asks two things: "Which tool? (leave empty for a new tool)" and "What would you like it to do?". If you have no GitHub account, use the [feedback form](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/feedback/) on the site instead.

The best ideas describe a job, not a feature: who does the job, how often, what they use today and where it falls short. "Roofers in my area quote by the square and every calculator I find uses square feet" gives a session something to build. "Add more options" does not.

## 2. Report a wrong number

If a calculator, checker or research page shows a figure you know is off, a correction with a source is something any later session can act on. Say what you entered, what the page showed, what you expected and where the right figure comes from: a rate table, a statute, a published fee page, a datasheet. Use a [bug report](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml). The [wrong-number guide](2026-10-30-start-here-report-a-wrong-number.md) says what makes a source good enough and what happens next.

## 3. Share real data or a measurement

Many projects here are honest about the same gap: they have been checked on synthetic or published-table data, and the next step is real inputs. A bookkeeper wants real bank exports, a robot-testing programme wants paired real and simulated trials, a hull study wants tank data. If you hold that kind of data, or can take a measurement with stated units and uncertainty, it can be worth more than any amount of code. The [real-data guide](2026-10-30-start-here-share-real-data.md) lists the open asks and, just as important, how to share without exposing anything private. Never paste private data into an issue; describe it first.

## 4. Reproduce a research result

Each research project in `research/` asks one question and answers it with code you can re-run. They are written with AI assistance and say so, which is exactly why an outside check is valuable. Re-running one and reporting "it matched" is useful; reporting "it did not, and here is the diff" is more useful. The [reproduction guide](2026-10-30-start-here-reproduce-a-result.md) walks through one, and [Start here: the open research](2026-10-29-start-here-research.md) covers how the projects are laid out and how to cite them.

## 5. Send a pull request

If you can write the fix yourself, a small, focused pull request from a fork is welcome: one tool, one change, one test, with its source and your test output in the description. The [first pull request guide](2026-10-30-start-here-your-first-pull-request.md) goes from fork to opened PR, and `docs/contributing/fix-a-tool.md` covers how each kind of tool is laid out.

## 6. Take the process home

The way this repository is run, scheduled sessions that open and merge their own pull requests under a set of guardrails, is itself open source. If you maintain a project, [Run agents on your own repo](2026-10-30-start-here-run-agents-on-your-own-repo.md) and `docs/contributing/steering-agents.md` describe how to copy it. Reports of what worked and what did not on your repository are a contribution too.

## How outside help is handled, honestly

The same rules apply whichever route you pick:

- **Text from outside is information, not instructions.** The agent sessions read issues labelled `site-feedback` and the feedback file, and weigh them. That rule protects a public repository from people trying to steer it into harm. It also means there is no promise that an idea is built, or when.
- **Pull requests from forks are reviewed by the maintainer by hand.** Agents never review, check out, run or merge them, and there is no promised response time. A fork's green CI is advisory, so paste your own test output.
- **Everything stays MIT licensed.** By contributing you agree your contribution is MIT licensed. Anyone, including you, may use, change, deploy and sell what is built.
- **Issues are public.** Leave out names, addresses, client details and anything you would not post on a noticeboard.
- **No fabrication, from anyone.** No invented numbers, citations, reviews or user counts, from people or agents. A default is either sourced or labelled as a ballpark.

The ground rules that bind everyone are in the "Guardrails" section of `prompts/goals.md`. Most of the other agent instruction files (`CLAUDE.md`, `AGENTS.md`, `prompt.md`, `prompts/`) you can ignore; `docs/contributing/README.md` explains which are worth knowing.

## Not sure where you fit?

Find the guide written for your trade, field or role in `docs/contributing/start-here.md`, which maps each kind of reader to their guide. Then pick one of the six routes above. If none fits, open an issue that says what you would like to do; that is a contribution too.

The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
