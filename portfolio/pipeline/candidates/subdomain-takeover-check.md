# Subdomain takeover checker

Scored 2026-09-23. Composite 6.375 · floor 1 (ai_leverage). Same shape as this
portfolio's other deterministic checker ventures: whether a finding is
confirmed is decided by matching a live HTTP response against a fixed
provider fingerprint table, not a model in the loop — which is what keeps the
per-user cost at zero and every finding traceable to one DNS lookup and one
GET request.

A developer, DevOps engineer, or security researcher doing a DNS-zone audit
hits a specific, well-documented, and still-recurring exposure class: a DNS
CNAME record still points at a third-party hosting provider (an S3 bucket, a
Heroku app, a GitHub Pages site), but whatever used to be configured there
has since been deleted or was never created. Many of those providers let
anyone claim an unclaimed name on their platform — and once claimed, the
attacker's content is served under the victim's own subdomain, with that
domain's own cookies and whatever trust its CSP or CORS policy places in it.

## Why this venture, not another dev-tooling checker

`portfolio/pipeline/README.md`'s "archetype itself" section argues for the
checker/CLI shape over another `<trade>-bid-calculator`, and this portfolio
already has a family of "read what's actually there, name the exact
evidence" checkers (`git-exposure-check`, `dotenv-exposure-check`,
`source-map-leak-check`, `cors-misconfig-check`, and others).
`duplicate_check.py`, run against a description naming exactly this
mechanism (follows a hostname's real CNAME chain, matches the target against
known takeover-prone providers, confirms with a live fingerprinted GET),
scored every existing venture, screened-out row, and pipeline candidate at
0.09 or below — well under the 0.45 read-this-first bar. Nothing in
`screened-out.md` covers DNS CNAME chains, subdomain takeover, or dangling
cloud-resource pointers. The closest sibling, `email-auth-check`, also
resolves DNS over the same public DoH resolver but reads TXT records for a
completely different purpose (SPF/DKIM/DMARC authentication), never CNAME
chains and never a live HTTP confirmation step.

## The design constraint this write-up exists to make explicit

A CNAME pointing at `herokuapp.com` or `s3.amazonaws.com` says nothing about
whether the app or bucket it names actually exists — most CNAMEs to those
kinds of hostnames are perfectly legitimate and in active use. A checker that
reported every DNS match against a known-provider pattern as a "finding"
would be wrong most of the time, on a subject matter (naming someone else's
domain as vulnerable) where being wrong has a real cost: a false positive
sent to a bug-bounty program or a client is not a harmless inconvenience.

So `analyze.mjs` draws a hard line, pinned directly by
`analyze.test.mjs`'s "classify never confirms a takeover from DNS alone"
test: a finding is only ever reported `dangling-confirmed` when **both** the
CNAME target matches a known provider **and** a live GET request to the
hostname returns that specific provider's own "nothing is claimed at this
name" fingerprint text. A DNS-only match is reported as a separate,
lower-severity `risky-unconfirmed` category — worth a manual look, never
escalated. `fingerprints.mjs`'s own `vulnerable` field (this tool's read of
whether a provider currently allows unauthenticated claiming) is surfaced to
the reader as context and never changes that escalation rule either.

## Scope, deliberately partial

25 providers, chosen for how frequently they appear in public
subdomain-takeover research and write-ups (S3, Heroku, GitHub Pages, two
Azure services, Fastly, Shopify, and 18 more — see `fingerprints.mjs` for the
full table with a docs link and a note per entry). This is not, and does not
claim to be, the complete set of services with this failure mode. The tool
never enumerates a domain's other subdomains or crawls anything — it only
checks the exact hostnames given to it, the same scoped-input shape
`dotenv-exposure-check` and `git-exposure-check` use.

One fingerprint (Amazon S3's `NoSuchBucket` response) was verified live
against a real, deliberately nonexistent bucket while building this tool —
the only outbound host this sandbox's egress proxy allowed through during
development. The remaining 24 are built from well-documented public
information (the same "which page comes back when nothing is configured"
signatures long documented across security research and open-source
subdomain-takeover scanners) rather than a live check against each provider,
recorded honestly in each entry's `note` field rather than overclaimed.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic classification: a fixed CNAME-pattern table and a body-fingerprint regex against a real HTTP response; no model in the loop |
| Autonomous ops | 10 | Zero-dependency browser tool + CLI, no server, no queue, no ops |
| Time to revenue | 6 | Donations only; a developer doing a DNS-zone audit or pre-launch verification wants an immediate self-check, plausible discovery via search inside weeks — same reasoning as the sibling checkers |
| Gross margin | 10 | Every request runs from the visitor's own browser (when CORS allows) or machine (for the CLI) against a DNS resolver and hostname of their choosing, so serving one more user costs a static file |
| Defensibility | 2 | A CNAME-pattern table and a fingerprint regex are genuinely easy to reimplement; no data moat beyond the table's own maintained correctness |
| Distribution | 7 | Subdomain takeover is a standard, recurring HackerOne/Bugcrowd report category and a common penetration-test finding; the exposure class (a decommissioned cloud resource whose DNS record was never removed) predates and outlives any single provider |
| Liability containment | 7 | Every request is a plain DNS lookup or GET, never a claim/write attempt at any provider; a finding is only ever "confirmed" against a live fingerprint match, never escalated from DNS alone, which is the structural mitigation against the false-positive risk this subject matter carries |
| Ethical robustness | 8 | Read-only against public DNS and a hostname's own HTTP response, no crawling, no enumeration of a domain's other subdomains, gets more useful to more site owners as it is used more, and a clean report is stated as evidence about the checked hostnames only, never a full DNS-zone audit |

Composite: (1+10+6+10+2+7+7+8)/8 = **6.375**. Floor: **1** (`ai_leverage`).
Both gates (`liability_containment`, `ethical_robustness`) pass well above
the floor of 5.

(`venture-scores.yaml`'s own ongoing-tracking schema uses a six-dimension
composite with the two gates recorded separately as pass/fail rather than
folded into the mean -- see that file's entry for this venture, composite
6.0 there. The two files score different things and are not expected to
show the same number; this write-up's 6.375 is the pipeline-intake figure
`validate_doc_consistency.py` checks against `candidates.yaml` and
`README.md`.)

## Mitigation for the floor and near-floor dimensions

`ai_leverage` sits at the deliberate floor every deterministic checker in
this family carries, and needs no mitigation beyond what the family already
established: the classification is factual pattern-and-fingerprint matching,
not a judgment call. `defensibility` (2) is a real, named weakness rather
than one masked by the composite — mitigated the same way as the sibling
checkers: the free-and-correct version, shipped first with the
never-escalate-from-DNS-alone confirmation guarantee as its distinguishing
feature, is the moat available to a zero-marginal-cost product.

## Verdict

**Graduate as a venture** (`ventures/subdomain-takeover-check`). Both gates
clear well above the floor of 5 (`liability_containment` 7,
`ethical_robustness` 8). Kill criteria: no organic traffic or CLI/repo
engagement after a fair run per `portfolio/usage/README.md`; a materially
better free tool with the same confirmation guarantee becomes the obvious
default; or the provider fingerprint table proves unmaintainable against
providers changing their "unclaimed" page wording faster than this portfolio
can track it.
