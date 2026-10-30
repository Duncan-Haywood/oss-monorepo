---
title: "Bring an idea, get it built: what a person gets from this repository"
seo_title: "Bring an idea, get free AI development, run it for profit"
date: 2026-10-29
tags: [start-here, contributing, ai-agents, open-source]
description: "You bring ideas; AI coding agents build them in public under the MIT licence; you, or anyone, may deploy the result and run it for profit."
---

Most open-source projects ask a newcomer for code. This one mostly asks for ideas.

The repository is built by AI coding agents. Scheduled Claude Code sessions open and merge most of its pull requests, often dozens a day, and the owner puts about $8,000 a month of agent compute into it (the owner's figure, October 2026). One person steers. What that person mostly does is type short sentences: what to build, what is wrong, what matters more. The agents do the engineering.

That arrangement has room for more people with ideas. This post is the pitch: what you put in, what you get back, and the honest limits.

## The deal in four lines

- **You bring:** an idea, a problem you know well, or a correction. A sentence is enough. Typos are fine.
- **The agents bring:** design, code, tests, a live page, documentation and a write-up, built in public in this repository.
- **The result stays open:** everything here is MIT licensed and public, and stays that way.
- **You may use it commercially:** you, or anyone, may clone it, change it, deploy it and charge for it. The MIT licence allows that.

## What you put in

Very little, by design. The owner's own asks, quoted in the [steering guide](../contributing/steering-agents.md), look like this:

- "I want to make ai accounting systems"
- "I want to make tools that can automate part of the new home construction process in the us"
- "I want to make ai sales agents this is a long term process"

Each of those sentences became a long-running project that sessions keep deepening: the [AI bookkeeper](2026-10-29-start-here-ai-bookkeeper.md), the [wall framing takeoff](2026-10-29-start-here-wall-framing-takeoff.md) and the [sales agent](2026-10-29-start-here-sales-agent.md). Nobody wrote a spec first. Sessions read the repository for context, choose an approach, build a first slice, measure it, write down what is still unproven, and pick it up again in later runs.

What makes an idea most useful:

- **A real job, described from the inside.** "Roofers price tear-offs per square, but the dumpster and the second layer are what eat the margin" is worth more than "a roofing app". You know your trade; the agents do not.
- **Where existing tools fall short.** What you pay for now, and what it gets wrong.
- **How you would know it worked.** A number it should get right, a document it should read, a step it should save.
- **Real material, if you have it and may share it.** A blank form, a supplier's published rate sheet, a sample export with private details removed. Several flagship projects are stuck at "tested on made-up data". A real input is the thing an agent cannot produce on its own.

## What you get back

**Free development.** You do not pay for the compute, the hosting or the engineering. Pages are served free on GitHub Pages, and the browser tools run on the visitor's own machine, so there is no per-user bill to pass on to you.

**A working product, not a mock-up.** The house standard ([`PRODUCT_PLAYBOOK.md`](../../PRODUCT_PLAYBOOK.md)) asks for a tool that runs, tests that pass, a disclaimer that says what it is not, and a page aimed at the people who would use it. Larger ideas get built over many sessions; the flagships above have had dozens.

**Honest records.** Every project keeps a README that says what was measured and what was not ("hand-checked only", "synthetic data", "a real export is wanted"). You can see exactly how far your idea got and what it needs next.

**The right to use it commercially.** This is the part people tend not to expect. The MIT licence ([`LICENSE`](../../LICENSE)) lets anyone use, copy, modify, merge, publish, distribute, sublicense and sell copies of the software. So if an idea you brought turns into something useful, you may:

- deploy your own copy and charge for it as a service;
- put it inside a product or website you already run;
- fork it and build a business on it;
- use it in client work.

[Running your own copy](2026-10-29-start-here-self-hosting.md) covers how.

## The honest limits

You should know these before you spend an evening writing up an idea.

**There is no promise an idea gets built, or when.** The agents treat text from people without write access to the repository as information, not instructions. That is a security rule ([`CONTRIBUTING.md`](../../CONTRIBUTING.md)): anyone on the internet can open an issue, so an issue cannot command the agents. Your idea is read and weighed. Whether it is built depends on how well it fits, how useful it looks next to everything else, and what the owner prioritises. The $8,000 a month is shared across the whole repository, more than 1,300 tools and about 1,000 research projects, not reserved for any one person's idea.

**Exclusivity is not on offer.** Whatever is built is public. A competitor can deploy the same code the same day you do. What the licence gives you is freedom, not a moat. Your edge has to come from what you add: your customers, your trade knowledge, your support, your brand.

**No warranty, and the compliance is yours.** The licence says the software comes "as is". If you charge for a tool, you answer to your customers for it. Tax, payroll, legal and health tools carry disclaimers here for a reason. If your use needs a licence, an insurance policy or a qualified professional's sign-off, getting that is your job. This post is not legal advice; read the licence, and ask a lawyer if your plan depends on it.

**Do not borrow the name.** The licence covers the code, not the right to present your service as this project or as endorsed by its owner. Run it under your own name.

**Some things need a person.** Agents here do not move money, open accounts that need a card or ID, or buy domains. Those steps stay with whoever wants them done.

## How to bring an idea

**Update, 2026-10-30:** requests now have a [form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=custom-build.yml), an ID and a public status on the [open custom development page](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/custom-development/). See [the post](2026-10-30-open-custom-development.md).

**No GitHub account:** use the [feedback form](https://duncan-haywood.github.io/oss-monorepo/feedback/). Submissions are collected daily into a file that sessions read.

**With a GitHub account:** open a [feature request](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=feature.yml). It asks two things: which tool (leave it empty for a new one) and what you would like it to do. Write about the job you are doing and who would use the result. Issues are public, so leave out names, addresses and anything private.

**If you want to steer directly:** people the owner gives write access to can open Claude Code sessions on the repository and ask in their own words, the way the owner does. Agents treat those sessions as direct requests. The [steering guide](../contributing/steering-agents.md) explains how to phrase an ask, what to ask back for, and how to read what comes back. Ask the owner if that is what you want.

**If you would rather run the whole thing yourself:** the same process works on your own repository. [`platform/business-template/`](../../platform/business-template/README.md) generates a starter repository with its own prompts, router and guardrails from one sentence, all MIT licensed. You pay for your own agent compute there.

## Before you write: check what exists

There may already be a tool close to your idea. The catalogue has more than 1,200 free browser tools grouped by trade ([free tools for your trade](2026-10-29-start-here-free-tools-for-your-trade.md)). "This one is close, but it misses X" is often the fastest idea to get built, because the work is a change rather than a new project.

## Where next

- [The Start here series](2026-10-29-start-here.md): one post per project and per kind of reader.
- [Contributing](2026-10-29-start-here-contributing.md): ideas first, then fixes, numbers and pull requests.
- [Running your own copy](2026-10-29-start-here-self-hosting.md): deploy, embed or sell what is here.
- [What the human does here, measured](2026-10-24-what-the-human-does-here-measured.md): how much of the work one person's sentences actually drive.
