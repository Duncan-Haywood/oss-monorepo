# Winning free-registry discovery does not come with a way to get paid

**Measured 2026-08-19 against the public npm registry. Read-only, no credentials,
reproducible from this repo.**

This directory measures the term every previous study in this chain had to
assume. It adds no candidate and changes no score.

## The gap this closes

Four measurements now describe what a cold free listing can attract:

| | Finding |
|---|---|
| `free-listing-demand/` | The median leaf listing in these categories gets 68–2,399 downloads/month |
| #218 | A cold publisher's odds of a **top-decile** listing are **4.9%**, vs 16.2% for a publisher with an existing audience |
| #219 | Central-case revenue for a cold free listing is **$16–$145/month** — computed as that download distribution × an **assumed ~2% conversion rate**, which #219 names as the weakest input in its own model |
| #225 | The concentration replicates on Packagist and RubyGems; changing registry does not improve the discovery term |

Every one of those measures the entrance to the funnel — how much attention a
listing can attract. **None measures the exit.** The ~2% conversion assumption
has never been checked against the population that would have to convert, and
two live account-owner asks (#139's Ask 5 and Ask 7) are justified by revenue
figures that rest entirely on it.

So this study asks the question from the other end. Rather than model what a
winning listing *would* earn, it looks at the listings that already won:

> Among the listings that reached the top decile of downloads in these
> categories — the outcome a cold publisher has a ~4.9% chance of reaching —
> how many have any mechanism to receive money at all, and how many have a
> *product* mechanism rather than a donation button?

## Method

The population is built by **importing** `measure_listing_demand.py` — the same
`CATEGORIES`, queries, relevance filter, artifact exclusion, and leaf
(zero-dependents) definition as the download study. The two cannot drift apart,
and any correction to the population definition applies to both. Same discipline
#225 used for the cross-registry replication.

Each category is split at its own top-decile download threshold. **Winners** are
every listing at or above it. **Control** is a deterministic even spread across
the listings below it — spread rather than top-N, so the comparison group is not
just the near-winners. Each sampled package's registry metadata and published
README are read and classified:

- **`commercial`** — a declared price, paid tier, licence key, enterprise
  edition, pricing page, or a licence that only makes sense as one half of a
  dual-licence sale (AGPL/SSPL/BUSL/Elastic/`SEE LICENSE IN`/`UNLICENSED`).
- **`donation`** — GitHub Sponsors, Open Collective, Ko-fi, Patreon, Tidelift,
  Liberapay, thanks.dev, Buy Me a Coffee, or any declared `funding` field. Money
  may arrive; it is a gift, not a price.
- **`none`** — no such signal.

`commercial` dominates `donation` dominates `none`, so the commercial share is
the share with *any* product-revenue route.

## Finding 1 — ~92% of the listings that won discovery have no price

Pooled across all three categories (`n` = packages that resolved):

| Group | n | none | donation | **commercial** | commercial 95% CI |
|---|---:|---:|---:|---:|---|
| **Winners** (top decile) | 199 | 85.9% | 6.5% | **7.5%** | 4.6% – 12.1% |
| **Control** (the rest) | 180 | 85.6% | 4.4% | **10.0%** | 6.4% – 15.3% |

Per category:

| Category | Group | n | none | donation | commercial |
|---|---|---:|---:|---:|---:|
| accessibility-evidence | winners | 62 | 87.1% | 8.1% | 4.8% |
| accessibility-evidence | control | 60 | 86.7% | 3.3% | 10.0% |
| mcp-supply-chain | winners | 96 | 87.5% | 3.1% | 9.4% |
| mcp-supply-chain | control | 60 | 85.0% | 6.7% | 8.3% |
| sbom-cra-evidence | winners | 41 | 80.5% | 12.2% | 7.3% |
| sbom-cra-evidence | control | 60 | 85.0% | 3.3% | 11.7% |

Top-decile thresholds: 3,853/mo (accessibility, 607 leaves), 20,589/mo (MCP, 971
leaves), 2,148/mo (SBOM, 404 leaves).

**The two confidence intervals overlap across most of their range.** The correct
reading is not "winners monetise less" — the counts are 15 and 18, far too small
for that — it is that **there is no detectable difference at all**. Reaching the
top decile of downloads does not raise the probability that a listing has a way
to charge. Discovery and revenue are decoupled on this channel.

## Finding 2 — the monetised winners are companies that arrived with an audience

This is sharper than the percentages, and it is what actually bears on the
portfolio's decision. Of the 15 commercial-route winners, roughly eleven are
listings published by an organisation that already had its own distribution and
its own product, with the package acting as a client or connector to it:

`@alipay/mcp-server-alipay` · `@microsoft/github-copilot-app-modernization` ·
`@mui/mcp` · `slack-mcp-server` · `n8n-mcp` · `storybook-mcp-server` ·
`@aikidosec/mcp` · `@ironbee-ai/devtools` · `ato-mcp` ·
`devexpress-reporting-react` · `cbrowser`

For these, the "free tier" or "enterprise edition" the classifier detected is
the *company's* product. The listing is marketing for a business that already
had customers; it is not itself the revenue.

Meanwhile the listings that look like what this portfolio would actually publish
— an independent tool with a per-seat price and no prior audience — sit in the
invisible tail, priced and unfound:

| Listing | Monthly downloads | Declared price |
|---|---:|---|
| `n8n-nodes-relayshield` | 473 | $499/mo, $999/mo |
| `proof-of-commitment` | 472 | $15/mo |
| `@vibecheckai/cli` | 172 | $49/mo |
| `guardrail-cli` | 81 | $29/mo, $99/mo, $499/mo |
| `n8n-nodes-snyk` | 13 | commercial licence |

This is #218's audience handicap (4.9% cold vs 16.2% with an audience) showing
up a second time, in the revenue dimension rather than the discovery dimension.
Having something to sell does not get a listing found, and getting found is
concentrated among publishers who did not need the channel to begin with.

**Stated as the judgement it is:** "published by a company with its own
distribution" is a hand reading of fifteen package names, not a measured field.
It is recorded here as a pattern worth checking, not as a statistic.

## Finding 3 — every observed price is charged somewhere other than the registry

Of the 33 commercial-route listings across both groups:

| Mechanism (mutually exclusive, most specific wins) | Count |
|---|---:|
| A named merchant of record (Paddle/Stripe/Gumroad/Lemon Squeezy/Polar) | 1 |
| Some other off-registry pricing or checkout URL | 5 |
| Prose price or tier mention with no linked checkout at all | 16 |
| Licence signal only (dual-licence, EULA, `SEE LICENSE IN`) with no visible price | 11 |

**Not one charges through the registry**, because npm has no billing rail —
which `channel-inventory.md` already asserted, and which this observes directly.
Every listing that takes money does so by sending the reader somewhere else.

That has a direct consequence for the ask ordering on #139: converting attention
into revenue requires a payout rail (**Ask 2**) *regardless of which channel the
attention came from*. Ask 5 and Ask 7 both buy discovery, and discovery is not
the step that is missing.

## What this means for the open asks

Recorded as an argument, not a decision — the ranking on #139 is the account
owner's.

1. **"Cheapest first" and "load-bearing" are different orderings, and #139
   currently uses the first.** Ask 7 (one WordPress.org egress entry) is the
   cheapest item on that list and buys a better *measurement* of discovery.
   Ask 5 buys permission to *obtain* discovery. On this evidence neither
   produces revenue on its own, because 92.5% of the listings that already won
   discovery have no price and 100% of those that do charge off-registry.
2. **This does not refute #219, and the two together are worse news than
   either.** #219 argued Ask 2 (merchant-of-record account) is hard to justify
   because central-case revenue on npm/PyPI is $16–$145/month. This study finds
   that without Ask 2 the revenue is structurally zero, not merely small. Both
   hold at once, and what they jointly say is that **the free-developer-registry
   route does not have a revenue path for this portfolio at any ask on the
   list** — not that a different ask would unlock one.
3. **The implication is to stop buying measurements of this channel.** Five
   studies (#166, #218, #219, #225, this one) have now measured the same funnel
   from both ends and converged. A sixth would be the failure mode `CLAUDE.md`
   documents, one level up from the candidate lists.
4. **The candidate scores are untouched.** No dimension changes here. The
   `distribution` scores in `portfolio/pipeline/` were assigned against channels
   including gated ones (Shopify, GitHub Marketplace paid) that this study says
   nothing about, and that remain the more plausible route precisely because
   they have billing rails attached.

## Honest limits

- **A declared route is not revenue.** This measures whether a listing *can*
  take money, which is an upper bound on whether it does. The true share earning
  anything is lower, in both groups.
- **The absence of a signal is not the absence of a business.** A package may
  monetise through a repo, a website, or a sales conversation the README never
  mentions. This biases the reported commercial share **down** in both groups
  equally, which is why the winners-vs-control comparison is the load-bearing
  result and the absolute level is not.
- **README matching is heuristic in both directions.** One false positive
  survived into the results and is left visible rather than hand-removed:
  `accessibility-scanner-cli` matched on `https://example.com/pricing`, a
  placeholder in an unfinished README. A badge-URL false positive
  (`shields.io/badge/buy`) was caught in the smoke run and is now filtered — see
  `BADGE_HOSTS`. Sponsor acknowledgements ("sponsored by …") are stripped before
  matching so that crediting someone else's product is not read as having a
  price.
- **`funding` is under-declared on npm generally**, so the donation share is a
  floor.
- **Small counts.** 15 commercial winners and 18 commercial controls. The
  confidence intervals are wide and are reported for exactly that reason. The
  claim defended here is the null one — no detectable difference — which small
  samples support poorly in the other direction but adequately in this one, in
  the sense that no large effect could hide at this n.
- **npm only, one snapshot.** #225 established that the discovery term does not
  improve on Packagist or RubyGems; whether the *monetisation* term differs
  there is untested. Every non-developer channel in `channel-inventory.md`
  (WordPress.org, Open VSX, VS Marketplace, Chrome Web Store, addons.mozilla.org)
  was re-confirmed egress-blocked from this environment during this session, so
  the business-buyer regime could not be measured by any route.
- **Categories are keyword-defined**, inherited from the download study with the
  same imperfection.

These are directional evidence for a build/kill decision. They are not
customer-facing claims and should not appear in any copy.

## Reproducing

Standard library only, no dependencies, no credentials, read-only against the
public registry. Full run is roughly 25 minutes at the pacing set in the script.

```bash
python3 portfolio/research/listing-monetization/measure_listing_monetization.py \
    --out results-2026-08-19.json
python3 portfolio/research/listing-monetization/measure_listing_monetization.py \
    --categories mcp-supply-chain
```

Raw rows, including every classification and the evidence behind it:
[`results-2026-08-19.json`](results-2026-08-19.json).

Resolution was near-total: 2 of 379 sampled packages failed to resolve (both in
the MCP winners group), and READMEs were available for 344 of the 377 that did.

## Status

Research, not a venture. No `ventures/` directory and no `VENTURE.yaml` is
created here, so the router allocates nothing to it. No candidate is added, no
score is changed, no account is registered, nothing is published, and nothing is
spent beyond agent time.
