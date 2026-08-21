# Probes

Executable probes for candidates in [`portfolio/pipeline/`](../README.md).

A candidate write-up is an argument. A probe is the smallest working thing that
tests the argument's weakest claim. Neither is a venture: a candidate still
graduates only by someone writing `ventures/<name>/VENTURE.yaml`, and nothing in
this directory changes a score or creates a `ventures/` entry.

This directory exists because the pipeline had accumulated eight scored
candidates, ~20 research write-ups, and **no executable artifact for any of
them**. [`distribution-first.md`](../distribution-first.md) asked four times
over for "one probe to a real buyer," and
[`channel-inventory.md`](../channel-inventory.md) established that building a
free listing needs no credential and no capital — only publishing does. The gap
was therefore never permission or budget. Nobody had built one.

That last sentence is right about why this directory exists and wrong about what
happens next. `channel-inventory.md`'s own refutation table measures every
mapped channel as `EGRESS_DENIED` or `SCOPE_DENIED`, so a built probe is not one
approval away from a listing — publishing is blocked by network policy and app
scope, which approval does not change. Build probes here because they make a
candidate's weakest claim testable, not because a listing follows.

## What is here

| Probe | Candidate | Status |
|---|---|---|
| [`npm-reachability-triage`](npm-reachability-triage/) | [`cra-evidence-desk`](../candidates/cra-evidence-desk.md) | Built, tested, validated against the manual review. Not published — and not publishable on approval alone: its mapped channel (GitHub Marketplace) measures `SCOPE_DENIED`, so it is blocked on Ask 1 (app scope), not on publish approval. |
| [`eaa-wcag-triage`](eaa-wcag-triage/) | [`eaa-remediation-pipeline`](../candidates/eaa-remediation-pipeline.md) | Built, tested (48 tests), validated against a hand-labeled fixture set (precision/recall 1.0). **Reconciled 2026-08-21 against the portfolio's other WCAG engine** (`portfolio/research/a11y-evidence-record/audit.py`), which had never been run on the same input: each engine was silently blind to two checks the other had. This probe gained 1.4.2 and 1.4.4, dropped a false-positive class on `aria-hidden` controls, and gained a coverage-catalog invariant; fixture validation is byte-identical. See [`a11y-engine-agreement`](../../research/a11y-engine-agreement/). Implements the candidate's blocking-vs-degrading triage and its own coverage statement. Not published; not a graduation — the candidate's real experiment needs live shop themes and a contractor. |
| [`source-silence-detector`](source-silence-detector/) | [`public-record-watch`](../candidates/public-record-watch.md) | Built, tested (57 tests), backtested against [`register-change-rate`](../../research/register-change-rate/README.md)'s saved records and against the nine mirrors' full commit history. **Refutes the build requirement it was written to implement, then refutes its own first fix.** A per-source cadence threshold catches 0 of the 2 registers that went quiet. The first pass blamed thin history and prescribed a fallback (2 of 2, 11d, 10 nuisance alarm-days); fetching full history shows that was right by accident — the real defect is that a worst-gap anchor only ever loosens, so the same configuration on full history catches **0 of 2** with a 5.6-year threshold. A p99 quantile anchor is the fix: 1 of 2 at 8d latency and 1 nuisance alarm-day, with the miss shown to be undetectable rather than mistuned (14 of that source's 37 historical gaps are ≥ the silence it is asked to flag). No score moved. |

## The rules a probe here follows

Taken from [`channel-inventory.md`](../channel-inventory.md)'s "what this does
and does not license", and from the positioning constraints in
[`README.md`](../README.md):

- **No compliance claim.** Evidence, records and drafts. Never "you are
  compliant" — that is a warranty, and this portfolio does not sell warranties.
- **No payment, no personal data, no account requiring an identity artifact.**
- **Coverage limits stated in the product**, not buried in terms. A customer who
  believes coverage is total is the one who gets hurt.
- **Publishing is a separate decision from building.** A probe may be built and
  committed here freely; putting this portfolio's name on a public listing is
  the account owner's call.

## A note recorded here because it closes a standing question

`cra-evidence-desk` names EUVD integration as its wedge, and four passes
recorded that wedge as blocked after probing `euvd.enisa.europa.eu`.

That is the site host. The **API** is served from
`euvdservices.enisa.europa.eu` — documented at `euvd.enisa.europa.eu/apidoc`,
no authentication, endpoints `/api/search`, `/api/enisaid`,
`/api/lastvulnerabilities`, `/api/exploitedvulnerabilities`,
`/api/criticalvulnerabilities`, `/api/advisory`, `/api/dump/cve-euvd-mapping`
and `/api/kev/dump`.

Applying the rule from
[`feed-reachability`](../../research/data-reachability/README.md) — *probe every
channel a feed publishes, not just its canonical host* — this run probed that
second host for the first time. It is **also denied** (`connect_rejected` at
`$HTTPS_PROXY/__agentproxy/status`), and EUVD mirrors to no git or
object-storage channel.

The conclusion does not change, but its basis does: the wedge is now closed at
the address that actually serves the data, rather than assumed from the one that
serves the website. That is worth recording because the same class of error —
probing a canonical host and concluding "unreachable" — is what
`feed-reachability` was written to stop, and EUVD was the one feed nobody had
re-probed under the new rule.
