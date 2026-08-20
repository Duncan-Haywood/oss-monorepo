# Is the concentration finding about npm, or about free listings?

Measured 2026-08-19 against the public Packagist and RubyGems APIs. Re-runnable:
`python3 measure_registry_concentration.py --out results.json`.

## Why this was measured

The npm study in this directory found that demand in the pipeline's candidate
categories is concentrated so far into the top few listings that publishing one
is underpowered as an experiment. It then named its own biggest limitation
verbatim:

> **npm only.** WordPress.org, Open VSX, and GitHub Marketplace are the other
> free agent-listable channels [...] WordPress.org in particular has a different
> buyer (site owners, many of them businesses) and may well behave differently;
> nothing here refutes that.

That caveat became load-bearing. PR #219 priced the free-listing probe at
$16–$145/month on npm, and then argued the arithmetic only works on a channel
with a business buyer — modelling WordPress.org at roughly $980/month. That
model is the sole justification for **Ask 7** on issue #139, currently the
cheapest ask on the table. #219 flagged the dependency itself: *"npm only,
inherited from the input data — which is precisely the gap Finding 3 says to
close."*

WordPress.org is egress-blocked from this environment, so the claim cannot be
tested where it was made. It can be **bounded**. If the concentration shape is a
property of npm, the different-channel hypothesis is wide open. If the same
shape appears on independent registries — different language, different age,
different buyer — then it is a property of free listing channels, and switching
registries is not what rescues the probe.

## Method

Same three categories, same queries, same relevance filter, and the same
`percentiles` / `concentration` / `threshold_shares` functions as the npm run —
imported from `measure_listing_demand.py` rather than reimplemented, so the two
studies cannot drift apart.

Two registries, both reachable read-only from here with no egress change and no
credential, and both already established as publishable end to end by the
registry-audience work in #166:

- **Packagist** (PHP). The closest reachable proxy to WordPress.org's buyer that
  exists: WordPress is PHP, and the agencies and site builders who install
  WordPress plugins are drawn from the same population that installs Composer
  packages. Packagist also publishes a per-package `dependents` count, so the
  npm run's leaf filter reproduces exactly, and `favers` (stars).
- **RubyGems** (Ruby). An independent check on a mature registry with a
  developer buyer. Its search API exposes no dependent count, so its populations
  are whole categories rather than leaves, and its download figures are
  **lifetime, not monthly** — so its *levels* are not comparable to the other
  two. Its *concentration* is, because concentration is a share.

## Finding 1: the concentration replicates, and it is not close

The npm study's headline was the share of listings holding half of category
demand. Restating all nine cells as a count makes the replication plain:

| Category | npm | Packagist (leaves) | RubyGems |
|---|---|---|---|
| SBOM / CRA evidence | **1** of 402 | **1** of 11 | **1** of 16 |
| Accessibility evidence | **10** of 606 | **2** of 74 | **1** of 28 |
| MCP supply chain | **4** of 970 | **3** of 243 | **1** of 147 |

**In every one of the nine registry × category cells, between one and ten
listings hold half of all demand in the category.** Six of those cells are new
here, on two registries the npm study never touched.

The top-1% shares agree:

| Category | npm | Packagist | RubyGems |
|---|---:|---:|---:|
| SBOM / CRA evidence | 78.3% | 98.7% | 89.7% |
| Accessibility evidence | 40.9% | 46.2% | 78.0% |
| MCP supply chain | 60.3% | 39.6% | 66.7% |

The npm study's own sensitivity check — recompute with the largest one and
largest five listings removed, in case incidental keyword matches are carrying
the result — was rerun here and survives the same way. On Packagist's two
adequately-sized categories, half of demand still goes to the top 1.7%
(MCP, n=243) and 2.7% (accessibility, n=74) of listings with the largest
removed, and to the top 2.9% and 5.8% with the largest five removed. The SBOM
category is too small (n=11) for the check to mean much either way.

## Finding 2: it is not an artifact of CI traffic

This is the part that could not be checked on npm at all, and it closes the npm
study's own sharpest self-criticism: *"a download is a CI run as often as a
person."*

Packagist publishes `favers` — stars, a deliberate human action that no mirror,
scanner, or continuous-integration job ever performs. Running the identical
concentration statistic over stars instead of downloads:

| Packagist category | half of *downloads* held by | half of *stars* held by | top-1% downloads | top-1% stars |
|---|---|---|---:|---:|
| SBOM / CRA evidence | 1 of 11 | 1 of 11 | 98.7% | 68.2% |
| Accessibility evidence | 2 of 74 | 2 of 74 | 46.2% | 49.0% |
| MCP supply chain | 3 of 243 | 7 of 243 | 39.6% | 32.1% |

Two independent signals, one of which cannot be inflated by automation, produce
the same shape. **The concentration is a property of attention, not of download
plumbing.**

## Finding 3: npm was the optimistic case, not the pessimistic one

This is the finding that bears directly on Ask 7, and it points the opposite way
to the assumption behind it.

Median monthly downloads for a leaf listing:

| Category | npm | Packagist |
|---|---:|---:|
| SBOM / CRA evidence | 68 | **0** |
| Accessibility evidence | 205 | **0** |
| MCP supply chain | 2,399 | **1** |

The median listing on the PHP registry gets **zero downloads a month**. Share of
leaf listings with literally zero monthly downloads: 64% (SBOM), 51%
(accessibility), 46% (MCP). Share with zero stars: 45%, 68%, 47%.

Supply is thinner off npm — 74 accessibility listings against npm's 606, 11 SBOM
listings against 402 — and the tempting reading is that a thin category is
easier to win. The medians refute it. Thin supply here is not thin competition
for attention; it is thin demand. The largest accessibility leaf listing in
Packagist's whole category gets 1,327 downloads a month — on npm that would sit
between the same category's 75th percentile (957) and its 90th (3,868). The
*best* PHP listing in the category is an unremarkable npm one.

## What this does and does not settle

**Settled: the discovery term does not improve by changing registry.** The
"different channel, different regime" argument, in its general form, is now
tested and false across three registries. A cold listing's problem is not that
it picked npm.

**Not settled: WordPress.org specifically.** This bounds the claim, it does not
refute it, and the distinction matters enough to state precisely. Packagist's
buyer reaches packages through a command line and a dependency file; a WordPress
site owner reaches plugins through the admin plugin browser, which is a
different discovery surface, not merely a different audience. Nothing measured
here reaches that surface.

More importantly, **#219's own argument survives this in its strongest form.**
Its case for WordPress.org rests on two factors, and this measurement touches
only one of them:

- `r` (downloads → distinct adopters): #219 argues `active_installs` is a stock
  of live sites rather than a download flow, a change in *what is being
  counted*. **Untouched by this study.** That argument stands.
- `p` (revenue per payer): grounded in the portfolio's own candidate write-ups.
  **Untouched.**
- The implicit third term — that a cold listing on a business-buyer channel is
  *more likely to be found* — is the one this study tests, and it finds no
  support for it on the two reachable channels nearest to that buyer.

So the honest revision is not "drop Ask 7." It is: **grant it, but score its
expected payoff down, and treat it as a test with a stated prediction rather
than as the regime where the numbers work.**

## The prediction Ask 7 would test

Recorded here so that whoever eventually gets `api.wordpress.org` allowlisted
can check this study rather than re-derive it. If the concentration finding is a
property of free listing channels generally, then in any WordPress.org plugin
category matching the pipeline's candidates:

1. Between one and roughly ten plugins will hold half of the category's total
   `active_installs`.
2. The top 1% of listings will hold more than a third of it.
3. The median listing in the category will have an `active_installs` figure at
   or near the directory's lowest reported bucket.

If (1) and (2) hold, the $980/month model is not wrong about `r` and `p` but is
being applied to a listing the portfolio has roughly a one-in-twenty chance of
becoming (per #218's cold-publisher rate), and Ask 5's payoff stays a rounding
error under the new regime too. If they fail — if WordPress.org's category
demand is genuinely flatter than three package registries' — then the
different-channel hypothesis is vindicated on evidence rather than assumption,
and Ask 2 becomes worth reopening.

## What this does not show

- **RubyGems figures are lifetime downloads**, not monthly: its search API
  publishes no monthly figure. Its concentration is comparable to the other two
  (a share is a share); its levels are not, and no level comparison is drawn
  from it above. Lifetime counts also favour old packages, which if anything
  understates concentration by flattering long-lived also-rans.
- **No leaf filter on RubyGems**, for the same reason — no dependent count is
  exposed. Its populations therefore include libraries pulled in transitively,
  which inflates the top of its distribution. This biases *toward* the finding,
  so it is reported as corroboration and not as an independent replication.
- **Small strata.** The SBOM category has 11 leaves on Packagist and 16 gems on
  RubyGems. At n=11 the "top 1%" is a single package by construction, so those
  cells say only "one package takes most of it" — true, but weakly. The
  accessibility (n=74) and MCP (n=243) Packagist cells carry the weight.
- **Keyword-defined categories**, inherited from the npm study, with the same
  imperfection. `launchdarkly_api` is the largest RubyGems "accessibility" gem
  and is not an accessibility tool; the excluding-top-1 figures exist for
  exactly this, and the shape survives them.
- **Downloads and stars are still not payers.** Nothing here measures
  willingness to pay, on any registry.
- **One snapshot**, on registries whose counts move.

## Files

- `measure_registry_concentration.py` — the harness. Stdlib only, read-only, no
  credentials, paced conservatively. Imports its statistics from
  `measure_listing_demand.py` so the two studies stay comparable by construction.
- `results-cross-registry-2026-08-19.json` — every row behind every number
  above, so the figures recompute without re-fetching.

## Status of these claims

**Primary measurements against live APIs, not secondary-source research.** The
raw rows are committed and the script re-derives the numbers. What is uncertain
is interpretation — specifically whether Packagist's PHP developer is a useful
proxy for WordPress.org's site owner, which the section above deliberately does
not overclaim.

Nothing here adds a candidate, changes a score, creates a `ventures/` directory,
registers an account, publishes anything, or spends anything.
