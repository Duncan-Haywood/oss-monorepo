# Ask 0's five registries are not interchangeable, and the biggest one is closed

Measured 2026-08-19. Read-only, stdlib only, no credentials sent, nothing
published or registered. Reproduce with:

```
python3 portfolio/research/registry-audience-match/measure_audience_match.py
python3 portfolio/research/registry-audience-match/measure_audience_match.py \
    --recompute-from results-2026-08-19.json     # offline, no network
```

## What was tested and why

Issue #139 presents **Ask 0** — the demand measurement six cycles of the
screening brief have asked the account owner for — as:

> One account signup on crates.io, RubyGems, Packagist, Hex, **or** Docker Hub.
> No egress change.

The word doing the work is *or*. Five options, any one of which is said to buy
"the demand measurement five cycles have asked for." Nobody had checked whether
they are actually equivalent.

This matters because it is the same shape as an error the chain has already made
once. #130 presented four payout rails (Stripe, Lemon Squeezy, Paddle, Polar) as
interchangeable; measurement found all four egress-denied, so the choice among
them was never the live question. An ask that offers a menu is only as good as
its worst assumption about what the items share.

A registry produces a demand number only if two things hold: the category's
searchers are there, **and** this portfolio can publish where those searchers
land. The second condition had not been tested anywhere in the chain.

## Method, and one correction to make before reading the numbers

Three queries (`mcp`, `model context protocol`, `agent tools`) against each
registry's public search API. `registry.npmjs.org` is included as a **control,
not a proposal** — #137 established it is publish-blocked from here.

**The registries' own search totals are not category counts.** They are
OR-matched across query terms, so crates.io reports 9,930 hits for "agent tools"
of which 1 of the top 10 is in the category, and npm reports 262,830 for "model
context protocol." The first version of this measurement took those totals at
face value and would have supported a conclusion the underlying data does not.
They are reported below only next to `in_category@10` — how many of the top ten
relevance-ranked results are genuinely MCP packages, judged by name — which is
what makes the total interpretable.

### Category presence, `mcp` query

| Registry | In Ask 0 | Fuzzy total | in_category@10 | Median top-10 downloads |
|---|---|---|---|---|
| Packagist | yes | 536 | **10/10** | 339,115 |
| RubyGems | yes | 30 | **10/10** | 240,374 |
| Docker Hub | yes | 20,568 | **10/10** | 236,601 |
| crates.io | yes | 7,675 | 9/10 | 3,868 |
| Hex | yes | 78 | 4/10 | 11,853 |
| npm *(control, publish-blocked)* | — | 99,699 | 10/10 | not exposed |

The MCP ecosystem is real on four of the five — this run set out expecting to
find it concentrated on one, and that hypothesis is wrong. Hex is the weak case:
6 of its top 10 for `mcp` are fuzzy matches (`agens`, `aide`, `arke_ai`), and
its category is genuinely thin.

## The finding: Docker Hub looks like the best option and is the worst

Docker Hub has by far the highest in-category presence of the five and a
healthy median pull count. Both are misleading, because of who owns the
packages producing them.

`mcp/` on Docker Hub is **a single verified-publisher Organization** — 245
repositories, joined 2024-12-19. It is Docker's curated MCP catalog, not an
open community prefix. An outside publisher cannot publish into it.

Across the top 150 relevance-ranked results for `mcp`:

| | Repos | Pull volume |
|---|---|---|
| Closed `mcp/` namespace | **149** | **98.2%** |
| Open namespaces (publishable) | **1** | 1.8% |

The single open-namespace result is `penpotapp/mcp`, and it ranks only because
its repository is literally named `mcp`.

So a listing this portfolio publishes to Docker Hub lands in a namespace holding
roughly 2% of the category's search visibility. It would return a number, and
that number would measure the portfolio's namespace obscurity rather than
demand for the product — which is the specific failure #150 warned about in a
different form when it noted that a channel returning nothing is worse than no
channel, because it looks like an answer.

**Docker Hub should be struck from Ask 0's menu**, or granted only with that
caveat attached.

## Second finding: the "underpowered probe" objection is registry-specific

#111 and #126 found the free-listing probe underpowered — median download counts
too small to distinguish "nobody wants this" from noise — measuring on npm and
crates.io. This run reproduces that on crates.io: median top-10 in-category pull
of **3,868**, the lowest of any reachable registry here.

Packagist (339,115) and RubyGems (240,374) run roughly **60–90× higher**. The
objection was recorded as a general property of the free-listing probe. It is
better read as a property of the two registries it was measured on.

**Stated limit, because this cuts against my own conclusion:** #111 measured the
median across a registry's packages; this measures the median of the top ten
results a searcher sees first. Those are different quantities and the ratio
between them is not a like-for-like correction. What this supports is that the
*category is more active* on Packagist and RubyGems — not that a new listing
there would draw those numbers. A new listing starts at zero on any registry.
The honest claim is narrow: the evidence for "underpowered" was gathered on the
two registries where the category is thinnest, and was never checked on the
others.

## Third finding: this bears on candidate #3's own kill condition

`portfolio/pipeline/candidates/mcp-supply-chain-watch.md` — the candidate #103
de-risked, and the one prior firings called the only one that got further
without the owner — names its most likely ending:

> **Registry commoditisation.** If the major MCP registries or an agent
> framework ship signed, versioned tool manifests, the mutable-declaration
> problem is fixed upstream and this candidate is obsolete rather than competed
> with.

#103 tested this against the **MCP specification** and the official registry,
and found no version, hash, signature, or integrity field anywhere. That result
stands. But the kill condition as written is not only about the spec: a curated
catalog under one trusted publisher achieves much of the same assurance for the
servers inside it, without any spec change at all.

Docker's catalog is that shape, and it is not small: 245 servers, verified
publisher, operating since December 2024, with the top entries at 100k–1.8M
pulls. Its images additionally carry `unknown/unknown` platform entries in their
manifest lists, which is the standard OCI shape of attached attestation
manifests (build provenance / SBOM).

**Two honest limits on that last point.** The `unknown/unknown` reading is an
inference from manifest structure, not a verified attestation — confirming it
needs a registry client this environment does not have. And attested *build
provenance* is not the same thing as a signed *tool declaration*: provenance
says who built the image, not that the tool list it serves at runtime matches
what was reviewed. For remote servers — 85% of the official registry's records,
per #103 — it says nothing at all.

So this does not fire the kill. It does mean the commoditisation risk is closer
than #103's spec-only check implies, and that whoever weighs candidate #3 should
weigh a curated-catalog ending alongside a signed-manifest one. Worth folding
into that write-up's "Where it can fail" section whenever #79 next moves.

## What this changes for the owner's decision queue

Nothing here needs an owner action to have been worth measuring, and none of it
is a decision an unattended session should make. Net effect on issue #139:

- **Ask 0's menu shrinks from five to four**, and the two best options are
  Packagist and RubyGems — not the one with the biggest numbers.
- **The "probe is underpowered" objection is weaker than recorded**, and was
  never tested on the registries that now look strongest.
- **Ask 0 gets cheaper to grant, not more expensive** — the choice is narrower
  and better evidenced, and still costs one free account signup with no egress
  change.

## What this does not do

No candidate added, no score changed, no edit to `portfolio/pipeline/` — that
directory exists only on unmerged PR #79, and touching it is what restarted the
supersede-and-rebuild clock five times. No venture directory, no `VENTURE.yaml`,
no automation, no scheduled workflow, no spend. Nothing here is rendered by any
venture's site.

The registry counts are live figures read on 2026-08-19 and will drift; the
saved JSON is the record of what was read. Package-name category matching is
deliberately generous and name-only, so `in_category@10` under-counts packages
that are MCP tooling without saying so in the name.
