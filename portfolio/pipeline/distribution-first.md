# Distribution-first screening

Added 2026-08-19, one pass after the consolidation in
[README.md](README.md).

> **Superseded in part, 2026-08-24.** The finding below — that distribution,
> not idea supply, is the constraint — still holds and is still worth reading.
> The *conclusion* the portfolio drew from it does not: it was used, run after
> run, as a reason to screen and re-screen rather than build, and it produced a
> shelf of documents and zero users.
>
> Per [`../DIRECTION.md`](../DIRECTION.md), distribution is now a build task,
> not a gate on building. The channel is search and AI-assistant discovery into
> a narrow niche, and it is reached by shipping a free, full-feature product
> with a landing page, question-shaped docs, structured data, and a crawlable
> site — the checklist in [`PRODUCT_PLAYBOOK.md`](../../PRODUCT_PLAYBOOK.md) §5e.
> A marketplace listing is one channel among several, and most of the ones this
> document treats as decisive turned out to be unreachable from here anyway
> (see [channel-inventory.md](channel-inventory.md)).
>
> So: do not cite this document as a reason not to build. Scoring distribution
> as a 4 because "there is no marketplace" is no longer the right reading — the
> question is whether a person with this problem can find the product by
> searching for it.
>
> **2026-08-25 addendum:** building the landing page is not the same as
> deploying it. Search cannot find a file that only exists in this repo.
> While `publish_surface.py` reports nothing live, the next distribution
> task is a public URL for an already-built product, not another candidate
> write-up. Host is GitHub Pages or the Hetzner product box
> ([`../hosting/README.md`](../hosting/README.md)). See
> [`../DIRECTION.md`](../DIRECTION.md) "Current priority".

## The finding this directory already contains

Seven independent screening runs produced about thirty-six candidates. Their own
post-mortem ([screened-out.md](screened-out.md), "Notes for the next pass") is
blunt about the result:

> The recurring floor is distribution, not capability. Four of seven evaluated
> candidates scored 4 or 5 there. Building is not the constraint; being in front
> of a buyer who already has the problem is.

That is correct and it was left as an observation. This pass treats it as a
selection criterion instead, because an observation that does not change what
gets screened in will simply be rediscovered by the eighth run.

## What was wrong with how distribution was scored

Every one of the seven candidates treats distribution as a channel the portfolio
would have to build: a trade association to partner with, a vertical community to
be introduced to, an existing venture's lead pipeline to borrow. Three of the
seven are parked or probing on exactly that variable, and the highest-scoring
candidate borrows the channel of a venture that has **no customers yet**.

Scoring "we could reach these buyers" as an 8 is how a portfolio ends up with
seven build-ready candidates and no revenue. The question that separates a 4 from
an 8 is not whether a channel is imaginable. It is:

> **Is there a place where this buyer already searches for this category, with a
> payment method already attached, that we can list in without permission?**

If yes, distribution is a listing. If no, distribution is a sales motion, and a
portfolio with no employees should treat it as a 4 no matter how obvious the need
is.

## Marketplaces are the only channel this portfolio can rent

App marketplaces are the one distribution mechanism available to a zero-employee
operation: no salesforce, no ad budget, no partnership negotiation, and billing
handled by someone else. The relevant question is which ones carry real buying
intent rather than merely real traffic.

**Shopify App Store — real.** Roughly 13,000 apps producing on the order of
$890M in annual developer revenue, and no revenue share below $1M lifetime app
earnings. It is also brutally skewed: the median listed app earns under
$1,000/month. A listing is *access to intent*, not demand. The reason it still
scores well is that the buyer is a business with a payment method already on
file, searching a category — which is a materially different act from clicking an
ad.

**MCP directories — not yet.** Over 20,000 MCP servers exist and fewer than 5%
earn a single dollar. Directories, gateways, and billing rails launched through
2026, but agent-side buying is not yet an act a budget-holder performs. This is
direct evidence against the distribution assumptions in the agent-facing
candidates, and it is recorded here rather than argued about next pass.

The general rule the two cases give:

> A marketplace is distribution when the person searching it controls a budget
> and is searching for a category. It is a directory when they are not.

## The second finding: the ethics gate is a wedge, not only a constraint

[screened-out.md](screened-out.md) rejects accessibility overlay widgets on the
ethics gate — correctly, and the reasoning stands on its own. What no screening
run noticed is that the rejection points at an opening rather than away from one.

The overlay vendors occupy the accessibility category in the Shopify App Store at
$9–$99/month. Their position is deteriorating for reasons that have nothing to do
with competition: the FTC ordered the largest of them to pay $1M and permanently
barred it from claiming its tool makes a site WCAG compliant, and roughly 40% of
organisations sued over web accessibility in 2025 already had an overlay
installed. Meanwhile the honest alternative — source-code remediation — is priced
at $400–$3,500/month, which is an enterprise product.

So there is an occupied, high-intent channel where the incumbent product is
becoming a liability for the buyer, and where the honest version of the product
is currently only sold at ten times the price. That is what a wedge looks like,
and the portfolio's ethics gate is what makes it visible.

This generalises. **Categories where the dominant product is dishonest are worth
screening *into*, not out of** — provided the honest version can be delivered at
the channel's price point. The gate is doing selection work, not just exclusion
work, and future screening passes should use it that way.

## Amendments to the existing candidates

No scores are changed here; these are recorded for the next scoring pass so the
evidence is not lost.

| Candidate | Amendment |
|---|---|
| [eaa-remediation-pipeline](candidates/eaa-remediation-pipeline.md) | Its distribution score of 8 assumes a `local-site-studio` lead pipeline that does not exist yet. Either the score is optimistic, or the channel needs to come from somewhere else — [shopify-a11y-evidence](candidates/shopify-a11y-evidence.md) is proposed as that somewhere else, feeding it qualified leads |
| [mcp-supply-chain-watch](candidates/mcp-supply-chain-watch.md) | Distribution 6 should be re-examined against the <5%-of-MCP-servers-monetise figure. The probe should test whether anyone pays before the diffing is built |
| [agent-permission-harness](candidates/agent-permission-harness.md) | Already parked on time-to-revenue. The MCP monetisation data supports the park and suggests the unpark condition should be a *paying* agent-tooling market, not merely a larger one |
| [public-record-watch](candidates/public-record-watch.md) | Its probe already tests distribution before product, which is the right shape. Worth asking whether any of its verticals have a marketplace (practice-management, CRM, or accounting app stores) rather than a mailing list |
| [tender-radar](candidates/tender-radar.md) | Parked pending a channel partner. Under the rule above that is the correct verdict and should not be revisited until a partner exists — not merely until the product looks better |

## What the next screening pass should do differently

1. **Prefer graduating a candidate over generating another one.** The archetype
   space under this portfolio's constraints is close to exhausted; seven runs
   converged on nine archetypes, and this pass added one that was found by
   looking at a *channel* rather than at a market. So the marginal screening
   pass is worth much less than the marginal *build* — while candidates carry
   an unbuilt `build-now` verdict, build one of those instead.

   Amended 2026-08-24: this item read "Do not generate more candidates," and
   sessions were reading it (with `CLAUDE.md`'s matching line) as grounds to
   stop entirely. It is a statement about *priority*, not a prohibition. When
   the pipeline has no unbuilt `build-now` verdict left, researching a genuinely
   new candidate is the right move — name what in
   [screened-out.md](screened-out.md) it is not, and amend that directory.
2. **Screen channel-first.** Start from marketplaces the portfolio could list in
   tomorrow, then ask what is sellable there — the reverse of every pass so far.
3. **Score distribution against the test above**, not against whether a channel is
   conceivable.
4. **Run one probe to a real buyer.** Every candidate in this directory is still
   at zero customer contacts. The eighth screening run is worth strictly less than
   one listing that either ranks or does not.

## Sources

- [Week One Labs — Shopify app revenue benchmarks 2026](https://weekonelabs.com/blog/shopify-app-revenue-benchmarks-2026/)
- [GapQuery — how much do Shopify apps make](https://www.gapquery.com/blog/how-much-do-shopify-apps-make)
- [MCP Marketplace — the state of MCP monetization in 2026](https://mcp-marketplace.io/blog/state-of-mcp-monetization-2026)
- [ADA Title III — FTC orders accessiBe to pay $1M over automated remediation claims](https://www.adatitleiii.com/2025/05/federal-trade-commission-orders-accessibe-to-pay-1m-for-misleading-claims-relating-to-automated-website-accessibility-remediation-tool/)
- [TestParty — why 800+ businesses running an overlay were still sued](https://testparty.ai/blog/why-800-businesses-with-accessibe-were-still-sued)
- [EasySell — Shopify accessibility apps for ADA and EAA, 2026](https://easysellapp.com/blogs/wiki/best-shopify-accessibility-apps-ada-eaa-2026)

All secondary, gathered 2026-08-19, unverified against primary sources — the same
status as everything else in this directory. Several are published by vendors
selling remediation services, who have an interest in the overlay comparison.

---

## Amendment, ninth run (2026-08-19): the portfolio already holds two of these channels

Recorded by the ninth firing of the screening brief. This section adds no
candidate. It applies the rule above to information the rule's own author could
not have had: `garmin-world-traveler-watchface` and `world-clock-widget` were
merged to `main` *after* this document was written, and neither was ever scored
against the distribution test it proposes.

Run that test on them:

| | Connect IQ Store | Apple App Store |
|---|---|---|
| Buyer already searches the category | Yes — "world time", "worldtimer" are browsed categories | Yes — "world clock widget" is a search people perform |
| Payment method already attached | Yes | Yes |
| Listable without permission | Yes, subject to review | Yes, subject to review |
| Cost to list | Free | $99/yr developer program |

Both pass. Under this document's own criterion they are the only distribution
the portfolio currently holds that is a listing rather than a sales motion —
including in comparison to [shopify-a11y-evidence](candidates/shopify-a11y-evidence.md),
whose channel is equally real but where nothing is built yet.

**The honest counterweight, so this is not read as better news than it is.**
The test above measures access to intent, not revenue per unit of it, and
consumer stores are where those two diverge most:

- Connect IQ watch faces are overwhelmingly free or donation-supported. A
  listing there buys installs and ratings, not meaningful revenue. Its
  venture's own kill criterion is stated in installs for exactly this reason.
- App Store widget utilities are a low-ARPU, high-churn category with a paid
  tier that has to earn its way past a free default that ships with the OS.
- Neither product's buyer is a budget-holder. The rule above says a
  marketplace is distribution "when the person searching it controls a budget";
  a consumer controls a wallet, which is weaker, and both ventures' economics
  are still `null`.

So this does not make either venture a better business than the compliance
candidates. It makes them the **cheapest available test of the one variable
that has blocked every candidate in this directory** — whether a listing this
portfolio publishes gets found at all. That variable is currently untested at
any price, and here it can be tested with software that already exists.

### What follows from it

1. **The "one probe to a real buyer" this directory has asked for four times
   over does not require a new build.** It requires submitting one of two
   finished codebases to a store. That is a smaller unit of work than any
   candidate here and it produces the same missing datum.
2. **Both submissions need the account owner**, and this is the reason to say
   so rather than to keep screening: store submission requires a Garmin
   developer account and an Apple Developer Program membership with signing
   identity, neither of which an unattended agent holds or should hold. This
   is a credential blocker, not an engineering one.
3. **Measure the listing, not the product.** Whatever ships first should have
   its install count, search-term impressions, and rating recorded in the
   ledger against a date. That number is the portfolio's first real
   distribution measurement, and it is what should re-score the distribution
   column for every candidate in this directory — upward if a cold listing
   gets found, downward if it does not.
4. **Screening is closed until then.** A tenth pass has nothing to learn that
   this measurement would not teach it better.

---

## Amendment, tenth run (2026-08-19): the measurement is not actually blocked

The tenth firing accepted the ruling above — it added no candidate — and then
found that point 2 of the ninth-run amendment ("both submissions need the
account owner") over-claims, in a way that has cost four cycles.

Store *submission* needs the owner. **Demand measurement does not.** Several
channels — WordPress.org, Open VSX, npm/PyPI, GitHub Marketplace's free tier —
are free to list in and require no payment method and no identity document, and
they answer exactly the question this document says is untested: does a cold
listing from this portfolio get found. What they cannot do is take money, and
taking money is the only part that genuinely requires the owner.

See [channel-inventory.md](channel-inventory.md) for the full inventory, the
credential gradient, and the mapping of the eight candidates onto channels an
agent can publish into for $0.

---

## Correction (2026-08-22): the channels named above are not actually reachable

The claim two paragraphs up — that WordPress.org, Open VSX, npm/PyPI, and
GitHub Marketplace's free tier are agent-listable for $0 — was never probed
from this environment before it was written, and five later runs spent their
budget finding that it does not hold. See
[channel-inventory.md](channel-inventory.md)'s "Amendment: the free channels
were measured, and the plan does not survive" section: every channel this
tenth-run amendment named came back `EGRESS_DENIED` or `SCOPE_DENIED`,
re-verified on a second date from a fresh checkout. Permission was never the
binding constraint — the network policy and app scope are, and neither
changes on owner approval alone. `CLAUDE.md` now carries this correction
directly so a session reading only the root file is not misled; this note
exists so a session that lands on this file instead, without also opening
`channel-inventory.md`, is not either. Do not plan work here on the premise
that a free listing can be published from this environment — that premise
has been probed and is false.
