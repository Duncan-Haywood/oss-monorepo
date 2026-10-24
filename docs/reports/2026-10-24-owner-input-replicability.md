# Which of the owner's inputs could agents or software supply? Brief for an agent reader

**Date:** 2026-10-24. **Reader:** an agent deciding what to automate, what to
ask the owner, or how to weigh an owner sentence. **Asked by:** the owner:
"let's evaluate the type of input I do myself and how easy it would be to
replicate a lot of it with ai agent workloads ... how much is easily
replicatable and replacable versus hard to replicate and replace."
**People version:** [`docs/posts/2026-10-24-how-much-of-the-owner-could-an-agent-replace.md`](../posts/2026-10-24-how-much-of-the-owner-could-an-agent-replace.md).
**Data:** every run record in `prompts/runs/` dated up to 2026-10-24 whose
`input` is a person's words (the split from
[`human-asks/count_asks.py`](assets/human-asks/count_asks.py)), hand-labelled
in [`owner-input-replicability/labels.csv`](assets/owner-input-replicability/labels.csv)
and counted by [`tally.py`](assets/owner-input-replicability/tally.py), plus
the decision queue (`portfolio/ledger/decision_queue.py`).

## Answer

By count, the owner's typed inputs split roughly in thirds; by consequence,
the hard third carries most of the weight.

| Tier | What it means | Inputs | Share |
|---|---|---|---|
| 1 | Already software (a schedule or a check does it) | 2 | 2% |
| 2 | An agent could supply it today from the repo alone | 33 | 30% |
| 3 | Agents detect or draft it; the owner's word is what made it stick | 34 | 31% |
| 4 | Rests on the owner's own interests, values or risk appetite | 40 | 36% |
| 5 | Needs the owner's legal standing, money or account access | 1 | 1% |

110 owner inputs, 2026-10-14 to 2026-10-24 (114 direct run records before this run, minus one
duplicate and three follow-ups written by agents). Outside that table:

- **2,679 scheduled triggers** ("follow `./prompt.md`") are tier 1: already
  replaced by a schedule. That is 96% of all runs.
- **The decision queue is all tier 5:** 13 items, median wait 61 days
  (3 need a legal person, 4 a credential, 6 a repo setting or permission
  only the owner holds). Two of them decide whether the portfolio can earn
  anything.

So: about a third of what the owner types is **easy to replace**, a third is
**replaceable in detection but not in authority**, and a bit over a third is
**not replaceable**, because the input *is* the owner's preference or legal
standing. That last group starts the costliest runs and changes every later
one.

## By type

| Type | n | Tiers | Median cost of the run it started | Examples |
|---|---|---|---|---|
| Direction (a new domain or project) | 33 | all 4 | $6.28 (17 measured) | water vehicles, saints podcasts, religion research, Colorado home costs, robot vacuum |
| Question (answer it as a report or post) | 27 | all 2 | $1.78 (13) | where tokens go, better git pattern, agent docs vs posts |
| Policy (rules, authority, risk appetite) | 11 | 6 at 3, 5 at 4 | $2.54 (3) | rules become guidelines, privacy follows the law, drop static-only |
| Correction (something built is wrong) | 10 | 3 at 2, 7 at 3 | $4.11 (5) | calculator glut, day counter on the front page, blog rate fell |
| Allocation (how much effort where) | 9 | 7 at 3, 2 at 4 | $3.43 (5) | red team 5-10%, deepen flagships, research to PhD+ |
| Feature for the owner's own use | 7 | all 3 | $4.14 (6) | dev dashboard, EM daily report with audio |
| Taste (how it looks or sounds) | 7 | all 3 | $3.84 (3) | "visual wow", navigability, robotic podcast voice |
| Operational (a command) | 5 | 1 or 2 | unmeasured | force a rebuild, 24 h review |
| Admin (owner-only setting) | 1 | 5 | $2.11 (1) | switched Pages to Actions |

Costs are API-price estimates from `runcost.py`, measured on fewer than half
the records; read them as a ranking, not a bill.

## The rubric, so the next labeller can disagree in the same terms

- **Tier 2** if an agent with this repository and no owner message could have
  produced an equivalent input: questions about the repo's own process,
  checks it could run, counts it could watch.
- **Tier 3** if agents could notice or draft it but the change only happened
  because the owner said so: corrections, effort splits, look and feel, the
  owner's own dashboards. The owner is the customer or the authority here,
  not the detector.
- **Tier 4** if the content is the owner's preference: which domains to work
  in (faith, construction in Colorado, water vehicles "very cool system"),
  how much risk to accept (privacy, static-only, which rules are hard), how
  ambitious to be. An agent can propose these; it cannot know them.
- **Tier 5** if it needs a person's legal identity, money, or an account
  setting no agent holds.

## Evidence that tier 3 is about authority, not detection

1. **Calculators.** Agents warned against near-identical calculators in
   prose on 2026-09-06 and 2026-09-07 (PRs #3465, #3482, #3487 and
   `portfolio/pipeline/README.md`). About 1,060 more ventures were built
   after the warnings ([`2026-10-16-calculator-glut.md`](2026-10-16-calculator-glut.md)).
   The mix changed only after the owner's sentences on 2026-10-16, 10-20 and
   10-21. The agents saw the problem; nothing in the system let an agent's
   finding override the incentives other agents had written.
2. **Blog rate.** Posts fell from about forty a day to two to four with no
   agent flagging it; the owner noticed on 2026-10-24. The same day
   `promptctl.py measure` gained `posts_per_day`. That is a tier-2 input
   turned into software: the count now watches itself.

## What to do with this

- **Turn tier 2 into software or schedules** (the owner's 2026-10-24 rule,
  "software for the routine, agents for judgment"). The corrections that
  were counts (open branches, site staleness, posts per day) should each be
  an alarm in `promptctl.py measure` or CI, not an owner observation. Posts
  per day now is (`posts_per_day`); stale branches are deleted by
  `platform/ci/branch_cleanup.py` and the Pages route is read by
  `platform/ci/pages_state.py`. This run did not check whether either raises
  an alarm a run would see; that is the next thing to check.
- **Give tier 3 a cheap yes/no channel.** The owner's input there is a
  verdict, not an idea. A short list of agent-found corrections the owner can
  approve in seconds (the shape `decision_queue.py` uses for tier 5) would
  replace the owner having to notice. Not built; a proposal.
- **Do not try to replace tier 4.** Spend owner minutes here. When a run
  invents a direction on its own (explore track), label it as an agent
  proposal, never as the owner's.
- **Tier 5 is the bottleneck, not agent throughput.** A 61-day median wait on
  13 items is what holds back revenue and distribution.

## How sure

- One labeller, one pass, judgment calls; the CSV has a note per row so a
  reader can contest any label. Moving every borderline row one tier
  changes the thirds by a few points, not the shape.
- `input` is often the agent's paraphrase of what the owner typed (rows
  starting "Owner:"), and mid-session follow-ups are mostly not recorded, so
  this counts opening asks, not every owner sentence.
- "Could an agent supply it" was judged, not tested. A real test would run
  an agent without the owner's message and compare what it asks for.
