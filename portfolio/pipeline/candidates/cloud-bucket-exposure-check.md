# Cloud bucket exposure checker

Scored 2026-09-24. Composite 6.5 · floor 1 (`ai_leverage`). Same shape as
this portfolio's other deterministic checker ventures: whether a bucket is
publicly listable is decided by matching an HTTP response body against a
cloud provider's own documented listing-or-error XML grammar, not a model
in the loop — which is what keeps the per-user cost at zero and every
finding traceable to one response.

A developer, cloud/DevOps engineer, or security researcher doing deploy
verification or due diligence hits a specific, long-documented, and still
structurally perennial exposure class: an object-storage bucket
(AWS S3, Google Cloud Storage, or Azure Blob Storage) left configured to
allow anonymous public listing of its contents, usually by an accidental
bucket policy, ACL, or account-level setting. Once listable, every object
name in the bucket is enumerable with no credentials at all — customer IDs,
internal filenames, backup dates — and if the bucket is *also* configured
for public object reads, every listed name becomes directly downloadable.
This is the mechanism behind a long list of real breaches (Verizon, 14
million customer records, 2017; a Pentagon contractor's exposed
social-media-monitoring archive; dozens of Have I Been Pwned entries), and
it is exactly why AWS changed S3's own default in 2023 to block public
access on every newly created bucket.

## Why this venture, not another dev-tooling checker

`portfolio/pipeline/README.md`'s "archetype itself" section argues for the
checker/CLI shape over another `<trade>-bid-calculator`, and this portfolio
already has a family of "read what's actually there, name the exact
evidence" checkers (`git-exposure-check`, `dotenv-exposure-check`,
`supabase-rls-check`, `firebase-rules-check`, `subdomain-takeover-check`,
and others). `duplicate_check.py`, run against a description naming exactly
this mechanism (real read-only requests to a user-provided S3/GCS/Azure
bucket, classifying public-list vs private across the three major
providers' own endpoint conventions), scored every existing venture,
screened-out row, and pipeline candidate at 0.24 or below — well under the
0.45 read-this-first bar. `graphql-introspection-exposure-check` scored
closest (0.24), a different evidence class entirely (a GraphQL schema
introspection response, not a cloud-storage listing endpoint).
`subdomain-takeover-check` names S3 only as one of 25 DNS-CNAME
takeover-prone *hosting providers* — a dangling DNS record pointing at a
deleted resource, a completely different mechanism and finding from a
*live* bucket's own anonymous-listing setting. Nothing in `screened-out.md`
covers cloud object-storage misconfiguration.

**The one thing that makes this more than "does a GET to my bucket URL
return 200," and the reason it is worth building at all, is the
three-provider, body-content-aware classification.** Status code alone is
not reliable across providers or even within one — a public bucket and a
private one can each answer 200 or 403 depending on the exact
misconfiguration. This tool instead requires the response body to parse as
a provider's own real listing document (`ListBucketResult` for the
S3-compatible XML API AWS S3 and GCS share, `EnumerationResults` for
Azure's own schema) or a real, named error code (`AccessDenied`,
`NoSuchBucket`, `PublicAccessNotPermitted`, `ContainerNotFound`) — content
no unrelated server response would happen to produce. That distinction is
pinned by `engine.test.mjs`'s fixtures, built from each provider's own
documented response shape and cross-checked live, read-only, against three
real endpoints during development (a nonexistent bucket, the `commoncrawl`
S3 bucket — public object reads but anonymous listing denied, a correct
negative — and two intentionally public research datasets on GCS and
Azure, both correctly flagged).

## Scope, deliberately narrow

Only one request is ever sent — the bucket's own anonymous listing
endpoint — and the body read is capped at 16KB. The tool never requests any
individual object's content: finding out a bucket allows public listing is
the exposure it checks; downloading what is inside it is a different,
higher-liability action a real, authorised penetration test would take,
the same restraint `git-exposure-check` documents for not requesting a
repository's packed objects once `.git/HEAD`/`.git/config` already confirm
exposure. Up to 5 example object *names* are shown as evidence (never
content), out of however many the single response reports.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic classification: fixed regexes against a provider's own documented XML shapes and a fixed decision table; no model in the loop |
| Autonomous ops | 10 | Zero-dependency browser tool + CLI, no server, no queue, no ops |
| Time to revenue | 6 | Donations only; a developer or platform engineer who has just read a leaky-bucket write-up or is doing pre-launch IaC verification wants an immediate self-check, plausible discovery via search inside weeks |
| Gross margin | 10 | The CLI's request runs from the user's own machine against a bucket they choose; the browser page only renders a report already produced. Serving one more visitor costs a static file |
| Defensibility | 2 | Fixed regexes and one GET request per provider — genuinely easy to reimplement, same score as the sibling checker family for the same reason |
| Distribution | 8 | Scored a point above the sibling checker family's typical 7: this is a perennial, three-provider exposure class (not tied to one dated incident the way an npm-supply-chain-attack channel is) with real, sustained tool demand already proven by existing free scanners (s3scanner, several thousand GitHub stars; GrayhatWarfare's public-bucket search index; Bucket Stream), a provider (AWS) that changed its own default because of this exact class, and three independent developer communities (AWS, GCP, Azure) as overlapping search channels rather than one |
| Liability containment | 7 | One ordinary, unauthenticated GET request to an endpoint the target already serves to any anonymous visitor if misconfigured — same shape and score as `git-exposure-check`/`cors-misconfig-check`. Never attempts to fetch object content; reports evidence (object count, up to 5 names) and stops |
| Ethical robustness | 8 | Gets better for bucket owners as it is used more (a quick, free, zero-signup pre- or post-deploy check that catches a real and damaging misconfiguration before an attacker does), makes no compliance claim, and a clean report is stated as evidence about this one bucket and this one exposure class only, never a full cloud security assessment |

Composite: (1+10+6+10+2+8+7+8)/8 = **6.5**. Floor: **1** (`ai_leverage`).

## Mitigation for the floor and near-floor dimensions

`ai_leverage` sits at the deliberate floor every deterministic checker in
this family carries, and needs no mitigation beyond what the family already
established: the classification is factual pattern-matching against a
published response grammar, not a judgment call, so there is no accuracy
claim that needs a model behind it. `defensibility` (2) is a real, named
weakness rather than one masked by the composite — mitigated the same way
as the sibling checkers: the free-and-correct version, shipped first with
the narrowest honest scope and covering all three major providers in one
tool, is the moat available to a zero-marginal-cost product; a copy
competing on the same axis does not change the portfolio's economics.

## Verdict

**Graduate as a venture** (`ventures/cloud-bucket-exposure-check`). Both
gates clear well above the floor of 5 (`liability_containment` 7,
`ethical_robustness` 8). Kill criteria: no organic traffic or CLI/repo
engagement after a fair run per `portfolio/usage/README.md`; a materially
better free tool at the same zero-install, three-provider bar becomes the
obvious default; or real user reports show the body-content classification
produces false positives/negatives that cannot be fixed without expanding
scope past what this liability read covers (in particular, attempting to
fetch object content to confirm public-read access, which this tool
deliberately does not do).
