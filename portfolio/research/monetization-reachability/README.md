# Monetization reachability: the portfolio can build and ship, but cannot get paid

Eighteenth firing of the recurring *"research and evaluate potential software
business projects that aren't already here"* brief.

**No new candidate is proposed and PR #79 was not rebuilt.** Its intake gate asks
future runs not to screen again, and the note at the end of its provenance
section is explicit that rebuilding the PR is what sustained the loop through
five cycles. One candidate *was* generated here, by a method the pipeline has not
used before — and it was then killed by its own measurement, which is reported
below rather than quietly dropped.

This run measured the surface PR #126 did not: **monetization rails, publishing
channels, and operating data sources that ride on hosts this environment already
permits.** That is a different question from "is this specific vendor reachable",
and it has a different answer, because several of these services are distributed
as git repositories or as registry metadata rather than as their own API host.

45 targets across 37 distinct hosts. The headline is one sentence:

> **Every route by which this portfolio could collect money is closed — 0 of 13
> rails — while eight *more* publishing channels and the entire public
> vulnerability corpus turn out to be open.** The constraint is not that the
> agent cannot build or distribute a product. It is that it cannot charge for
> one, and that has now been measured across the whole rail category rather than
> a sample of four.

## Method

`probe_rails_and_sources.py` issues one small read-only GET per target. Verdicts
follow PR #126 so the two result sets can be read side by side — `REACHABLE`,
`EGRESS_DENIED` (the network egress policy refused), `SCOPE_DENIED` (the host
answered but this session's GitHub scope did not cover the route), `UNREACHABLE`
— plus one PR #126 had no need for:

- **`BOT_CHALLENGED`** — the network path works and the *origin's own* anti-bot
  layer refused a non-browser client. It is neither a setting the account owner
  controls nor a usable channel, so folding it into either bucket would mislead.
  One target hit this (`www.npmjs.com`, Cloudflare interstitial).

Targets are grouped by the decision they inform: `rail` (somewhere money could be
collected), `channel` (somewhere a product could be listed), `source` (an input
the business would ingest continuously), and `baseline` (controls, so a
surprising verdict can be read against a known-good and a known-denied point on
the same run — `registry.npmjs.org` reachable, `api.stripe.com` denied, both as
PR #126 found them).

### One classifier correction to PR #126

PR #126 warned that an in-band HTTP 403 is indistinguishable from an origin's own
403 unless the body is read, and that anything relying on status codes alone
will overcount reachability. That warning applies to one of its own rows.

GitHub's session proxy denies out-of-scope **API paths** with a body reading
`This GitHub API path is not available: sessions are bound to their configured
repository`, which is a different string from the out-of-scope **repository**
body PR #126 already handled. So `api.github.com/marketplace_listing/plans` was
scored `REACHABLE` there. It is a scope denial, and is classified as one here.

The correction does not change PR #126's conclusions — GitHub Marketplace was
never counted as a working channel in its rollup — but it does change this run's
finding, because that path is one of the rails being evaluated.

## Finding 1 — 0 of 13 monetization rails are usable, and they fail on two different switches

PR #126 probed four merchant-of-record APIs, found all four egress-denied, and
concluded that the standing "one payout rail, established once" ask is
under-specified: the credential alone buys nothing without a paired egress
change. That is correct, and this run extends it from a sample to the category.

| Rail | Verdict | Switch that would fix it |
|---|---|---|
| Stripe *(from #126)* | `EGRESS_DENIED` | network egress |
| Lemon Squeezy *(from #126)* | `EGRESS_DENIED` | network egress |
| Paddle *(from #126)* | `EGRESS_DENIED` | network egress |
| Polar *(from #126)* | `EGRESS_DENIED` | network egress |
| PayPal | `EGRESS_DENIED` | network egress |
| Gumroad | `EGRESS_DENIED` | network egress |
| Open Collective (site + API) | `EGRESS_DENIED` | network egress |
| Ko-fi | `EGRESS_DENIED` | network egress |
| Liberapay | `EGRESS_DENIED` | network egress |
| Tidelift | `EGRESS_DENIED` | network egress |
| thanks.dev | `EGRESS_DENIED` | network egress |
| **GitHub Sponsors** (`github.com/sponsors`) | `SCOPE_DENIED` | **GitHub app scope** |
| **GitHub Marketplace billing** (`api.github.com/marketplace_listing/plans`) | `SCOPE_DENIED` | **GitHub app scope** |

Three things follow that were not visible from four samples.

**It is not a vendor-selection problem.** Thirteen rails spanning card processing,
merchant-of-record billing, fiscal hosting, and maintainer-funding platforms all
fail. Switching rails does not route around it, and neither does choosing a rail
that needs no company formation (Open Collective's fiscal hosting, Gumroad's
merchant-of-record model) — those were the two structurally cheapest options for
a portfolio with no legal entity, and both are denied.

**Two of the thirteen fail on a different switch, and it is the cheaper one.**
GitHub Sponsors and GitHub Marketplace billing are *not* egress-denied. The hosts
answer; this session's GitHub app scope is bound to
`duncan-haywood/monorepo-projects` and refuses the route. That is the same knob
PR #126 identified for the MCP spec repository, and it is a narrower, more
reviewable permission than opening general network egress to a payment processor.

**So the eight-cycle ask should be re-stated as a choice between two asks, not one.**
The pipeline's `channel-inventory.md` asks for "one payout rail, established
once." As written, granting it produces a credential the environment cannot
call. The two coherent versions are:

- **Narrow:** widen the GitHub app scope to permit the Sponsors / Marketplace
  billing routes. One switch, one vendor, a permission the account owner already
  understands. Constrains the portfolio to GitHub-native monetization.
- **Broad:** create an account on a merchant-of-record rail **and** add that one
  host to the network egress allowlist. Two switches that must land together, in
  exchange for being able to charge for anything, anywhere.

Neither is a decision an unattended session should make. Both are now costed.

## Finding 2 — eight more publishing channels are open than PR #126 found

PR #126 concluded that "every listing channel except npm is denied." Measured
over the channels it probed, that is right. Measured over the channels it did
not, the accurate statement is narrower and much more useful:

> Every listing channel except **package registries** is denied — and package
> registries are numerous.

Newly measured as reachable, none of them probed by PR #126:

| Channel | Verdict | Note |
|---|---|---|
| `ghcr.io` | `REACHABLE` | container distribution, HTTP 401 from the origin's own auth |
| `hub.docker.com` | `REACHABLE` | |
| `proxy.golang.org` | `REACHABLE` | in the `noProxy` allowlist verbatim; route `DIRECT` |
| `pkg.go.dev` | `REACHABLE` | Go discovery surface |
| `rubygems.org` | `REACHABLE` | |
| `api.nuget.org` | `REACHABLE` | |
| `repo.packagist.org` | `REACHABLE` | |
| `hex.pm` | `REACHABLE` | |

Still denied, and worth recording so a future run does not re-probe them:
`huggingface.co`, `registry.terraform.io`, `formulae.brew.sh`,
`addons.mozilla.org`, and all three third-party MCP directories (`smithery.ai`,
`glama.ai`, `www.pulsemcp.com`). `github.com` is `SCOPE_DENIED` on every path
tried, so it is not usable as a general web surface either.

**Two distinctions that stop this finding from being read as more than it is.**

*Reading a registry is not publishing to it.* `pypi.org` is reachable and
`upload.pypi.org` is `EGRESS_DENIED` — PyPI can be measured from here but not
published to. That distinction was not tested for every registry above, and a
channel whose upload host is denied is not a channel. `crates.io`'s publish route
is on the reachable host, which establishes the host answers but not that an
authenticated `PUT` would succeed.

*A reachable registry is still an unmonetizable one.* None of these eight
channels carries a payment rail. They change what can be **distributed**, not
what can be **charged for**, and Finding 1 is unaffected by them.

## Finding 3 — the vulnerability corpus is reachable after all, by routes PR #126 did not try

This is the finding that changes a row in PR #126's per-candidate table.

PR #126 marked `cra-evidence-desk` unexecutable partly because it "cannot ingest
the vulnerability data the product is made of" — `api.osv.dev` and
`services.nvd.nist.gov` are both egress-denied. Both denials reproduce. But the
data those APIs serve is also distributed by other routes, and the routes are
open:

| Source | Route | Verdict | What was actually retrieved |
|---|---|---|---|
| OSV, full npm export | `storage.googleapis.com` | `REACHABLE` | 219,892,530 bytes, **227,091 records**, parsed |
| GitHub Advisory Database | `raw.githubusercontent.com` (git repo) | `REACHABLE` | a real advisory record (`GHSA-jf85-cpcp-j695`, OSV schema 1.4.0) |
| CVE Project `cvelistV5` | `raw.githubusercontent.com` (git repo) | `REACHABLE` | a real CVE record (`CVE-2024-0001`, `dataVersion` 5.1) |
| RustSec advisory-db | `raw.githubusercontent.com` (git repo) | `REACHABLE` | |
| MCP reference server list | `raw.githubusercontent.com` (git repo) | `REACHABLE` | |

Each was confirmed by retrieving actual data, not by a status code on a README.

Aggregator APIs remain denied — `api.deps.dev`, `api.ecosyste.ms`, `libraries.io`
— so the derived, pre-joined views are unavailable and the raw corpora are not.

**What this does and does not do to `cra-evidence-desk`.** Its `operate` role
flips from unavailable to available: the data is here, in bulk, today. Its
`premise` role does not — the CRA text lives on `eur-lex.europa.eu`, which is
still egress-denied, so the regulation the product is sold against still cannot
be verified from this environment. The candidate stays non-executable, but for
one reason instead of two, and the remaining reason is a document that a human
could paste in once rather than a feed the business must poll forever.

The generalisation is worth stating on its own, because it is the transferable
part: **when an API host is denied, check whether the same data ships as a git
repository or an object-store export.** Public-interest datasets frequently do.
That heuristic is what produced this entire finding.

## Finding 4 — the candidate this suggested, and the measurement that killed it

Findings 2 and 3 define a *constraint-native* generator the pipeline has not used:
instead of starting from a market or from a channel, start from what this
environment can actually reach, and ask what business is buildable entirely
inside it. Reachable set: package registries, the public vulnerability corpora,
GitHub-hosted files, the MCP registry, and inference.

The strongest candidate that generator produces is **cross-source advisory
reconciliation** — a service that tells a developer when the advisory databases
disagree about a package they depend on, because a scanner's verdict depends on
which database it happens to consult. All inputs reachable; distributable as a
package on a reachable registry; liability containable if it reports *differences
between sources* rather than issuing a security opinion of its own.

Following the precedent PR #103 and PR #111 set in this repo, it was measured
against its own premise before being written up. **It failed, on two independent
tests.**

### Test 1 — disagreement within OSV's federated npm feed

`measure_advisory_disagreement.py` grouped all 227,091 npm records by the CVE
they alias and kept the groups described by more than one publishing database.

| | |
|---|---:|
| records in feed | 227,091 |
| carrying a CVE alias | 5,785 |
| distinct CVEs referenced | 5,771 |
| **CVEs described by more than one database** | **11 (0.19%)** |

Within those eleven, disagreement is universal (100% differ on affected version
ranges). Eleven is not a market.

**This test is weak on its own and is reported as such.** OSV *deduplicates*: for
npm, GitHub's GHSA records essentially are the feed, and a CVE record covering
the same flaw is folded in as an alias rather than carried alongside as a second
opinion. So the method cannot observe most of the disagreement it is looking for,
by construction. A run that stopped here would have killed the candidate for the
wrong reason.

### Test 2 — GHSA against the CVE Project's own corpus

The genuinely independent comparison is against `cvelistV5`, every CVE as
published by its assigning CNA. 300 npm GHSA advisories carrying a CVE alias,
sampled with a fixed seed from a population of 5,766, each looked up in that
repository.

Comparing version *ranges* across the two schemas requires normalising CVE's
free-text `versions[]` against OSV's event ranges, and that normalisation is
exactly where an analyst manufactures whatever disagreement rate they wanted. It
is not attempted. Three direct field reads are used instead:

| Measure | Result |
|---|---:|
| CVE id has no record in `cvelistV5` at all | **1.33%** (4 of 300) |
| **CVE record `REJECTED` while the GHSA citing it is live** | **0.00%** (0 of 295) |
| CVE record carries no machine-readable version bound | 12.84% (38 of 296) |

The middle row is the product premise, and it is zero. The one `REJECTED` CVE in
the sample has a *withdrawn* GHSA — the two systems agree, which is the opposite
of the failure the product would sell against. The four missing records are
recent ids (three from 2026), consistent with CVEs reserved by a CNA and not yet
published rather than with any inconsistency.

The 12.84% with no usable version bound is real and is a genuine annoyance for
anyone gating a build on CVE data — but it is a property of the CVE corpus that
every scanner vendor already works around, not a disagreement between sources,
and not something a subscription fixes.

**Verdict: rejected on its own premise.** The sources agree. Recorded here so the
nineteenth run does not re-derive it, and added to the reasons in
`portfolio/pipeline/screened-out.md` — proposed rather than applied, since that
file is not on `main` and editing it would mean rebuilding PR #79.

### What the failure says about the generator

The constraint-native generator produced exactly one serious candidate, and it
died. That is itself informative: the reachable set is *narrow and homogeneous*
— package registries and vulnerability data, one buyer archetype (developers),
one distribution motion (publish a package and hope). PR #111 and PR #126's
crates.io replication already measured what that motion is worth: a median cold
listing lands in the tens or low hundreds of downloads per month.

So the reason `mcp-supply-chain-watch` is the only executable candidate in the
pipeline is not that it is exceptional. It is that it is the only one that
happens to live inside the one category this environment can reach — and that
category has a measured-poor distribution motion and no payment rail. Widening
what the portfolio can execute is an access decision (Finding 1), not a research
decision. **Nineteen firings of a screening brief cannot produce a candidate that
this environment can charge for, because no such candidate exists under the
current settings.**

## What this run did not do

No `ventures/` directory, no `VENTURE.yaml`, no candidate added to the pipeline,
no score changed, no automation, no scheduled workflow, no spend beyond this
session's own inference. Nothing here is rendered by any venture's site. PR #79
and PR #126 are untouched — the two corrections above are proposed against them
in text, exactly as PR #126 proposed a ninth scoring dimension without editing
PR #79.

All three scripts are read-only, stdlib-only, send no credentials, and are paced.

## Honest limits

- **A probe is a snapshot of a policy, not of a market.** Everything here
  describes what this environment permitted on 2026-08-19. The scripts are
  committed rather than only their output so a settings change shows up as a
  diff.
- **Reachable is not publishable, and this run only tested the distinction for
  PyPI.** It found the two differ there (`pypi.org` open, `upload.pypi.org`
  denied). The eight channels in Finding 2 were probed on their read or auth
  endpoints; their upload paths were not individually confirmed, so "eight
  channels open" should be read as "eight channels worth confirming", not as
  eight channels proven publishable.
- **The advisory kill test covers npm only.** PyPI, crates.io and Maven were not
  measured, and a different ecosystem could have a different multi-source
  structure. npm was chosen because it is the largest corpus reachable here and
  the one the pipeline's existing candidates target; the finding is not claimed
  beyond it.
- **`n = 300` bounds the rejected-CVE rate, it does not prove it is zero.** Zero
  in 295 live advisories is consistent with a true rate up to roughly 1% at 95%
  confidence. The candidate needs a rate high enough for a developer to notice
  and pay; ~1% is comfortably below that, so the conclusion holds, but the
  measured figure is an upper bound rather than an absence.
- **Version-range disagreement between GHSA and CVE was deliberately not
  measured**, for the reason given above. If someone believes the candidate
  survives on that dimension, that is the test to build — and it needs a
  defensible normaliser first, not a rate.
- **No claim about why any host is denied.** The policy's intent is not visible
  from inside it, and "denied" is not read here as "should be allowed."
- **Finding 1 costs two options; it does not recommend one.** Whether this
  portfolio should monetize through GitHub or through a merchant of record is a
  business and tax decision belonging to the account owner.

## Reproducing

```
python3 portfolio/research/monetization-reachability/probe_rails_and_sources.py \
    --out portfolio/research/monetization-reachability/results-2026-08-19.json

# ~220MB download, cached; then all computation is local
python3 portfolio/research/monetization-reachability/measure_advisory_disagreement.py \
    --ecosystem npm --cache /tmp/osv-npm.zip --out /tmp/npm-disagreement.json

python3 portfolio/research/monetization-reachability/measure_ghsa_vs_cve.py \
    --cache /tmp/osv-npm.zip --sample 300 \
    --out portfolio/research/monetization-reachability/results-2026-08-19-ghsa-vs-cve.json
```

Every script takes `--recompute-from <saved.json>` and re-derives its published
numbers from the committed results without touching the network, so the claims
above are checkable offline.

The intermediate `npm-disagreement.json` is not committed: its `groups` array is
large and its headline figures (11 multi-source CVEs of 5,771) are quoted in full
above and re-derivable in one run from the cached export.
