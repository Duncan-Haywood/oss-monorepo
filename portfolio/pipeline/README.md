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

Scored 2026-08-18 unless noted. Composite is the mean of eight dimensions;
`floor` is the lowest single dimension, which is usually the thing that actually
decides.

Rescored 2026-08-20 for the two candidates that have actually been probed — see
[rescore-2026-08-20.md](rescore-2026-08-20.md) for the derivation. Scores with no
`measured:` block in `candidates.yaml` are still the original estimates.

| # | Candidate | Composite | Floor | Verdict |
|---|---|---|---|---|
| 1 | [EAA remediation pipeline](candidates/eaa-remediation-pipeline.md) | 7.25 | 5 | Build now, as a `local-site-studio` product line |
| 2 | [Shopify accessibility evidence app](candidates/shopify-a11y-evidence.md) | 7.25 | 4 | Probe the channel — scored 2026-08-19 |
| 3 | [Public-record watch](candidates/public-record-watch.md) | 7.0 | 4 | Cheap probe — one vertical, two weeks |
| 4 | [Agent permission harness](candidates/agent-permission-harness.md) | 7.0 | 4 | Park; revisit 2027-Q1 |
| 5 | [MCP supply-chain watch](candidates/mcp-supply-chain-watch.md) | 6.75 | 3 | Probe: steps 1–2 run; mitigation refuted, cannot graduate as scored |
| 6 | [CRA evidence desk](candidates/cra-evidence-desk.md) | 6.75 | 3 | Probe (was build-now); wedge is egress-blocked |
| 7 | [Tender radar](candidates/tender-radar.md) | 6.625 | 4 | Park; needs a channel partner |
| 8 | [E-invoice preflight](candidates/einvoice-preflight.md) | 6.125 | 4 | Reject broad version; narrow version conditional |

Both rescored candidates fell, one point per measured dimension, and no measured
dimension has ever risen. Read the six unmeasured rows as upper bounds rather
than as better candidates —
[rescore-2026-08-20.md](rescore-2026-08-20.md) has the pattern and what follows
from it.

Machine-readable scores: [candidates.yaml](candidates.yaml), checked by
`validate_candidates.py` (`python3 portfolio/pipeline/validate_candidates.py`).
Considered and rejected: [screened-out.md](screened-out.md).
What six independent screening runs agreed on: [convergence.md](convergence.md).
Why the next pass should screen channel-first:
[distribution-first.md](distribution-first.md).
Which channels this portfolio can actually list in, and what each costs in
credentials: [channel-inventory.md](channel-inventory.md).

## Status of the claims in these write-ups

**These are internal research notes, not published content and not legal
advice.** Nothing in this directory is rendered by any venture's site, and
`ventures/ai-first-markets` — which does deploy to a live site — is deliberately
untouched by it.

The regulatory dates, fine levels, market sizes, and competitor claims in the
candidate write-ups came from web research during the screening pass and are
**unverified against primary sources**. They are recorded at the confidence they
were gathered at, which is good enough to rank candidates against each other and
not good enough to act on. Before any candidate graduates to a venture, the
specific obligation dates it depends on must be checked against the actual
legislation, and any claim that would appear in customer-facing copy must be
verified independently.

This distinction is why the consolidation landed here rather than in
`ai-first-markets`: ranking candidates in an internal directory needs no
publication decision, so it does not need the account owner to adjudicate legal
accuracy first.

## Provenance of this directory

This is a consolidation. Six scheduled agent runs on 2026-08-18 screened the
same brief independently and opened six overlapping pull requests
(#17, #18, #20, #27, #30, #34) proposing about thirty-six candidates between
them. Those reduce to nine archetypes; this directory keeps the write-ups that
cleared the gates and records the rest in [screened-out.md](screened-out.md).
[convergence.md](convergence.md) analyses what the six runs agreed on and what
that does and does not tell us.

A further scheduled run on 2026-08-19 was assigned the same brief again. Rather
than produce a thirty-seventh candidate, it acted on the finding those six runs
had already reached but not used — that distribution, not capability, is what
kills these candidates. [distribution-first.md](distribution-first.md) turns that
into a selection rule, records marketplace evidence for and against the existing
candidates, and adds the single candidate that rule produces
([shopify-a11y-evidence](candidates/shopify-a11y-evidence.md), found by starting
from a channel rather than from a market).

A ninth run on 2026-08-19 was assigned the same brief again. It added no
candidate. It landed the consolidation above onto a `main` that had moved
underneath it, and recorded one amendment that the eighth run could not have
made: two marketplace-native products —
`ventures/garmin-world-traveler-watchface` and `ventures/world-clock-widget` —
were merged to `main` *after* `distribution-first.md` was written, and both
pass that document's own distribution test while nothing in this directory is
built. See the ninth-run amendment at the end of
[distribution-first.md](distribution-first.md). It also added an intake gate to
[CLAUDE.md](../../CLAUDE.md) so a tenth run is redirected here before it
screens.

A tenth run on 2026-08-19 was assigned the same brief again, hit that intake
gate, and added no candidate. It carried the ninth run's whole diff onto a
`main` that had moved again, and did the one thing
[distribution-first.md](distribution-first.md) asked for that nobody had done:
enumerate the channels. [channel-inventory.md](channel-inventory.md) is the
result. Its finding is that "run one probe to a real buyer" is two actions —
demand measurement and revenue capture — and only the second needs the
developer-account credentials that have blocked this for four cycles. The
first is free, needs no credential, and is available on a channel three of the
eight candidates above can reach.

An eleventh run on 2026-08-19 was assigned the same brief again. It added no
candidate and changed no score. It established the one fact the previous four
runs each missed about their own situation: **none of this directory has ever
been on `main`.** Runs seven through ten (#36, #44, #53, #61) each built a
version of it and each was closed unmerged, so every subsequent run began from
a checkout with no `portfolio/pipeline/`, no intake gate in `CLAUDE.md`, and
therefore no way to discover that the brief was already answered. Each run
correctly diagnosed the duplication and then wrote its diagnosis into a branch
that did not land — which is why the loop survived being noticed four times.
This run carried the tenth run's whole diff onto current `main` and opened it
as the consolidation PR, so the gate above is enforceable rather than
re-derived. The screening content below is the tenth run's work, unchanged;
verifying it and getting it landed is the eleventh run's only contribution.

A twelfth run on 2026-08-19 was assigned the same brief again. It added no
candidate and changed no score. It found the mechanism behind the fact the
eleventh run established — *why* five consecutive consolidation PRs were each
built correctly and then never merged:

> **The blocked PR blocked itself.** Every version of this directory was
> bundled with a `portfolio/ledger/2026-08.yaml` entry in the same pull
> request. That file is append-only and *every* scheduled session appends to
> it, several per hour. So each consolidation PR became un-mergeable within
> about an hour of being opened — not because anyone disagreed with it, but
> because its own ledger hunk collided with the next session's. The next run
> would find a conflicted PR, rebuild it onto a fresh `main`, re-attach a new
> ledger entry, and start the same clock again. Five cycles of that.

The eleventh run measured this and reported it as "a trial merge conflicts
only in the ledger's append point (routine, not a real conflict)." It is
routine, and it was also the whole blocker: a PR awaiting a human decision
cannot carry a hunk that goes stale hourly. Verified again this run — #70
against current `main` produces exactly one conflict, in that file, and
nothing else in the 17-file diff conflicts with anything.

The fix is separation, and it is the twelfth run's only contribution:

- **This directory, the intake gate, and the README/router edits ship with no
  ledger change at all.** No other session touches `portfolio/pipeline/`,
  `CLAUDE.md`, or `README.md`, so this pull request stays mergeable
  indefinitely. It can sit awaiting the account owner's decision for a week
  without a rebase, and no future run needs to rebuild it.
- **The ledger entry for this cycle ships separately** and is merged on its
  own, the way every other session's routine ledger append already is.

A later run on 2026-08-20 was assigned the same brief again. It added no
candidate and screened nothing. It found that the four probes run in the
preceding ten hours (#207, #245, #250, #253) had each ended by declining to
write their result into `candidates.yaml` — so the ranking above was still
entirely pre-measurement while the measurements themselves sat in unmerged
branches. It applied those five score changes, replaced one refuted mitigation
and one verdict, added an arithmetic checker so the next edit is cheap, and
recorded the pattern the five changes make. See
[rescore-2026-08-20.md](rescore-2026-08-20.md).

If you are a thirteenth run reading this on `main`, the separation worked and
the intake gate above applies to you: do not screen. If you are reading it in
an unmerged branch, check whether a content-only pipeline PR is already open
before rebuilding anything — rebuilding is what sustained this loop.

## Portfolio note recorded during this pass

The `VENTURE.yaml` backfill this pass originally flagged has since landed —
every directory under `ventures/` now carries either that file or a
`NOT-A-VENTURE` marker. A CI workflow to enforce that exists
(`.github/workflows/portfolio-validate.yml`); it had **never successfully
run** as of 2026-08-18 (see that day's ledger entry) because account-wide
Actions runs were failing before any job started (`startup_failure`, a
broken workflow file elsewhere in the repo reporting as `path: "BuildFailed"`
on every push — tracked separately in issue #139 section 3, alongside #144
and #146). **Update 2026-08-19 ~15:55 UTC:** run
[`32266714656`](https://github.com/Duncan-Haywood/monorepo-projects/actions/runs/32266714656)
completed with `conclusion: success` — the workflow's first recorded success,
triggered by the #79 merge commit (`42ebd981`, which touched
`portfolio/router/README.md` and so matched this workflow's path filter).
Re-run locally the same day: `python3 portfolio/router/validate.py` →
`All 11 VENTURE.yaml files are valid`, matching the CI result. This confirms
the `startup_failure` signature is not an account-wide Actions block —
push-triggered workflows do run and can succeed — but it is only proven for
commits that touch this workflow's own trigger paths
(`ventures/**/VENTURE.yaml`, `ventures/**/NOT-A-VENTURE`,
`portfolio/router/**`). No push since (`110d68c`, `fc49deef`) touched those
paths, so there is no further evidence either way yet. Treat the invariant as
verified locally and now spot-confirmed once in CI, not yet as continuously
enforced. The underlying caution stands: economics are still `null` across
the portfolio, so the router is allocating against stage and budget cap
rather than measured return. Adding new ventures on top of an unmeasured
portfolio is the more expensive version of that problem, which is why every
verdict above is a probe or a product line rather than a new `ventures/`
directory.
