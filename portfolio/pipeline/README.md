# Candidate pipeline

Businesses that have been researched and scored but are **not** ventures yet.

`ventures/` is for things being built. This directory is the stage before that:
written-up candidates with an explicit verdict, so that starting a new venture
is a decision someone makes against evidence rather than an idea that arrived on
a good afternoon.

Nothing here is committed to. A candidate graduates by someone writing
`ventures/<name>/VENTURE.yaml`; until that file exists the router cannot see it
and no agent budget flows to it.

## Why this is separate from `ventures/ai-first-markets`

That venture is a **product**: a market map and scored idea library for solo
founders, and its ideas are chosen to be useful to that audience. This directory
is the portfolio's **own intake**, and it is scored on two dimensions that
product does not use — liability containment and ethical robustness — because
this portfolio has to actually live with what it starts.

Overlap is checked in both directions. A candidate that duplicates one of the
eight ideas in `ventures/ai-first-markets/src/data/ideas.ts`, or an existing
venture, is screened out and recorded in [screened-out.md](screened-out.md).

## Scoring

Eight dimensions, 0–10. The first six are the same dimensions
`ai-first-markets` uses, so scores are comparable across both:

| Dimension | 10 means |
|---|---|
| AI leverage | The work is mostly model work; a human adds little per unit |
| Autonomous ops | Runs unattended; no queue that only a person can drain |
| Time to revenue | First paid customer plausible inside a month |
| Gross margin | Cost of delivery is inference and hosting, nothing else |
| Defensibility | A copy of the product does not take the customers |
| Distribution | A reachable channel exists today, without paid acquisition |
| Liability containment | Being wrong costs a refund, not a lawsuit |
| Ethical robustness | The business gets better for customers as it scales, not worse |

Three rules make the composite mean less misleading than it would be alone:

1. **Ethics and liability are gates, not weights.** A candidate scoring below 5
   on either is rejected regardless of composite. Averaging lets a high margin
   buy off a legal exposure; that trade is not available here.
2. **Any dimension at 4 or below needs a named mitigation** before graduation.
   Distribution and time-to-revenue are where good candidates usually die, and a
   strong composite hides exactly that.
3. **A candidate that fits an existing venture is a product line first.** New
   ventures cost a distribution channel from scratch. If the buyer is already a
   buyer of something in `ventures/`, test it there before opening a directory.

## Standing constraints these candidates were selected against

From the portfolio's brief: AI-heavy or software, no employees (contractors
managed by agents are acceptable), low capital, low liability, and revenue that
survives its own ethics review.

Four consequences worth stating once, because they eliminated more candidates
than any market analysis did:

- **No advice-of-record.** Legal, tax, medical, and filing-on-behalf-of positions
  carry professional liability an unattended agent cannot hold. Candidates here
  produce evidence, drafts, and monitoring — the customer remains the filer,
  the signer, and the decision-maker. This is a positioning constraint on
  otherwise good compliance markets, not a reason to avoid them.
- **No claim of compliance.** "You are now compliant" is a warranty. "Here is
  what we tested, what we changed, what remains, and when we checked" is a
  record. Only the second is sellable without counsel.
- **Contractors do the parts that must be human**, on fixed-scope work orders,
  and the agent owns intake, scheduling, review, and payment. Manual assistive
  technology testing is the clearest example — it cannot be automated honestly,
  and pretending otherwise is what got the overlay vendors sued.
- **Data must be public or customer-supplied.** Scraped personal data and
  purchased lead lists move a business from "low liability" to "GDPR exposure
  with no legal team" in one step.

## Current candidates

Scored 2026-08-18. Composite is the mean of eight dimensions; `floor` is the
lowest single dimension, which is usually the thing that actually decides.

| # | Candidate | Composite | Floor | Verdict |
|---|---|---|---|---|
| 1 | [EAA remediation pipeline](candidates/eaa-remediation-pipeline.md) | 7.25 | 5 | Build now, as a `local-site-studio` product line |
| 2 | [CRA evidence desk](candidates/cra-evidence-desk.md) | 7.0 | 4 | Build now, narrow scope |
| 3 | [Public-record watch](candidates/public-record-watch.md) | 7.0 | 4 | Cheap probe — one vertical, two weeks |
| 4 | [Agent permission harness](candidates/agent-permission-harness.md) | 7.0 | 4 | Park; revisit 2027-Q1 |
| 5 | [Tender radar](candidates/tender-radar.md) | 6.625 | 4 | Park; needs a channel partner |
| 6 | [E-invoice preflight](candidates/einvoice-preflight.md) | 6.125 | 4 | Reject broad version; narrow version conditional |

Machine-readable scores: [candidates.yaml](candidates.yaml).
Considered and rejected: [screened-out.md](screened-out.md).

## Portfolio note recorded during this pass

Nine of eleven directories in `ventures/` have no `VENTURE.yaml`. The router
reads that file to allocate effort, so most of the portfolio is invisible to it
— not measured at zero, but absent. Backfilling those files needs economics only
the owner has, so it was not done here; adding new ventures on top of an
unmeasured portfolio is the more expensive version of the same problem.
