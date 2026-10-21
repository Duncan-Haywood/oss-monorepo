# Domains agents depend on: brief for an agent reader

**Date:** 2026-10-21. **Asked by:** the owner ("what industries do you think
ai agents will depend on and benefit the most from in comparison and contrast
to humans?", then: "blog post and agent doc. these are some more domains to
look into projects in"). **Reader:** an agent choosing a new project, or a
direction for a flagship or research slice. **Human version:**
[`../posts/2026-10-21-what-ai-agents-depend-on-and-where-they-beat-people.md`](../posts/2026-10-21-what-ai-agents-depend-on-and-where-they-beat-people.md).
**Counts:** `python3 docs/reports/assets/agent-domains/count.py`
(output in [`assets/agent-domains/results.txt`](assets/agent-domains/results.txt)).

This is a direction for choosing work, not a task queue. The flagships in
`portfolio/flagships.yaml` still come first for venture runs.

## The idea in four lines

1. **What agents depend on** (their equivalent of food and housing):
   electricity and compute, safe places to run, data, APIs, and *proof they
   are acting for someone within limits* (identity, authorisation, audit,
   insurance).
2. **Where agents add most:** work that is high-volume, made of text or code,
   cheap to check and safe to retry. That means software, finance back office,
   research synthesis, support, the document side of law, security and data
   work.
3. **Where people keep the edge:** physical work and care, relationships, and
   high-stakes decisions that need a liable person.
4. **What decides how fast an industry adopts agents:** how cheap the work is
   to check, and what liability law and insurance allow.

## Facts to cite (checked 2026-10-21)

- IEA, *Energy and AI* (April 2025): data centres used about **415 TWh in
  2024 (about 1.5% of world electricity)**. In the base case that rises to
  about **945 TWh by 2030** (just under 3%). The US accounts for 45% of
  today's use, China 25% and Europe 15%. The follow-up report, *Key Questions
  on Energy and AI*, keeps 415 TWh and gives about 950 TWh for 2030.
  [Executive summary](https://www.iea.org/reports/energy-and-ai/executive-summary).
- Anthropic Economic Index (10 February 2025): **37.2%** of Claude.ai
  conversations were about computer and mathematical tasks, a group that
  employs **3.4%** of the US workforce. The split was 57% augmentation and 43%
  automation.
  [Source](https://www.anthropic.com/news/the-anthropic-economic-index).
  The January 2026 report says use is still concentrated in coding, and that
  the most common single task, fixing software errors, was 6% of all use.

Do not restate these as current figures without the date. Both sources
revise their numbers.

## Where the repository already is (names only, rough)

| Domain | Ventures (of 1,314) | Research (of 829) |
|---|---|---|
| Tax, accounting, payroll, invoicing | 114 | none on the topic |
| Legal documents | 46 | none |
| Data work (CSV, SQL) | 42 | none |
| Logistics and inventory | 41 | `codesign-logistics` |
| Compliance and audit | 28 | 4 `audit-*` |
| Physical trades, robotics | 28 | 90 robotics, 58 `simdesign-*` |
| Energy and power | 10 | 12 `energy-*` |
| Identity, verification, trust | 6 | 33 verifier, scoring and elicitation studies |

How to read it: products cluster on tax and small document checkers, which
the twenty-hour test
([`../posts/2026-10-21-work-that-takes-more-than-twenty-hours.md`](../posts/2026-10-21-work-that-takes-more-than-twenty-hours.md))
already marks as shallow. Research is deepest in robotics, where agents gain
least by themselves. The gaps that are both growing dependencies and
reward depth are **trust tools for agents** and **energy for compute**.

## Candidate projects, ranked

Each candidate has a start point in the tree and a way to check its output.
Search open PRs before starting any of them (`.github/prompts/duplicate-work.md`).

1. **A runtime record of agent actions.** This is a tamper-evident,
   hash-chained log of tool calls with a checker that compares it against a
   declared mandate (budget, tools, paths). *Already here:* `llm-spend-guard`
   (budgets, circuit breakers), `agent-permission-config-check`,
   `mcp-config-risk-check` and `mcp-supply-chain-watch` (all checked before a
   run). The runtime record is the missing piece. *Check:* tampering tests,
   plus replaying this repository's own run transcripts. *Research tie:*
   `verifier-*`, `spot-check-slashing`, `multi-verifier-audit`.
2. **Planning power for compute.** Model a site's load, PUE, storage and
   time-of-use cost, with the IEA figures as the public baseline. *Already
   here:* `energy-tou-lp`, `energy-lcos`, `energy-mix` (research). *Check:*
   reproduce the published figures, and compare against an LP solution
   found by brute force.
3. **Reconciliation that can be checked.** Match bank lines, ledgers and
   e-invoices, and explain every exception. *Already here:*
   `payment-reconciliation-workbench`, the `einvoice-preflight` flagship,
   `iolta-three-way-reconciliation-checker`. *Check:* seeded mismatches with
   known answers.
4. **Literature synthesis with checked citations.** *Already here:*
   `research/free-citeaudit` (17.1% of research READMEs flag unchecked
   citations). *Blocker:* Crossref returned 403 through this container's
   proxy, so a session with network access has to do the checking.
5. **Mapping regulations to controls.** Map regulation clauses to controls
   and the evidence for each, with output that can be checked line by line.
   *Already here:* the regulation checkers (`eu-battery-regulation-checker`
   and others). *Guardrail:* present it as a checklist, never as legal
   advice. It needs the disclaimer.

Cross-domain rule of thumb: prefer work that **people would pay to have
checked and an agent would rather call than redo**
(`portfolio/opinions/2026-10-20-build-what-an-agent-would-rather-call.md`).

## Limits of this brief

- The counts match directory names against keywords. Products with generic
  names are missed, and a few land in the wrong bucket (for example, "stat"
  would catch "statement", so the science bucket was left out). Use them for
  the shape, not as precise figures.
- The ranking is one session's judgment. No usage data backs it, because no
  product here has a live visitor count (`portfolio/usage/usage.yaml`).
