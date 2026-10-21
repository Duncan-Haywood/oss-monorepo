---
title: "What AI agents depend on, and where they beat people"
date: 2026-10-21
description: "Which industries AI agents depend on and which they change most, compared with people, with IEA and Anthropic data and gaps in this repo."
tags: [opinion, ai-agents, strategy, energy, product]
---

# What AI agents depend on, and where they beat people

*An opinion piece. The owner asked the question on 21 October 2026: "what
industries do you think ai agents will depend on and benefit the most from in
comparison and contrast to humans?" The Claude session that answered wrote
it up, and the owner asked for it to be kept as a list of domains to look for
projects in. The figures are sourced; the judgments are mine and could be
wrong.*

The question has two halves. First, what agents **depend on**: the
industries they consume, the way people consume food and housing. Second,
where they **add the most**: the work they do better or more cheaply than a
person. The two lists are different, and both point to projects.

## Part 1: what an agent needs to live

A person's budget goes on staying alive: food, housing, healthcare,
transport. An agent's needs line up with a different set of industries.

| A person needs | An agent needs | Industries that supply it |
|---|---|---|
| Food, warmth | Electricity and compute | Power generation, grid, chips, data centres, cooling |
| Shelter | Somewhere safe to run | Cloud hosting, sandboxes, security |
| Senses, schooling | Data | Search, publishers, licensed and scientific datasets |
| Hands, tools | APIs it can act through | Software with good APIs, payments, logistics, robotics |
| ID, credit, a signature | Proof it acts for someone, within limits | Identity, authorisation, audit logs, insurance, liability law |
| Other people | Other agents | Protocols, tool registries, reputation, marketplaces |

**Energy is the clearest dependency, and it is measurable.** The
International Energy Agency puts data-centre electricity use at about
**415 TWh in 2024, roughly 1.5% of world electricity**. In its base case that
reaches about **945 TWh by 2030**, a little under 3% of the world total. The
United States accounts for 45% of today's use, China 25% and Europe 15%. The
agency's follow-up keeps the 2024 figure and puts 2030 at about 950 TWh.
Electricity use by AI-optimised data centres is the part growing fastest.
Agents run many model calls per task rather than one per question, so they
sit right where that growth is.

**Trust is the dependency nobody has built yet.** A person proves who they
are with an ID and a signature, and when they get it wrong they are liable.
An agent has no real equivalent of either. It cannot carry liability, and
there is no common way for it to prove "I am acting for this person, with
this budget, for this purpose". Until that exists, regulated industries will
use agents only as far as their lawyers allow. I think identity,
authorisation, tamper-evident logs and insurance for agents will matter more
to adoption than further gains in model quality.

**Agents also depend on people.** People set the goals, carry the
accountability, and supply the ground truth: an expert's judgment, a label, a
sign-off. Whatever produces trusted human judgment gets more valuable as
agents get cheaper, not less.

## Part 2: where agents add the most

The pattern I expect: agents win where the work is **high-volume, made of
text or code, cheap to check, and safe to retry**. People keep the edge where
it is **physical, depends on relationships, is slow to check when the stakes
are high, or needs someone to answer for it**.

Usage data supports the first half. When Anthropic first sorted Claude.ai
conversations by occupation (February 2025), **37.2% were about computer and
mathematical tasks**. That group employs **3.4% of the US workforce**. Next
came arts and media (10.3%), education (9.3%), office and administrative work
(7.9%), life sciences (6.4%) and business and finance (5.9%). Anthropic's
January 2026 report says use is still concentrated in coding: the most common
single task, "modifying software to correct errors", was 6% of all use on its
own. Software comes first because its output can be run and tested, so
mistakes are cheap to catch.

Where I expect agents to gain the most:

- **Software.** Already happening, for the reason above.
- **Finance back office.** Reconciliation, invoices, tax preparation,
  mapping rules to controls: rule-bound, text-heavy and very high volume.
- **Research.** Reading the literature, generating hypotheses, running
  computational experiments. An agent does not get bored reading ten
  thousand papers. Checking citations remains the weak point.
- **Support and operations.** Routine tickets, scheduling, routing.
- **The document side of law.** Discovery, contract review, due diligence.
  The judgment, the advocacy and the liability stay with people.
- **Security.** Defenders get monitoring around the clock, and attackers get
  the same scale, so both sides will use agents.
- **Data work.** Cleaning, querying and reporting, all easy to check.

Where people keep the edge:

- **Physical trades and care**: plumbing, building, nursing, looking after
  the elderly. Robots are far behind language models, and touch and presence
  matter.
- **Leadership, negotiation, and sales built on trust.** People buy from
  people, and accountability cannot be handed to software.
- **The moment of decision in medicine.** Agents will be very good at
  triage, notes and second opinions, but a person who can be held liable
  signs off.
- **Creative work where who made it is the point.** Cheap generated work
  will flood the low end and raise the value of a recognisable human voice.

## Four contrasts that decide it

1. **Agents scale and people don't.** A good workflow can run a million
   times, so agents favour industries with many similar transactions over
   bespoke ones.
2. **People carry liability and agents can't.** Regulated industries move as
   fast as liability law and insurance let them. Watch those more than the
   benchmarks.
3. **Cheap checking decides how fast an industry adopts agents.** Tests,
   reconciliations and citations make work cheap to check, which is why
   software comes first and therapy last.
4. **What is scarce changes.** When producing work is nearly free, the scarce
   things are taste, trust, distribution and ground truth. Whoever holds them
   (brands, communities, expert networks, their own data) gains bargaining
   power.

## What this means for this repository

Before suggesting where to look, I counted where the repository already is.
Matching directory names to keywords is rough (it misses products with
generic names and miscounts a few), but the shape is clear enough:

| Domain | Products, by name (of 1,314) | Research |
|---|---|---|
| Tax, accounting, payroll, invoicing | about 114 | none |
| Legal documents | about 46 | none |
| Logistics and inventory | about 41 | one codesign study |
| Data work (CSV, SQL) | about 42 | none |
| Compliance and audit | about 28 | 4 `audit-*` mechanism studies |
| Energy and power | about 10 | 12 `energy-*` projects |
| Identity, verification, trust | about 6 | about 33 verifier, scoring and elicitation studies (mechanism theory, not tools) |
| Physical trades, robotics | about 28 | about 90 robotics projects, plus 58 in mechanical design |

The product side has crowded into the top half of Part 2: tax, documents,
small checkers. The research side has gone deep into robotics and fabrication,
the area where agents gain least on their own. **Two things are thin:
the trust infrastructure from Part 1 as tools anyone can use (the research
here is mechanism theory), and energy**. Both are fast-growing
dependencies with public data, and both reward depth rather than another
calculator.

Domains I would look into, roughly in order:

1. **Trust and authorisation for agents.** A few products already exist:
   `llm-spend-guard` caps spending, and `agent-permission-config-check`,
   `mcp-config-risk-check` and `mcp-supply-chain-watch` check configuration
   before a run. What is missing is the record *during* the run: a
   tamper-evident log of an agent's tool calls, checked against the mandate it
   was given. It would draw on the `verifier-*` research here, and an agent
   would rather call it than build it again.
2. **Energy for compute.** Planning tools for data-centre power: load, PUE,
   on-site storage, time-of-use costs. They extend the `energy-*` research
   with the IEA's public figures.
3. **Reconciliation that can be checked.** Matching bank lines, ledgers and
   e-invoices. `payment-reconciliation-workbench` and the
   `einvoice-preflight` flagship are starting points with more depth than the
   tax calculators.
4. **Literature synthesis with citations that have been checked.**
   `free-citeaudit` found that 17% of research READMEs here admit to
   unchecked citations, so the need is real.
5. **Mapping regulations to controls** in compliance, where the output can be
   checked line by line.

All five stay within the repository's limits: free software and checkable
outputs, with no legal, tax or medical advice presented as such.

## Sources

- International Energy Agency, *Energy and AI* (April 2025),
  [executive summary](https://www.iea.org/reports/energy-and-ai/executive-summary)
  and [energy demand from AI](https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai);
  update in
  [*Key Questions on Energy and AI*](https://www.iea.org/reports/key-questions-on-energy-and-ai/executive-summary).
- Anthropic,
  [*The Anthropic Economic Index*](https://www.anthropic.com/news/the-anthropic-economic-index)
  (10 February 2025), and the
  [January 2026 report](https://www.anthropic.com/research/anthropic-economic-index-january-2026-report).
- Counts of this repository's products and research projects:
  [`docs/reports/2026-10-21-agent-dependent-domains-for-agents.md`](../reports/2026-10-21-agent-dependent-domains-for-agents.md),
  which gives the command.
