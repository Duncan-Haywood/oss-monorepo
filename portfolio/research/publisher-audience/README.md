# Does the audience come before the listing?

**Measured 2026-08-19. Primary measurements against the public npm registry,
reproducible from this repo.**

`portfolio/research/free-listing-demand/` measured what a cold free listing
gets in this portfolio's candidate categories, found demand concentrated into
the top few percent, and closed on a claim it did not test:

> "on these channels, publishing is not distribution ... the scarce thing to
> spend an approval on is a referral path, not a listing."

That is an assertion about *why* the top of the distribution is the top. This
directory tests it on the one attribute of a referral path measurable from a
public API with no credentials: **did the publisher already have an audience?**

**Answer: mostly yes — but not exclusively, and the exception is the finding.**
A cold publisher's odds of landing in a category's top decile are about
**4.9%**, against **16.2%** for a publisher who already has a package with
real usage. That is a **3.3× handicap, not a closed door**: 54 of the 198
top-decile listings measured here (27%) were published by someone whose entire
other portfolio is under 1,000 downloads a month.

## Why this and not another measurement

The prior study's conclusion has a policy consequence: if publishing genuinely
cannot create demand, then the free-listing approval `channel-inventory.md`
asks the account owner for is worth nothing, and the portfolio should spend the
ask on a referral path instead. That is a real decision, and it was resting on
an untested inference from a concentration curve. A concentration curve says
demand is unequal; it does not say what makes the difference.

This measurement discriminates. If cold publishers are common at the top, a
listing can create its own demand and the prior conclusion is too pessimistic.
If they are rare, the audience precedes the listing and no amount of listing
work substitutes for one.

## Method

Same three categories, same queries, same relevance and artifact filters, and
the same leaf definition (`dependents == 0`) as
`free-listing-demand/measure_listing_demand.py` — the leaf counts came out
identical (606 / 972 / 403 against the prior run's 606 / 970 / 402, the
two-package drift being ordinary registry movement), so the populations are
comparable. Two things are added:

- **Maintainer capture.** The prior run discarded the `maintainers` field the
  search API already returns. It is what makes this study possible.
- **Publisher portfolios.** For each sampled listing, every maintainer is
  looked up with `maintainer:<username>` and their whole published portfolio
  retrieved with download counts. A publisher's **audience** is the largest
  monthly download count among their packages *other than* the sampled one.
  984 distinct publishers were looked up.

Two strata per category: **found** (the top decile of leaves by monthly
downloads) and **baseline** (a seeded random sample of up to 60 leaves from the
remaining 90%). A **cold publisher** is one whose largest other package is
under 1,000 downloads a month.

## Findings

### 1. Audience and being found are strongly associated

| Category | stratum | n | cold publisher | publisher ≥10k/mo | median publisher audience | median listing |
|---|---|---:|---:|---:|---:|---:|
| SBOM / CRA evidence | **found** | 40 | **15.0%** | 70.0% | 835,033 | 10,498 |
| | baseline | 60 | 65.0% | 21.7% | 339 | 50 |
| MCP supply chain | **found** | 97 | **25.8%** | 64.9% | 64,824 | 60,434 |
| | baseline | 60 | 46.7% | 38.3% | 2,300 | 2,183 |
| Accessibility evidence | **found** | 61 | **37.7%** | 41.0% | 5,425 | 9,821 |
| | baseline | 60 | 63.3% | 11.7% | 497 | 117 |

The median top-decile SBOM listing is published by someone with an
835,000-downloads-a-month package elsewhere. The median non-top-decile SBOM
listing is published by someone whose best other package gets 339.

### 2. Inverted, this is the number a cold entrant should plan against

The strata above are conditioned the wrong way round for decisions — they say
what a *found* listing looks like. Inverting them against the sampling weights
(the found stratum is 10% of leaves, the baseline the other 90%) gives what
this portfolio actually needs:

| Category | P(top decile \| cold publisher) | P(top decile \| publisher with audience) | handicap |
|---|---:|---:|---:|
| Accessibility evidence | 6.2% | 15.9% | 2.6× |
| MCP supply chain | 5.8% | 13.4% | 2.3× |
| SBOM / CRA evidence | **2.5%** | 21.2% | **8.5×** |
| **Pooled** | **4.9%** | **16.2%** | **3.3×** |

A cold listing is not hopeless — roughly one in twenty reaches the top decile of
its category — but it is materially disadvantaged, and the disadvantage is
worst in exactly the category this portfolio rates "build now."

### 3. The handicap tracks how organised the buyer is

The gradient across the three categories is the most useful part of this
result, because it is a property this portfolio can select on rather than
just accept:

- **SBOM/CRA (8.5× handicap)** is dominated by organisations. Four of its top
  five leaf listings are `@cdxgen/*` and `@appthreat/*` packages sharing one
  publisher's 835k-a-month audience, and the single largest
  (`@datadog/datadog-ci-plugin-sbom`, which the prior study found holds 56.5%
  of category demand on its own) belongs to a publisher with a 46.6M-a-month
  package. Only 2.5% of the category's cold listings break through.
- **Accessibility evidence (2.6×)** is the friendliest to a cold entrant, and
  it is also the category with the most individual maintainers rather than
  vendor scopes (39% scoped vs 58% for SBOM, 68% for MCP).

**For a portfolio that is a cold publisher by definition, category choice is
worth more than listing quality.** The pipeline currently ranks
`cra-evidence-desk` "build now" and `eaa-remediation-pipeline` "build now"; on
this evidence the accessibility candidate is roughly 3× easier to get found in
than the CRA one, which cuts against the CRA candidate's already-floor-level
defensibility score of 4.

### 4. Cold winners exist, and they look like a category, not luck

The 54 cold-publisher listings in the found stratum are not noise. Examples:
`jasmine-axe` (71k/mo, publisher has no other package at all), `n8n-mcp`
(590k/mo, likewise), `accented`, `react-native-accessibility-engine`,
`rollup-plugin-sbom`, `sha1-hulud-scanner`. What they share is that each is a
**narrow tool attached to something people already use** — a test-framework
adapter, a bundler plugin, an integration for a named product — rather than a
general-purpose entry in the category. That is a referral path in the sense the
prior study meant, but a cheap one: it borrows an existing tool's audience
instead of an existing company's.

This is a hypothesis generated by the data, not tested by it. It is the
cheapest thing left to test, and it is testable the same way this was.

## What this changes

**It softens, but does not overturn, the prior study's conclusion.** "Publishing
is not distribution" is right in the sense that a listing alone buys a ~5%
shot; it is wrong if read as "a cold listing cannot get found," which is what
"the scarce thing is a referral path, not a listing" implies if applied
literally. The free-listing approval is worth something — about a third of what
it would be worth to a publisher with an audience.

**It does not license publishing anything.** The account-owner approval
`channel-inventory.md` asks for (whether an agent session may publish under
this portfolio's name at all) is still not given, and is still not on issue
#139's ask table. Nothing was published, no account was registered, no
credential was used.

## Channel reachability: a separate, harder blocker found in passing

`check_channel_reachability.py` tests whether the channels
`channel-inventory.md` recommends can be reached from an agent session at all.
They largely cannot:

| Outcome | Hosts |
|---|---|
| **reachable** | `registry.npmjs.org`, `pypi.org` |
| **egress-denied** (proxy answers 403 to CONNECT) | `api.wordpress.org`, `wordpress.org`, `plugins.svn.wordpress.org`, `open-vsx.org`, `marketplace.visualstudio.com`, `docs.github.com`, `euvd.enisa.europa.eu`, `api.osv.dev` |

Three consequences, none of which were on file:

1. **"Agent-listable" and "agent-reachable" are different properties.** Of the
   four free channels `channel-inventory.md` names, an agent session here can
   reach one and a half. WordPress.org — the channel it maps *both*
   accessibility candidates to, and the only one whose buyer is a business —
   cannot be read, let alone published to.
2. **WordPress.org's per-plugin `active_installs` is a public API.** The prior
   study recorded "none of them publishes a comparable per-listing usage figure
   through an API reachable from this environment" — correct as stated, but the
   cause is this environment's egress policy, not the channel. Allowlisting
   `api.wordpress.org` read-only would let the business-buyer channel be
   measured the same way npm just was. That is a cheaper owner ask than any
   currently on #139, and it is the same shape as Ask 3.
3. **`cra-evidence-desk`'s wedge is untestable from here.** Its write-up rests
   on EUVD matching being the differentiator; `euvd.enisa.europa.eu` and
   `api.osv.dev` are both denied, so no session can check whether EUVD carries
   anything OSV does not. Combined with finding 3 above, the CRA candidate is
   the pipeline's hardest to validate *and* its hardest to get found in.

## Files

- `measure_publisher_audience.py` — the harness. Stdlib only, read-only, no
  credentials, paced inside the search API's rate limit.
- `results-2026-08-19.json` — every sampled listing with its maintainers,
  portfolio size, and largest other package, so the figures recompute without
  re-fetching.
- `check_channel_reachability.py` / `channel-reachability-2026-08-19.json` —
  the egress check above.

## Status of these claims

**Primary measurements against a live API, not secondary-source research.** The
raw rows are committed and the scripts re-derive the numbers. What is uncertain
is interpretation, and specifically:

- **Association, not precedence.** Portfolio download counts are current, not
  as-of the sampled listing's first publish, so a maintainer whose big package
  came *later* counts as having had an audience. This bounds the cold-publisher
  share from above — the direction that matters, since even this generous
  measure finds cold publishers in the minority at the top.
- **npm only**, and npm's buyer is a developer. The category where the buyer is
  a business (WordPress.org) is exactly the one egress-blocked above.
- **Small strata.** The SBOM found stratum is n=40 and its 8.5× handicap is the
  least stable number here; the pooled 3.3× rests on n=198 / n=180.
- **Keyword-defined categories.** A few incidental matches survive the relevance
  filter — `ytconv` in the SBOM found stratum is not an SBOM tool, and
  `claude-cup`, the largest MCP listing, is a contest tracker (the prior study
  flagged it too). Both are counted as cold publishers, which if anything
  inflates the cold share.
- **Downloads are not users, and users are not payers.** Nothing here measures
  willingness to pay.

Nothing here adds a candidate, changes a score, creates a `ventures/`
directory, or spends anything.
