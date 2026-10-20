---
title: "Build what an agent would rather call than redo"
date: 2026-10-20
description: "As AI agents improve, light tools lose to the agent doing the job itself. What 1,304 of our own tools show about depth and distribution."
tags: [ai-agents, software-engineering, distribution, opinion]
---

# Build what an agent would rather call than redo

This repository holds about 1,300 free tools: calculators, checkers and
converters, built mostly by unattended AI coding sessions. On 20 October
the person who runs it put a doubt into words:

> as the ability of AI agents goes up, using my tool versus an AI agent just
> doing it themselves, the second becomes easier if there's not enough depth
> to justify searching and finding my tool. And a lot of this stuff is so
> light it fits in the second category.

(Lightly edited from a chat message. The original is quoted in full in the
[repository's opinion note](../../portfolio/opinions/2026-10-20-build-what-an-agent-would-rather-call.md).)

This post makes the argument, then checks it against our own catalogue.

## The argument

More and more of a tool's users are agents, or people who have one. A person
with an agent doesn't open a calculator page; they ask the agent. The agent
then has two options. It can find a tool, read how to call it, decide
whether to trust it and wire it in. Or it can write twenty lines of code and
do the job itself.

A tool only wins when the job is worth more than finding and trusting it.
That bar rises with every model generation. Each capability jump moves
another band of tools from "worth calling" to "quicker to redo". A fee
calculator that multiplies three inputs is already in that band.

What stays worth calling is what's hard to redo: solvers that prove their
answers, validators that match an official specification, simulators, media
pipelines, anything with years of edge cases and a real test suite behind
it. An agent would take days to rebuild that and would probably get it
subtly wrong, so it calls it instead.

The second half of the argument is distribution. If the deep thing is the
asset, every surface is a way in: a package on npm or PyPI, a CLI, an MCP
server for agents, a terminal UI, a web app, and documentation good enough
to be found and quoted.

## What our own catalogue shows

We audited all 1,304 tool folders with a short script
([method and caveats](../reports/2026-10-20-depth-and-distribution.md)).
Lines of code are a crude measure of depth, but they set a ceiling: a hard
problem doesn't fit in 200 lines.

- **The catalogue is light.** The median tool has 350 lines of non-test
  source code. 71% have under 500, and only 16 have 3,000 or more.
- **Distribution runs the wrong way round.** Nearly every light tool (1,264)
  can be called by an agent through the repository's shared
  [CLI and MCP server](../../platform/agents/README.md). But 10 of the 20
  largest projects can't, including a 31,000-line photo and video pipeline
  and a survey app with a Glicko-2 ranking engine. The agent surface picks up
  a tool from its web page, so the projects built as apps or Python
  pipelines are left out.
- **No tool is a published package.** None of them is set up to publish to
  npm, and the few Python `pyproject.toml` files are mostly lint
  configuration.
- **Almost no light tool has data depth.** A light tool can still be worth
  calling if it holds current, cited facts an agent would otherwise have to
  research: tax thresholds, marketplace fee schedules, filing deadlines. But
  876 of the 925 light tools don't link a single outside source in their
  code. (Some cite sources in the page text instead, which the audit doesn't
  count, so 876 is an upper bound.)

So the catalogue is built for exactly the kind of tool an agent is most
likely to redo, and that's where its distribution effort has gone.

## Notes on acting on it

**The test is "cheaper and more trustworthy to call", not "small".** A
200-line tool holding this year's fee schedule for twelve marketplaces,
with sources, passes. A 200-line tool doing arithmetic doesn't. The useful
question before building anything: would a capable agent with a shell get
the same answer, as reliably, in a few minutes?

**Hard doesn't mean Rust.** What makes something hard is the algorithm, the
specification and the systems work. Rust and WebAssembly earn their place
once there's a heavy core, like a solver's inner loop or a finite-element
solve. They don't make light work deep.

**Build one core and generate the surfaces.** Six hand-built surfaces per
project is six times the upkeep, and they drift apart. Our shared agent CLI
already shows the better pattern: one contract, with every surface generated
from it. It just needs to reach the deep projects too.

**Pick work with a bar it can miss.** Hard work should come with a public
benchmark, an official conformance suite or a proof of optimality. "Matches
the official EN 16931 validator on every example file" or "proves the optimum
on a public nurse-rostering benchmark instance" are claims a reader can check.
"Ships a solver" isn't.

**Don't swing too far.** We haven't measured usage for most of these tools,
and an unmeasured tool isn't an unused one. The light tools are also where
search traffic is meant to come in. The change is to stop adding more by
default, measure what exists, and put new effort into depth.

## What we're doing next

The [report](../reports/2026-10-20-depth-and-distribution.md) lists the
first slices, each sized for one agent session:
1. Put the deep projects in the agent catalogue.
2. Publish the e-invoice validator as a real package.
3. Make the shift-roster solver prove its answers with a linear-programming
   bound, possibly through a WebAssembly solver.
4. Rerun the audit so these numbers become a trend.

*Produced with AI assistance. Counts come from a script you can rerun; see
the report for what each one misses.*
