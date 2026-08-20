# What a free listing is worth, not just whether it gets found

Computed 2026-08-19 from the committed demand-study data. Re-runnable offline:
`python3 analyze_listing_economics.py --out results.json`.

## Why this was computed

`portfolio/research/free-listing-demand/` measured how many downloads a cold
listing gets in the three pipeline categories that have a free, agent-reachable
channel. It closed by naming its own gap:

> **No pricing signal.** Nothing here says what any of these categories would
> pay. It measures whether a cold listing gets found, which is a strictly
> earlier question.

PR #218 then measured a second thing that study left open — a cold publisher's
odds of reaching a category's top decile (4.9%, against 16.2% for a publisher
who already has a package in real use).

Neither answers the question the portfolio's brief actually asks, which is about
profit. Two of the account owner's open asks on issue #139 — **Ask 2** (a payout
rail) and **Ask 5** (permission to publish a free listing under this portfolio's
name) — are decisions about spending on this channel, and nobody has put a
number on what the channel pays. This does, from data already committed.

**It adds no candidate and changes no score.** Per the `CLAUDE.md` intake gate,
this is step three of the same probe, not a new screening pass.

## Method: invert the unknown instead of guessing it

The temptation is to assume a conversion rate and report a revenue. That
compounds three guesses and produces a number nobody can check. This does the
opposite. Define

    Y = revenue per monthly download = r · c · p

where `r` is the share of monthly downloads representing a distinct adopting
team, `c` the share of adopters that ever pay, and `p` monthly revenue per
payer. Every business model for a free developer listing is some factorisation
of `Y`, and monthly revenue is just `downloads × Y`.

So rather than assume `Y`, the primary result reports **the `Y` each percentile
of the measured distribution would need** to clear a revenue bar. That number is
falsifiable by inspection — "every single download would have to yield $4.89 a
month" needs no benchmark to evaluate.

The download distribution is measured (leaf packages, zero dependents, same
definition and same committed JSON as the demand study; its leaf medians
reproduce to within one package). `Y` is derived. Nothing here re-fetches
anything.

## Finding 1: the median listing needs an absurd yield

Monthly revenue that must be extracted from **each download** for a listing at
that percentile to reach $1,000/month:

| Category | median | p75 | p90 | p95 | p99 |
|---|---:|---:|---:|---:|---:|
| SBOM / CRA evidence (`cra-evidence-desk`) | **$15.04** | $2.30 | $0.47 | $0.12 | $0.0027 |
| Accessibility evidence (`eaa-remediation-pipeline`, `shopify-a11y-evidence`) | **$4.89** | $1.05 | $0.26 | $0.10 | $0.0167 |
| MCP supply chain (`mcp-supply-chain-watch`) | **$0.42** | $0.15 | $0.053 | $0.018 | $0.0030 |

A median SBOM listing would have to convert every download into fifteen dollars
of monthly recurring revenue. There is no pricing model that does that. The
column where the numbers stop being silly is p95–p99, which is the same place
the demand study already said the distribution's mass lives.

## Finding 2: expected revenue for a cold listing is two figures, not four

To translate those back, three scenarios spanning the plausible range of `Y`.
Conversion `c` is anchored on published open-source-SaaS benchmarks (1–3%
typical, 0.3–1% for mass-market tools, 3%+ exceptional); `r` and `p` are
judgement, and `r` is the weakest number here — see *What this does not show*.

| Scenario | r | c | p | Y |
|---|---:|---:|---:|---:|
| pessimistic | 0.5% | 1% | $10 | $0.0005 |
| central | 2% | 2% | $25 | $0.0100 |
| optimistic | 5% | 4% | $50 | $0.1000 |

The optimistic row requires all three factors to sit at the top of their range
simultaneously, which is not a forecast so much as a ceiling.

**Monthly revenue at the median listing:**

| Category | pessimistic | central | optimistic |
|---|---:|---:|---:|
| SBOM / CRA evidence | $0.03 | **$0.67** | $6.65 |
| Accessibility evidence | $0.10 | **$2.04** | $20.45 |
| MCP supply chain | $1.20 | **$23.98** | $239.80 |

**Expected monthly revenue for a listing published cold** — stratifying at the
top decile and re-weighting by #218's 4.9% cold-publisher rate, because the
unconditional mean is dominated by a decile a cold publisher rarely reaches
(passing `--cold-top-decile-prob 0.10` recovers the unconditional case, which is
the script's own sanity check):

| Category | E[downloads/mo] | pessimistic | central | optimistic |
|---|---:|---:|---:|---:|
| Accessibility evidence | 1,563 | $1 | **$16** | $156 |
| SBOM / CRA evidence | 8,099 | $4 | **$81** | $810 |
| MCP supply chain | 14,478 | $7 | **$145** | $1,448 |

Share of *all* listings in the category clearing $1,000/month at central
assumptions: **0.5%** (accessibility), **2.0%** (SBOM/CRA), **3.2%** (MCP) — and
a cold publisher's odds are worse than the base rate, not equal to it.

The honest summary is that a free listing on this channel is worth **tens of
dollars a month in expectation**, and is a $1,000/month business only in the
tail that the demand study already showed cold publishing does not reach.

## Finding 3: the binding constraint is the buyer, not the listing approval

This is what the arithmetic is actually for.

**Ask 5** asks the account owner to approve publishing a free listing. Taken
together, the three studies now say that approval buys:

- no meaningful revenue — $16–$145/month expected, before any cost;
- and no meaningful information either, because the demand study already showed
  the resulting install count is consistent with both hypotheses it was meant to
  discriminate.

That is not an argument against granting it — it costs nothing, and #218 showed
the door is not closed (4.9%, not 0%). It is an argument against *waiting* on
it. It has been the pipeline's headline ask for five cycles and it is worth
roughly a rounding error, so it should stop being the thing the directory is
blocked on.

**Ask 2** (a merchant-of-record payout rail) cannot be justified by these three
candidates on this channel. At central assumptions all three sit below the cost
of the compliance and tax surface a payout rail carries.

What *would* change the arithmetic is not a better listing — it is a channel
whose buyer holds a budget. Two of `Y`'s three factors improve on a
business-buyer channel, and the large one improves structurally:

- **`r`: ~2% → ~1, a ~50× change.** WordPress.org reports `active_installs` per
  plugin — a stock of live sites, each one a distinct adopter — instead of a
  download flow that mixes CI runs, mirrors, and humans. The weakest number in
  this whole analysis stops being a guess and becomes an observation.
- **`p`: roughly 2–3× higher**, and grounded in the portfolio's own write-ups
  rather than a new assumption. `eaa-remediation-pipeline.md` puts indicative
  pricing at €49–99/month and `shopify-a11y-evidence.md` at $29–79/month,
  against the $10–50/month assumed for a developer above.
- **`c` is the one factor with no reason to improve**, so it is left at 2%.

Under that regime the model is `active_installs × c × p`: a plugin at **1,000
active installs**, 2% conversion, $49/month is **~$980/month** — from a
hundredth of the reach the npm arithmetic needs for the same result, on a
channel `channel-inventory.md` lists as free and agent-listable with no card and
no ID. Whether a cold plugin actually reaches 1,000 active installs is exactly
the unmeasured quantity.

**So the cheapest ask on the table is the one worth the most.** #218's comment
on issue #139 already flagged that `api.wordpress.org` returns 403 at this
environment's egress proxy, and asked for read-only access as a cheaper sibling
of Ask 3. This analysis is the reason to prioritise it: it is the only ask that
tests the regime where the numbers work, and it costs one proxy allowlist entry
— no account, no credential, no spend, nothing published. Re-confirmed this
session: `api.wordpress.org` and `wordpress.org` both fail with
`curl: (56) CONNECT tunnel failed, response 403`, which is the proxy refusing
the tunnel rather than the origin answering.

## A measurement gap this exposes

The $1,000/month bar above is a placeholder, not the portfolio's real cost
floor. `agent_spend_usd` is `null` for **every** entry in
`portfolio/ledger/2026-08.yaml`, so the portfolio cannot currently say whether
$145/month clears the cost of the agent time that would earn it. The pipeline
README already notes the router is "allocating against stage and budget cap
rather than measured return"; this is the same gap seen from the revenue side.
Recording actual agent spend per session would make every analysis of this shape
decidable rather than parameterised.

## What this does not show

- **`r` is the weakest number here.** No public benchmark maps npm downloads to
  distinct adopting teams, and the split between CI traffic, mirrors, and humans
  varies enormously by package. Finding 1 does not depend on it at all; Findings
  2 and 3 do. If the true `r` is 10× higher than the central guess, the central
  column becomes the optimistic column — and the conclusion in Finding 3 is
  unchanged, because it rests on a *comparison* between channels in which `r`
  appears on both sides.
- **npm only**, inherited from the input data. WordPress.org, Open VSX, and
  GitHub Marketplace are unmeasured, which is precisely the gap Finding 3 says
  is worth closing.
- **No willingness-to-pay evidence.** `c` and `p` are benchmark-anchored
  assumptions about categories, not measurements of these categories. `#207`
  reached the same wall from the other direction on `mcp-supply-chain-watch`
  (pricing risk, not alert fatigue, is that candidate's live question).
- **Revenue only, not profit.** Cost is unmeasured, per the gap above.
- **The cold-publisher re-weighting is an approximation**, and a deliberately
  generous one: it assumes a cold listing that reaches the top decile is an
  average member of it, when cold publishers in fact cluster at that decile's
  bottom. It also depends on #218, which is not yet on `main`.

## Files

- `analyze_listing_economics.py` — stdlib only, offline, reads the committed
  demand-study JSON. No network, no credentials.
- `results-2026-08-19.json` — every figure above, including the full percentile
  and scenario grids.

## Status of these claims

The download distribution is a **primary measurement** (inherited, re-derived
here from the committed rows). The required-yield table in Finding 1 is
**arithmetic on that measurement and assumes nothing**. Findings 2 and 3 depend
on stated assumptions, all of them in the tables above and all overridable in
the script.

Nothing here adds a candidate, changes a score, creates a `ventures/` directory,
registers an account, publishes anything, or spends anything.

## Sources

- [Monetizely — optimal free-to-paid conversion in open source SaaS](https://www.getmonetizely.com/articles/whats-the-optimal-conversion-rate-from-free-to-paid-in-open-source-saas)
- [Monetizely — ratio of free to paid users in developer SaaS](https://www.getmonetizely.com/articles/whats-the-right-ratio-of-free-to-paid-users-in-developer-saas)
- [StateShift — measuring developer go-to-market success](https://blog.stateshift.com/how-to-measure-go-to-market-success-for-developer-audiences/)
