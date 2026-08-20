# Feed reachability: which candidates can fetch their own input data

*Relocated from `portfolio/pipeline/feed-reachability.md` when the measurement
passes were consolidated into `portfolio/research/`; content unchanged apart
from link paths.*

Amendment recorded 2026-08-20 by the thirteenth-plus firing of the screening
brief. Per the `CLAUDE.md` intake gate it **adds no candidate and changes no
score**. It corrects a reachability fact that three prior passes got wrong in
the same way, and that issue #139 §2d currently states incorrectly.

Measurements and method: [`portfolio/research/data-reachability/`](README.md).

## What was wrong

#240 measured which candidates can fetch their runtime input data and found
only `mcp-supply-chain-watch` fully reachable. #250 corrected it for
`cra-evidence-desk` — its advisory feed *is* reachable via npm's bulk endpoint
and the GitHub/PyPA advisory git repos — and recorded the lesson as: prior
passes tested API endpoints, not the git distribution of the same data.

That lesson was right and was applied only once. Applied as a rule — probe
**every distribution channel a feed publishes**, not its canonical host — it
changes two more answers, and it changes the description of the policy itself.

The policy is not "registries only" (§2d) and not "general non-registry egress
denial" (#232). It is: **general-web hosts denied, code/package/object-storage
infrastructure allowed.** `storage.googleapis.com`, `s3.amazonaws.com`,
`gitlab.com`, and the GitHub hosts all answer. `raw.githubusercontent.com`
serves *any public repository*, not just this one — the widest door in the
current policy, and the reason the corrections below exist.

## What changes, per candidate

| Candidate | §2d's verdict | Measured 2026-08-20 |
|---|---|---|
| `cra-evidence-desk` | Feed reachable only via the npm slice (#250) | **Reachable at canonical scope** — the full OSV database (102 ecosystems, npm alone 227,118 records, refreshed hours before measurement) plus CISA KEV's exploitation signal, both inside current policy |
| `mcp-supply-chain-watch` | Only fully-reachable candidate | Unchanged, but no longer the only one, and no longer the best-supplied one |
| `eaa-remediation-pipeline` | Needs arbitrary-host fetching | Unchanged verdict, now **proven** rather than assumed: WCAG and axe-core rule data are reachable via git, but the scan target is an arbitrary customer website, and the `example.com` control is denied. No finite allowlist fixes this |
| `shopify-a11y-evidence` | Needs arbitrary-host fetching | Same as above |
| `tender-radar`, `public-record-watch`, `einvoice-preflight`, `agent-permission-harness` | Denied outright | Unchanged — every source publishes only to its own website |

`cra-evidence-desk` is the correction that matters. Its **Watch** component —
continuous matching of a customer's inventory against advisory sources — is
buildable today on canonical data, across every ecosystem the product claims to
cover, without any grant from the account owner. Combined with #250's measured
64.6–66.0% false-positive rate, that component is now specified by measurement
rather than by assumption.

## What this does *not* unblock

Stating this plainly, because the correction is easy to over-read:

- **The candidate's stated wedge is still blocked.** `cra-evidence-desk`'s
  differentiator is EUVD/ENISA mapping — the European register the CRA regime
  points at. `euvd.enisa.europa.eu` is denied, and it publishes to no git or
  object-storage channel. What is reachable is the commodity half; what is not
  is the half the write-up calls "the wedge".
- **The graduation gate is still unsatisfiable.** Issue #139 §2c requires each
  candidate's obligation dates be checked against actual legislation before it
  graduates. Every host that would allow this — EUR-Lex, `ec.europa.eu`,
  `publications.europa.eu`, `data.europa.eu`, `www.federalregister.gov` — is
  denied, and this pass closed the one untested route: the harness's own
  `WebFetch` is governed by the identical policy and returns `EGRESS_BLOCKED`
  on EUR-Lex while succeeding on allowed hosts. §2c's conclusion holds through
  every route available to a session.
- **Nothing here is distribution.** The portfolio's bottleneck remains customer
  contact, per [distribution-first.md](../../pipeline/distribution-first.md). Every candidate
  in this directory is still at zero customer contacts. Being able to fetch the
  data is not evidence that anyone will pay for what is built from it.

## What it changes for the account owner's queue

Issue #139 §2d poses the decision as *"general read-only outbound HTTP for
agent sessions, or a portfolio that only builds registry-data businesses"*.
Neither describes the current state. Broad machine-readable data egress already
exists — object storage, git hosting, and package registries are all open. The
genuine remaining gap is narrow and specific:

1. **Government and institutional publishers** (EU and US), which gate the
   graduation standard in §2c and `cra-evidence-desk`'s EUVD wedge.
2. **`api.wordpress.org`**, which is Ask 7 and is about demand measurement, not
   about building.

That is a smaller and more decidable ask than "general egress". It does not
change any score in this directory, and no score edit is applied here — the
scoring dimensions do not include environment reachability, which is arguably
the finding's own comment on the model.
