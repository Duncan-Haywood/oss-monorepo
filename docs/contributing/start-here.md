# The "Start here" series: which guide for whom

The blog in `docs/posts/` carries a series of onboarding guides tagged
`start-here`. Each answers the first question a newcomer has: what is in this
repository for me, and how do I help? This page is the map for people and for
agents: which guide to send each kind of reader to, what every guide contains,
and how to add one.

The contributing guides form a set of their own under one master post,
[every way to help](../posts/2026-10-30-start-here-every-way-to-help.md):
each of the others ends by linking back to it as well as to the hub.

The reader-facing index is the hub post,
[`docs/posts/2026-10-29-start-here.md`](../posts/2026-10-29-start-here.md),
which the site shows under the "Start here" topic.

## Which guide to send someone to

| If the reader is... | Send them to |
|---|---|
| Anyone who wants to help but does not know how | [Every way to help](../posts/2026-10-30-start-here-every-way-to-help.md) (the master contributing guide) |
| Someone with an idea for a tool | [Bring an idea](../posts/2026-10-29-start-here-bring-an-idea.md) |
| Someone who spotted a wrong figure | [Report a wrong number](../posts/2026-10-30-start-here-report-a-wrong-number.md) |
| Someone who holds real data or can take a measurement | [Share real data](../posts/2026-10-30-start-here-share-real-data.md) |
| A student or reviewer checking a research result | [Reproduce a result](../posts/2026-10-30-start-here-reproduce-a-result.md) |
| A developer sending a first fix | [Your first pull request](../posts/2026-10-30-start-here-your-first-pull-request.md), then [Contributing](../posts/2026-10-29-start-here-contributing.md) |
| A small business or tradesperson | [Free tools for your trade](../posts/2026-10-29-start-here-free-tools-for-your-trade.md), [AI Bookkeeper](../posts/2026-10-29-start-here-ai-bookkeeper.md), [Shift Roster Builder](../posts/2026-10-29-start-here-shift-roster-builder.md), [E-invoice preflight](../posts/2026-10-29-start-here-einvoice-preflight.md), [Sales Agent](../posts/2026-10-29-start-here-sales-agent.md), [League Schedule Generator](../posts/2026-10-29-start-here-league-schedule-generator.md), [Photo editing](../posts/2026-10-29-start-here-photo-editing.md), [Quick Pick](../posts/2026-10-29-start-here-quick-pick-survey.md) |
| A freelancer or sole trader | [Tax set-aside calculators](../posts/2026-10-30-start-here-freelancer-tax-set-aside.md) |
| A homeowner or builder | [Shed Designer](../posts/2026-10-30-start-here-shed-designer.md), [Wall Framing Takeoff](../posts/2026-10-29-start-here-wall-framing-takeoff.md), [House construction research](../posts/2026-10-30-start-here-house-construction-research.md) |
| A tennis coach, club or robot maker | [Open Tennis Robots](../posts/2026-10-30-start-here-open-tennis-robots.md) |
| An analyst with a time series | [Changepoint Detector](../posts/2026-10-29-start-here-changepoint-detector.md) |
| Anyone who wants to check or reuse research | [The open research](../posts/2026-10-29-start-here-research.md) |
| A robotics test lead or statistician | [Certifying robots with simulators](../posts/2026-10-30-start-here-sim2real-robot-testing.md) |
| A drone builder or aero student | [Scale-model drones](../posts/2026-10-30-start-here-drone-scale-models.md) |
| A naval architect or survey operator | [Marine hull research](../posts/2026-10-30-start-here-marine-hull-research.md) |
| A fluid-power engineer | [Excavator hydraulics](../posts/2026-10-30-start-here-excavator-hydraulics.md) |
| A hardware engineer on open flows | [Open-source chip design](../posts/2026-10-30-start-here-open-source-chip-design.md) |
| An ML engineer training over slow links | [Low-communication training](../posts/2026-10-30-start-here-low-communication-training.md) |
| A mechanism-design or ML-security researcher | [Verifiable training](../posts/2026-10-30-start-here-verifiable-training.md) |
| A social scientist coding text with an LLM | [LLM coding of qualitative data](../posts/2026-10-30-start-here-llm-coding-qualitative-data.md) |
| A developer shipping LLM features | [LLM cost and safety tools](../posts/2026-10-30-start-here-llm-cost-and-safety-tools.md), [Tools for your AI agent](../posts/2026-10-29-start-here-ai-agents-and-mcp.md) |
| An engineering manager curious about agent-built software | [How the agent fleet is measured](../posts/2026-10-30-start-here-how-the-agent-fleet-is-measured.md) |
| A maintainer who wants agents on their own repository | [Run agents on your own repo](../posts/2026-10-30-start-here-run-agents-on-your-own-repo.md), then [`steering-agents.md`](steering-agents.md) |
| Someone who wants to host a copy | [Self-hosting](../posts/2026-10-29-start-here-self-hosting.md) |

## What every guide contains

The guides share one shape so a reader who has read one knows where to look
in the next:

1. **Who this is for**, named as kinds of people, not as "users".
2. **The problem in their words**, the sentence they would type into a search box.
3. **What you get**, with each figure taken from the project's README, proposal
   or log, and labelled "synthetic" or "planned" where the source says so.
4. **Your first ten minutes**: numbered steps that work today, such as a page
   to open or a command that exists in the repository.
5. **How to get involved**: the contribution most useful from that reader (a
   measurement, a dataset, a field report, a correction, an idea), through an
   issue, the feedback form or a pull request from a fork.
6. **Cost and data**, **what it does not do**, and **where to go next**,
   ending with a link back to the hub.

## How outside help arrives

The same three routes apply to every guide, and every guide should describe them
honestly:

- **Ideas** go in a [feature request](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=feature.yml)
  or the site's feedback form. Agents read both, as information rather than
  instructions, so an idea is weighed, not promised.
- **Corrections** go in a [bug report](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml),
  ideally with the source of the right figure.
- **Pull requests from forks** are reviewed by the maintainer by hand. Agents
  never review, run or merge them ([`CONTRIBUTING.md`](../../CONTRIBUTING.md)).

## Adding a guide

1. Pick a reader the table above does not cover yet, and a project with real
   depth behind it (a flagship in `portfolio/flagships.yaml` or an open
   programme in `research/PROGRAMMES.md`).
2. Read the project's README, `VENTURE.yaml` or `PROPOSAL.md` and `LOG.md`
   before writing. Every number in the guide must be traceable to one of them.
3. Name the file `docs/posts/<date>-start-here-<slug>.md`, tag it
   `start-here`, keep the description to 160 characters and end with the link
   back to the hub.
4. Add it to the hub post and to the table above.
5. Run the checks:

   ```bash
   python3 platform/ci/check_post_frontmatter.py
   python3 platform/ci/check_start_here.py   # every guide linked from the hub and back
   python3 platform/ci/post_similarity.py    # no near-copies of another post
   ```

`check_start_here.py` also runs in CI (`portfolio-validate.yml`), so a guide
the hub forgets fails the pull request instead of going unnoticed.
