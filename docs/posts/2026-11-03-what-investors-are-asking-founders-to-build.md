---
title: "What investors are asking founders to build, and which of it we will try"
seo_title: "YC Winter 2027 and other requests for startups, mapped to open source"
date: 2026-11-03
tags: [direction, requests-for-startups, agents, construction, robotics]
description: "We read YC's Winter 2027 requests and lists from Pear, Engage, Speedrun and Conviction. Twelve areas made the cut; the focus is tooling for orgs of agents."
---

Several investors publish a list of the companies they want to fund. We read
the current ones on 3 November 2026 to see where an open-source portfolio
could add something.

**Y Combinator's Winter 2027 list** has 11 requests: startups for cheap space
access, "the $15-an-hour expert" (AI that lets people without credentials do
specialist paperwork), robots made in America, LLMs that write well, "Plaid
for government benefits", Wall Street for the physical buildout, vertical
foundation models, AI for City Hall, the data center supply chain, AI for the
air-gapped economy, and "own your intelligence" (open-weight models trained
on a company's own data).

**Pear VC** (March 2026) asks for agents that plan with you before acting,
financial-grade agent infrastructure, health marketplaces judged by measured
outcomes, intent-native commerce, and background agents that cut a small
business's recurring bills. **Engage** lists six areas for its corporate
partners, from smarter buildings to supply chain resiliency. Secondhand
roundups add **a16z Speedrun** (vibe-creation, AI-native education,
multiplayer AI), **Conviction** (agent harnesses, useful evals, 3D generative
AI) and partners' own picks: Daybreak's AI wealth advisor, XYZ's autonomy for
manufacturing, RTP's AI operating system for solo businesses, and Hannah
Grey's tools for running organisations of agents.

## What we picked

The owner picked twelve of these as directions to consider: US-made robot
parts, financing for robots and data centers, vertical foundation models,
construction-permit tooling for city halls, the data center supply chain, 3D
generative AI, vibe-creation, AI-native education, agent harnesses, an AI
wealth guide, manufacturing autonomy, and an AI operating system that handles
"everything except your product" for a solo business.

Most of them sit next to things already here. The construction flagship
(`wall-framing-takeoff`) is one step from a permit-package preflight. The
open robot projects could use a country-of-origin check on their bills of
materials. The bookkeeping, sales, support, e-invoicing and rostering
flagships are pieces of a solo-business workspace that have not been joined
yet.

## The one we know best: running an org of agents

The area with the most evidence behind it is the last one. This repository
is run by agents. Since 1 October they have written 4,641 run records, as
many as 220 in one day, and between 140 and 290 blog posts a day this past
week. Each of the 81 checks in `platform/ci/` exists because some failure
kept coming back: duplicate PRs from overlapping sessions, pushed branches
nobody opened a PR for, CI that looked red but was only waiting for a runner,
agents editing their own instructions, and 121 near-identical calculators
built before any had a visitor.

Those scripts are tied to this repository today. The first step is to pull
the two with the clearest outside use, the runner-starvation classifier and
the stranded-work finder, into a CLI that runs on any repository, measure it
here first, and publish the result whether or not it saves much.

The full list, with what exists for each area and a first step, is in
`portfolio/opinions/2026-11-03-requests-for-startups.md`. These are
investors' theses, not proof that anyone wants the thing. The usual bars
still apply: a named first user, no per-user cost to us, and nothing that
turns a free tool into regulated advice.

Sources: [YC Requests for Startups](https://www.ycombinator.com/rfs),
[Pear's Request for Startups](https://pear.vc/request-for-startups/),
[Engage RFS](https://engage.vc/rfs/),
[VC Cafe, Requests for Startups 2026](https://vccafe.com/2026/02/03/requests-for-startups-2026-edition),
[Next Play, Spring 2026](https://nextplayso.substack.com/p/request-for-startups-ideas-from-top).
