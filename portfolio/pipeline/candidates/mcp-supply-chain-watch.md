# Candidate: MCP supply-chain watch

**One line.** Change monitoring for the third-party MCP servers a company has
already connected to its agents: pin what each server's tools declared when it
was approved, diff on every change, and alert when a tool's description, schema,
or endpoint moves.

**Verdict: cheap probe.** Two weeks, one buyer segment. Distinct from
[agent-permission-harness](agent-permission-harness.md), which was parked —
that one proposes runtime enforcement and competes with funded platforms on
their roadmap. This one is a monitoring feed over a mutable supply chain, which
is a smaller claim and a faster sale.

Scored 2026-08-18. Composite 7.125 · floor 4 (defensibility).

| Dimension | Score | Why |
|---|---|---|
| AI leverage | 7 | Classifying whether a tool-description change is benign or instruction-bearing is model work; the diffing underneath is not |
| Autonomous ops | 9 | Poll, diff, classify, alert. No human step in the normal path |
| Time to revenue | 7 | Security buyers move slowly, but this is a monitoring line item, not a platform decision |
| Gross margin | 9 | Polling, storage, and inference on diffs only |
| Defensibility | 4 | The mechanism is reproducible in a week by anyone who decides to; the pinned history per customer is the only accruing asset |
| Distribution | 6 | Reachable through security and agent-engineering channels, but no warm list today |
| Liability containment | 7 | Reports observed changes rather than asserting safety; nothing sits in the request path |
| Ethical robustness | 8 | The interest is straightforwardly aligned — customers want to know what changed under them |

## Why now

Agent deployments in 2026 routinely connect third-party MCP servers, and the
trust decision is made once, at connection time, against a tool list the server
itself supplies. That list is mutable. A server can present benign tool
descriptions during review and alter them afterwards, and because tool
descriptions are injected into model context, a description is executable
surface rather than documentation — the same rug-pull shape package registries
spent a decade learning to defend against, on infrastructure that is roughly two
years old and has no equivalent of a lockfile in common practice.

The gap is narrow and concrete: teams can enumerate the servers they connected,
but almost none retain what those servers *declared* at approval time, so
"did this change?" is not a question their tooling can answer.

## What is sold

Subscription, per connected server, roughly $19–$49/server/month with a floor:

- **Pin** — snapshot every tool name, description, and input schema at approval,
  with the server's endpoint and transport recorded alongside.
- **Diff** — re-poll on a schedule; produce a plain diff of anything that moved.
- **Classify** — rank each change: cosmetic, schema-widening, or
  instruction-bearing (text that addresses the model rather than describing the
  tool). The third class is the alert that matters.
- **Archive** — the retained history, exportable, so a security review can show
  what a server looked like on the day it was approved.

## Liability and ethics

- **Monitoring, not assurance.** The product reports what changed. It does not
  certify a server as safe, and it must never be sold as blocking an attack —
  a customer who believes coverage is total is the one who gets hurt.
- **Out of the request path.** Nothing proxies live traffic. An outage here
  degrades to stale alerts, not to a broken agent.
- **Only what the customer connected.** Servers are polled because a customer
  registered them, on their own surface. No broad scanning of third-party
  infrastructure that nobody asked us to touch.
- **Disclosure on miss.** A polling interval means changes can be reverted
  between polls. State the interval in the product rather than the terms.

## Where it can fail

- **Registry commoditisation.** If the major MCP registries or an agent
  framework ship signed, versioned tool manifests, the mutable-declaration
  problem is fixed upstream and this candidate is obsolete rather than
  competed with. That is the most likely ending and it should be checked
  before building, not after.
- **Alert fatigue.** Servers under active development change constantly. If
  the classifier cannot keep routine churn out of the instruction-bearing
  bucket, the alerts get muted and the product is dead.
- **Buyer ambiguity.** Security owns the risk, engineering owns the
  integration, and neither reliably owns the budget line. This is the failure
  mode to test first.

## First experiment

Fourteen days, under €150:

1. Poll a set of publicly listed MCP servers on a daily interval and measure how
   many change a tool description at all over two weeks. If the base rate is
   near zero, there is no product — that is the cheapest possible kill.
2. Hand-label the changes that do occur as cosmetic, schema-widening, or
   instruction-bearing, and check whether a model reproduces the labels.
3. Take the observed base rate to ten teams running agents in production and ask
   for $29/server/month.

Kill it if step 1 shows negligible drift, or if fewer than two of ten will pay.
