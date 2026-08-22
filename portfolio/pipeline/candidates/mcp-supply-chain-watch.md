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

Scored 2026-08-18. Composite 6.875 · floor 3 (defensibility). AI leverage
lowered 7→6 on 2026-08-19 after the probe (below) showed the classification is
rule-separable, not model work; defensibility and distribution further lowered
2026-08-20 from 4/6 to 3/5 (PRs #245, #225, #229 — see the table below). AI
leverage raised back 6→7 on 2026-08-22 after a blind model pass on the same
held-out corpus roughly doubled the rules' F1 — see the amendment near the
bottom of this file. Composite: 6.75 → 6.875.
**The named mitigation is refuted by measurement with no replacement found
(PR #245): under `README.md` rule 2 this candidate cannot graduate until
either the remote-endpoint egress is granted or a durable asset other than
the archive is named and tested.**

> **Probe run 2026-08-19.** Steps 1 and 2 of the experiment below have been
> executed against public data. Neither kill condition fired: the drift base
> rate is 69% (not near zero) and the instruction-bearing share is 7.2% at a
> median of 0.00 alerts per server-month (alert fatigue does not kill it). Full
> measurement, corpus, and reproducible harness:
> [`portfolio/research/mcp-tool-drift/`](../../research/mcp-tool-drift/). Step 3
> — asking ten teams to pay — is unchanged and still needs buyer contact an
> unattended agent cannot make.

| Dimension | Score | Why |
|---|---|---|
| AI leverage | ~~7~~ ~~6~~ 7 | Scored as model work; the [step-2 measurement](../../research/mcp-tool-drift/) separated 119 cosmetic from 11 instruction-bearing changes with deterministic rules and no model, lowering it — then a 2026-08-22 blind model pass on the held-out corpus roughly doubled the rules' F1, raising it back (see amendment below) |
| Autonomous ops | 9 | Poll, diff, classify, alert. No human step in the normal path |
| Time to revenue | 7 | Security buyers move slowly, but this is a monitoring line item, not a platform decision |
| Gross margin | 9 | Polling, storage, and inference on diffs only |
| Defensibility | ~~4~~ 3 | The mechanism is reproducible in a week by anyone who decides to; the pinned history per customer accrues only for the 84.5% of servers that are remote endpoints, and the archive for the rest is public, rebuildable npm/PyPI declaration history — see the amendment above |
| Distribution | ~~6~~ 5 | Reachable through security and agent-engineering channels, but this candidate's free-registry channel shows ~92% of top-decile-discovered listings carry no price, indistinguishable from listings nobody found (PRs #225, #229) |
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

**Amendment 2026-08-22 — step 2's classifier measured out of sample, and it does
not hold. No score moved.** The step-2 write-up closed by saying its 7.2% was
in-sample "and will not hold unchanged on fresh data". A probe now exists for
this candidate — [`probes/mcp-drift-watch/`](../probes/mcp-drift-watch/), the
Pin/Diff/Classify/Archive surface plus a subscriber record — and it re-ran the
shipped rules, unmodified, over **136 description changes from 23 npm-published
servers none of which was read while those rules were being written**.

The rate held and the labels did not. Held out, the classifier flags **7.4%** of
changes against 7.2% in sample — but its **precision is 0.40** and its **recall
0.24–0.29**. The two errors run in opposite directions and nearly cancel in the
count, which is why the count looked stable. `alerting_share_pct` is the number
Finding 4 turns into alerts per server-month, so the alert-fatigue conclusion
survives; what does not survive is the assumption underneath it, that the alerts
a customer sees are the changes that matter.

The error localises to one signal. `secret_or_credential` produced **6 of the 10
alerts and 0 of the true positives** — five are one publisher writing "works
without an API key" into five descriptions, and the sixth reads "token" as a
secret where the server means units of text. It has now produced zero true
positives on two independent corpora. The dominant miss is the reverse: "prefer
`other_tool`" matches no rule, and carries half the clear false negatives.

**The rules were deliberately not fixed**, because dropping that one signal takes
precision to 1.00 with no true positive lost and that figure would be in-sample —
the exact error this pass exists to correct. A third corpus is a command away
(164 eligible packages; 60 taken, recorded rather than truncated) and the labels
are committed as data.

Bearing on the scores, neither applied at the time: this is the strongest
evidence yet that the classification is **not** rule-separable, which argues
`ai_leverage` is higher than the 6 it was lowered to on 2026-08-19 — but no
model had been run against this corpus, so that was an argument and not a
measurement. One has been run since — see the 2026-08-22 amendment below,
where the argument became a measurement and the score moved.

**Update 2026-08-19 — steps 1 and 2 done, step 3 outstanding.** Step 1 ran
retrospectively (diffing the versions npm already holds rather than waiting two
weeks): 69% of adjacent releases change the tool surface, 29% remove a tool, and
no spec revision or registry record closes the gap upstream — the cheapest kill
did not fire. Step 2's hand-labelling ran too: 78% of description changes are
cosmetic, 7.2% instruction-bearing, and the alert volume is a median of 0.00 per
server-month — the alert-fatigue kill did not fire either. It also surfaced a
finding the write-up did not anticipate: the risk is under-alerting priced
per-server, not over-alerting, which argues for **selling the archive rather
than the alert**. Step 3 (take the rate to ten teams at $29/server/month) is the
only remaining gate and is exactly the step an unattended agent cannot run. See
[`portfolio/research/mcp-tool-drift/`](../../research/mcp-tool-drift/).

**Update 2026-08-22 — a probe built, and a model finally run against the
corpus.** [`portfolio/pipeline/probes/mcp-drift-watch/`](../probes/mcp-drift-watch/)
built the candidate's own "Pin · Diff · Classify · Archive" as the smallest
working thing and re-ran the classifier out of sample, on 136 changes across 23
npm-published servers none of which were read while the rules were written.
The rate held (7.2% in sample vs 7.4% held out) but the labels did not:
precision 0.40, recall 0.24–0.29 — six of ten alerts wrong, about three of four
qualifying changes missed. `secret_or_credential` produced 6 of the 10 alerts
and 0 true positives, on two independent corpora now.

That probe's own README then took the pass this file had been deferring:
running a model, blind, over the same 136 changes and their committed hand
labels. It scored **precision 0.48–0.60, recall 0.86–0.88, F1 0.61–0.71** —
roughly double the rules' F1 — with a distinct, reproducible weakness of its
own: a quarter of its false positives came from judging text that was not
actually newly added, the exact discipline the rules classifier enforces by
construction. Full breakdown, including the four specific mislabelled items and
the one item whose "new" text is itself truncated mid-sentence, in
[`probes/mcp-drift-watch/README.md`](../probes/mcp-drift-watch/README.md#amendment-2026-08-22-a-model-was-run-over-the-corpus).

`ai_leverage` moved 6 → 7 on this measurement (composite 6.75 → 6.875, in
`candidates.yaml`) — the classification is not rule-separable after all, which
is the reversal this file's 2026-08-19 note said would need an actual model
run to earn. Nothing else moved: `defensibility` is still the floor at 3, the
mitigation is still refuted, and this still cannot graduate under
`README.md` rule 2 without either the remote-endpoint egress grant or a
durable asset other than the archive.
