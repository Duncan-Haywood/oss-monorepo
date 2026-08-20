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

## What is here

| Probe | Candidate | Status |
|---|---|---|
| [`npm-reachability-triage`](npm-reachability-triage/) | [`cra-evidence-desk`](../candidates/cra-evidence-desk.md) | Built, tested, validated against the manual review. Not published — publishing needs the account owner's approval per `channel-inventory.md`. |

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
