# What a cold free listing actually gets

Measured 2026-08-19 against the public npm registry. Re-runnable:
`python3 measure_listing_demand.py --out results.json`.

## Why this was measured

`portfolio/pipeline/channel-inventory.md` (open in PR #79) makes an argument the
portfolio has been waiting on for several cycles. Paraphrased:

> "Run a probe to a real buyer" is two actions, not one — demand measurement and
> revenue capture. Only the second needs a payout rail. The first is free, needs
> no credential, and an agent can do it today. Publish a free listing, record
> installs, and that number "re-scores the distribution column for this entire
> directory — upward if a cold listing gets found, downward if it does not."

Two of the three things that document asks the account owner to approve depend
on that experiment being worth running. Nobody had checked whether it is. This
directory checks it, on npm — one of the channels `channel-inventory.md` itself
lists as free, agent-listable, and requiring no artifact belonging to a legal
person.

The question asked here is narrow and empirical: **if this portfolio published a
free tool into one of the candidate categories today, what is the realistic
distribution of demand it would see?**

## Findings

Three categories, chosen because they are the pipeline candidates
`channel-inventory.md` maps to a free agent-reachable channel. Figures are
monthly downloads for *leaf* packages — zero dependents, so their downloads come
from someone finding them directly rather than from a parent pulling them in.

### 1. The median cold listing is close to invisible

| Category | Candidate | n | p25 | **median** | p75 | p90 | p99 |
|---|---|---:|---:|---:|---:|---:|---:|
| SBOM / CRA evidence | `cra-evidence-desk` | 402 | 16 | **68** | 437 | 2,148 | 375,579 |
| Accessibility evidence | `eaa-remediation-pipeline`, `shopify-a11y-evidence` | 606 | 46 | **205** | 957 | 3,868 | 61,216 |
| MCP supply chain | `mcp-supply-chain-watch` | 970 | 1,024 | **2,399** | 6,835 | 18,800 | 327,630 |

Restricting to packages published in the last 18 months — the closest available
analogue to a listing published cold today — barely moves any of it: medians of
87, 196, and 2,397 respectively.

Share of listings clearing each level:

| Category | >100/mo | >1,000/mo | >10,000/mo | >100,000/mo |
|---|---:|---:|---:|---:|
| SBOM / CRA evidence | 43% | 16% | 5.0% | 2.0% |
| Accessibility evidence | 62% | 25% | 5.0% | 0.5% |
| MCP supply chain | 95% | 76% | 18% | 3.2% |

### 2. Demand is concentrated far past the point where a probe is informative

This is the load-bearing finding, and unlike the absolute counts it is not
distorted by mirror, scanner, or CI traffic inflating the bottom of the
distribution.

| Category | Top 1% of listings take | Top 5% take | Half of all demand goes to the top |
|---|---:|---:|---:|
| SBOM / CRA evidence | **78%** | 98% | **0.25%** of listings (1 of 402) |
| Accessibility evidence | **41%** | 73% | **1.65%** of listings (10 of 606) |
| MCP supply chain | **60%** | 81% | **0.41%** of listings (4 of 970) |

Because keyword relevance filtering is imperfect, the same figures were
recomputed with the largest one and largest five packages removed. The shape
survives: half of category demand still goes to the top **0.75–2.1%** of
listings with the top package removed, and the top **1.0–3.3%** with the top
five removed. The concentration is a property of the categories, not of a few
outliers that slipped through the filter.

The SBOM row is worth stating plainly: a **single** package,
`@datadog/datadog-ci-plugin-sbom`, accounts for 56.5% of all leaf downloads in
that category. The other 401 listings share the rest.

### 3. What that means for the proposed probe

The experiment `channel-inventory.md` proposes is **underpowered as designed.**

Its logic is that install count discriminates between "the category has real
demand and we can reach it" and "it does not." But the modal outcome of
publishing into these categories is somewhere between 68 and 2,400 downloads a
month, and that is what a listing gets *whether or not* the category has real
demand — the categories measured here demonstrably do have real demand (they
contain packages at 194k, 3.7M, and 10.2M downloads a month), and the median
listing in them still lands in the low hundreds.

So a result in that range, which is what should be expected, is consistent with
both hypotheses and distinguishes neither. The measurement cannot move the
distribution score in either direction, which is the only thing it was proposed
to do.

A probe is informative here only if it is powered to detect the top few percent
of the distribution, and nothing about publishing a listing makes that
outcome more likely — which is the second-order finding: **on these channels,
publishing is not distribution.** The listing is where demand is captured once
it exists; it is not what creates it. That is a numerical restatement of what
`distribution-first.md` already concluded from reasoning, and it argues that
the scarce thing to spend an approval on is a referral path, not a listing.

## What this does not show

- **npm only.** WordPress.org, Open VSX, and GitHub Marketplace are the other
  free agent-listable channels in `channel-inventory.md`, and none of them
  publishes a comparable per-listing usage figure through an API reachable from
  this environment. WordPress.org in particular has a different buyer (site
  owners, many of them businesses) and may well behave differently; nothing here
  refutes that, and the accessibility candidates target exactly that channel.

  **Partly addressed since** — see [cross-registry-replication.md](cross-registry-replication.md).
  The concentration finding was replicated on Packagist and RubyGems, two
  registries that *are* reachable: it holds in all nine registry × category
  cells, it is not an artifact of CI traffic (Packagist stars show the same
  shape), and npm turns out to be the *optimistic* case — the median Packagist
  listing in these categories gets zero downloads a month. WordPress.org itself
  remains unmeasured and egress-blocked.
- **Downloads are not users, and users are not payers.** A download is a CI run
  as often as a person. The concentration finding is robust to this; the
  absolute medians are an upper bound on human adoption, not an estimate of it.
- **No pricing signal.** Nothing here says what any of these categories would
  pay. It measures whether a cold listing gets found, which is a strictly
  earlier question.
- **Category boundaries are keyword-defined**, so the populations are
  approximations. Search hits dropped as irrelevant: 1,887 (SBOM), 1,217
  (accessibility), 274 (MCP); dropped as platform artifacts: 129, 3, and 29.
  All counts are in the results JSON. A handful of incidental matches survive
  (`claude-cup`, the largest package in the MCP category, is a contest tracker).
  The sensitivity check above exists because of them.
- **One snapshot.** Download counts move; the MCP category especially is young
  enough that 965 of its 970 leaf packages were published within 18 months.

## Files

- `measure_listing_demand.py` — the harness. Stdlib only, read-only against the
  public registry, no credentials, paced to stay inside the search API's rate
  limit.
- `results-2026-08-19.json` — every row behind every number above, including the
  full per-package data, so the figures can be recomputed without re-fetching.

## Status of these claims

Unlike the candidate write-ups in `portfolio/pipeline/`, these are **primary
measurements against a live API, not secondary-source research** — the raw rows
are committed and the script re-derives the numbers. What is uncertain here is
interpretation (whether npm generalises to the other free channels, whether
downloads track adoption), not the data.

Nothing here adds a candidate, changes a score, creates a `ventures/` directory,
or spends anything.
