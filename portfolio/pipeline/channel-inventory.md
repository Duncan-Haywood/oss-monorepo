# Channel inventory: what a listing costs in credentials

Added 2026-08-19 by the tenth firing of the screening brief.

> ⚠️ **Read the amendment at the end of this file before acting on the
> "Recommended next action" section below.** That section tells an agent
> session it may publish a free listing to WordPress.org, Open VSX, or GitHub
> Marketplace at zero cost and with no credential. **Five subsequent runs
> measured those channels directly and all three are unreachable from this
> environment.** The recommendation is superseded, not merely dated — acting on
> it as written produces nothing. See
> [Amendment: the free channels were measured, and the plan does not
> survive](#amendment-the-free-channels-were-measured-and-the-plan-does-not-survive).

**This document adds no candidate.** Per the intake gate in
[CLAUDE.md](../../CLAUDE.md) and the closing instruction in
[distribution-first.md](distribution-first.md) — *"screening is closed"* — a
tenth archetype list would be the failure mode this directory exists to record,
not work. What follows is step 2 of that document's own "what the next screening
pass should do differently": **screen channel-first.** The eighth run applied
that rule once and found one candidate. Nobody ever enumerated the channels.

## Why this was the missing piece

Four consecutive passes have ended on the same escalation: *run one probe to a
real buyer*, blocked because store submission needs developer-account
credentials an unattended agent does not and should not hold.

That escalation contains a conflation, and finding it is the point of this
document:

> **"Run a probe to a real buyer" is two actions, not one.**
>
> 1. **Demand measurement** — publish a listing, see whether anyone searching
>    the category finds and installs it.
> 2. **Revenue capture** — take money from the people who did.
>
> Only the second needs a payout rail. The first has been treated as blocked
> for four cycles because it was bundled with the second.

The distinction matters because the variable this directory says is untested —
*does a listing this portfolio publishes get found at all* — is answered
entirely by (1). Installs, search impressions, and category rank are the
measurement. A dollar changes hands only after that number exists.

## The inventory

Columns are the questions that actually decide, not a generic marketplace
comparison. **"Agent-listable"** asks the operationally load-bearing question:
can a session working from this repo complete the listing without an artifact
that belongs to a legal person — a payment card, a government ID, a
domain, a bank account?

| Channel | Fee to list | Agent-listable | Built-in billing | Searcher holds a budget | Review |
|---|---|---|---|---|---|
| **WordPress.org plugin directory** | Free | **Yes** — WP.org account + 2FA; no card, no ID | No | Mixed (site owners; many are businesses) | Manual, 1–10 days |
| **Open VSX** | Free | **Yes** — Eclipse account + publish token | No | No (developers) | Automated |
| **VS Code Marketplace** | Free | **Mostly** — Microsoft/Azure DevOps publisher account | No | No (developers) | Automated + spot checks |
| **npm / PyPI** | Free | **Yes** | No | No (developers) | None |
| **GitHub Marketplace (free listing)** | Free | **Yes** — free apps may be listed by individuals | No | Partly (developers in orgs) | Manual |
| **Chrome Web Store** | $5 one-time | **Near** — needs a payment card once | Retired; self-bill | Mixed | Manual, days |
| **Shopify App Store** | Free | **No** — Partner account is an identity artifact | **Yes** (Shopify Billing) | **Yes** (merchants) | Manual, strict |
| **GitHub Marketplace (paid listing)** | Free | **No** — org + verified publisher + verified domain + financial onboarding | **Yes** | Partly | Manual |
| **Apple App Store** | $99/yr | **No** — membership + signing identity | **Yes** | Consumer wallet | Manual |
| **Google Play** | $25 one-time | **No** — identity verification | **Yes** | Consumer wallet | Manual |
| **Garmin Connect IQ** | Free | **No** — developer account | Yes, but category is ~free | Consumer wallet | Manual |

The table sorts, roughly, into a gradient nobody had drawn:

- **Free to list, free of credentials, no billing rail.** WordPress.org, Open
  VSX, npm/PyPI, GitHub Marketplace's free tier. An agent can publish here
  today. It cannot charge here at all.
- **Billing rail attached, credentials required.** Shopify, Apple, Google,
  GitHub's paid tier. These are where money is, and every one of them is gated
  on an artifact belonging to a legal person.

There is no cell in the top-right: **no channel lets an unattended agent take
money.** That is not a gap to route around — it is the correct design, and it
is the same boundary the portfolio's own ethics constraints would draw anyway.

## The consequence: the owner ask is one-time, not per-product

Every merchant-of-record option that would sit behind a self-billed channel
(Paddle, Lemon Squeezy, Polar, Stripe) resolves to the same prerequisite: a
legal seller with a bank account and a tax identity. So does every gated
marketplace above. Which means:

> The payout rail is **one owner artifact, established once, shared by all
> eight candidates** — not a separate blocker per product.

This reframes the ask that four cycles have escalated. It has been put to the
account owner as *"submit `world-clock-widget` to the App Store ($99/yr)"* or
*"submit the watch face to Connect IQ"* — per-product work, on two consumer
products the same document concedes are low-ARPU, high-churn, and sold to
someone who controls a wallet rather than a budget. The better-shaped ask is
one payout rail, after which every candidate in this directory can charge
through whichever channel fits it.

And in the meantime, the free half is not blocked at all.

## GitHub's own rule says free-listing-first is the intended sequence

The strongest evidence that this split is real rather than a workaround comes
from GitHub Marketplace's published requirements: a **paid** listing requires
the app to be owned by an organization that is a verified publisher with a
verified domain, *and* to have reached a minimum installation count — reported
as 100 installations for GitHub Apps, 200 users for OAuth apps — before it may
charge.

You cannot start at the paid tier. The platform requires you to publish free,
accumulate demonstrated demand, and only then onboard financially. That is
exactly the sequence this document is arguing for, encoded as a marketplace
rule by a marketplace with every incentive to collect revenue share sooner.

## Mapping the existing candidates onto a channel an agent can reach

No scores are changed here — this is input for the next scoring pass, in the
same style as the amendment table in
[distribution-first.md](distribution-first.md).

| Candidate | Verdict on file | Free, agent-reachable channel? |
|---|---|---|
| [eaa-remediation-pipeline](candidates/eaa-remediation-pipeline.md) | build-now | **Yes.** An accessibility *evidence* plugin in the WordPress.org directory is free to list, needs no card or ID, and its buyer is the same site owner `local-site-studio` targets. This is a real alternative to the "borrow a lead pipeline that does not exist yet" channel the distribution score of 8 currently assumes |
| [shopify-a11y-evidence](candidates/shopify-a11y-evidence.md) | probe | **No** (corrected below — the WordPress.org substitute this row originally proposed is itself unreachable; see the amendment) |
| [cra-evidence-desk](candidates/cra-evidence-desk.md) | build-now | **Yes.** SBOM/CRA evidence is a natural GitHub Action; free listing on GitHub Marketplace is open to individuals, and the 100-install threshold doubles as the go/no-go number |
| [mcp-supply-chain-watch](candidates/mcp-supply-chain-watch.md) | probe | Yes (npm/PyPI/GitHub) — but this is the candidate `distribution-first.md` already flagged against the "<5% of MCP servers monetise" figure. A free listing measures interest without contradicting that caution |
| [public-record-watch](candidates/public-record-watch.md) | probe | No obvious one. Its verticals' channels are practice-management app stores, all gated |
| [agent-permission-harness](candidates/agent-permission-harness.md) | park | Not relevant while parked |
| [tender-radar](candidates/tender-radar.md) | park | No — correctly parked pending a channel partner |
| [einvoice-preflight](candidates/einvoice-preflight.md) | reject-broad | Not relevant |

Three of the eight have a channel an agent can publish into this week for $0.

## What this does and does not license

**Does:** an agent session may build and publish a *free* listing on one of the
top-gradient channels, purely to measure whether a cold listing from this
portfolio gets found, provided it makes no compliance claim, collects no
payment, gathers no personal data, and carries the same evidence-not-advice
positioning every candidate here is already narrowed to. That work needs no
credential and spends no capital beyond agent time.

**Does not:** it does not license adding a candidate, opening a
`ventures/` directory, registering any account that requires a payment
method or an identity document, or accepting money by any route. It also does
not license publishing under any identity that implies the account owner
reviewed it — a free listing is still a public artifact with this portfolio's
name adjacent to it, so the *decision to publish at all* is flagged below
rather than assumed.

## Recommended next action

1. **Account owner, one decision, one time:** establish a single payout rail.
   That unblocks charging for all eight candidates and is strictly more
   valuable than either per-product store submission currently on the list.
2. **Account owner, one approval:** whether an agent session may publish a free
   listing under this portfolio's name at all. If yes, the demand measurement
   this directory has wanted for four cycles can run without you and without
   spend.
3. **Agent sessions, if (2) is approved:** pick the highest-ranked candidate
   with a free channel, publish the smallest honest version, and record
   installs and search impressions against a date in the ledger. That number
   re-scores the distribution column for this entire directory — upward if a
   cold listing gets found, downward if it does not.

Note that (1) and (2) are independent. (2) alone is enough to produce the
measurement, and (2) costs nothing.

## Status of the claims

Same standard as the rest of this directory: **secondary sources, gathered
2026-08-19, unverified against primary ones**, recorded at the confidence they
were gathered at — good enough to rank channels against each other, not good
enough to spend against.

Two specific cautions:

- The GitHub Marketplace free/paid split and the 100-installation minimum are
  load-bearing for the argument above and are taken from search summaries of
  `docs.github.com`. **The primary page could not be read from this session** —
  `docs.github.com` is blocked by this environment's network egress proxy.
  Confirm against the live requirements page before acting.
- Fees, review times, and identity requirements change without notice, and
  several sources here are vendor blogs. Every number in the inventory should
  be re-checked against the channel's own current terms before anyone registers
  anything.

## Sources

- [Chrome for Developers — register your developer account](https://developer.chrome.com/docs/webstore/register)
- [GitHub Docs — requirements for listing an app on GitHub Marketplace](https://docs.github.com/en/apps/github-marketplace/creating-apps-for-github-marketplace/requirements-for-listing-an-app) (blocked from this session; read via search summary)
- [GitHub Docs — pricing plans for GitHub Marketplace apps](https://docs.github.com/en/apps/github-marketplace/selling-your-app-on-github-marketplace/pricing-plans-for-github-marketplace-apps)
- [WordPress Plugin Handbook — the plugin directory](https://developer.wordpress.org/plugins/wordpress-org/)
- [Freemius — how to submit plugins to the WordPress.org repository](https://freemius.com/blog/submit-plugin-wordpress-repository/)
- [Eclipse Foundation — Open VSX, a free marketplace for VS Code extensions](https://newsroom.eclipse.org/news/community-news/eclipse-open-vsx-free-marketplace-vs-code-extensions)
- [Shopify — App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)
- [Shopify — revenue share for App Store developers](https://shopify.dev/docs/apps/launch/distribution/revenue-share)
- [Lemon Squeezy — merchant of record](https://docs.lemonsqueezy.com/help/payments/merchant-of-record)

---

## Amendment: the free channels were measured, and the plan does not survive

Added 2026-08-19 by the fourteenth firing of the screening brief. **No candidate
added, no score changed** — the intake gate in [CLAUDE.md](../../CLAUDE.md)
applies to this run and was obeyed.

This document's central move was to split "run a probe to a real buyer" into
demand measurement (free, uncredentialed) and revenue capture (gated), then
observe that the free half "is not blocked at all." That decomposition is
correct and remains the most useful idea in this directory. **Its factual
premise is not.** Every channel it nominated was assumed reachable from a
secondary source; none was probed. Five runs then probed them.

The corrections below are primary measurements taken from this environment on
2026-08-19, recorded in `portfolio/research/` alongside the probe scripts and
raw results. They supersede the table and the recommended-next-action section
above wherever they conflict.

### What was refuted

| Claim above | Measured |
|---|---|
| WordPress.org — "free, agent-listable, **Yes**" | `EGRESS_DENIED` on all three of its read, register, and publish hosts |
| Open VSX — "free, agent-listable, **Yes**" | `EGRESS_DENIED` |
| VS Code Marketplace — "**Mostly**" | `EGRESS_DENIED` |
| GitHub Marketplace free tier — "**Yes**, may be listed by individuals" | `SCOPE_DENIED` — the host answers; this session's GitHub app scope is bound to `duncan-haywood/monorepo-projects` and refuses the route |
| npm / PyPI — "free, agent-listable, **Yes**" | npm's account cannot be created from here; PyPI's publish host is denied, and its API returns `-1` for every download field (counts disabled upstream) |
| The four payout rails, "interchangeable for this purpose" | All four `EGRESS_DENIED`. Extended to 13 rails: 11 egress-denied, 2 scope-denied, **0 usable** |
| Shopify App Store — "Partly agent-reachable via a WordPress.org substitute listing" (mapping table below, original text) | `EGRESS_DENIED` on `apps.shopify.com` itself (confirmed in [`egress-reachability/`](../research/egress-reachability/), `Tunnel connection failed: 403 Forbidden`) — and the WordPress.org substitute this row proposed is *also* `EGRESS_DENIED`, per the first row of this table. Both halves of the "Partly" verdict are gone; it is **No**, not partial, for demand measurement as well as for listing |

So the sentence *"an agent can publish here today"* was true of no channel in the
top gradient, and *"(2) alone is enough to produce the measurement, and (2) costs
nothing"* is the load-bearing error: permission was never the binding constraint.
Granting it as written would have bought nothing.

### What replaced it

The same runs found channels that *are* reachable, and narrowed the ask four
times. The current version is materially cheaper than the one this document
proposed, and it is tracked as **Ask 0** in
[issue #139](https://github.com/Duncan-Haywood/monorepo-projects/issues/139),
the account owner's decision queue:

> **Ask 0 (amended).** One free account signup and a scoped publish token on
> **Packagist or RubyGems** (preferred), or crates.io / Hex. **Not Docker Hub** —
> 98.2% of its `mcp` category pulls sit in Docker's own closed, verified-publisher
> `mcp/` namespace, so an outside listing would measure namespace obscurity
> rather than demand. **Not** NuGet (publish host reachable, statistics host
> denied) and **not** the Go-module route (no download count exists to read, at
> any permission level). No egress change, no payment rail, no card, no domain.

Two general rules came out of this that belong in the next scoring pass:

- **Score a channel on its `publish` surface, not its `read` surface.** A
  registry that answers a metadata query is not a channel. The upload host and
  the account-creation host routinely differ, and in this environment they
  routinely differ in verdict.
- **Then score it on its `stats` surface, and check the count exists at all.** A
  channel you can publish to but cannot measure is a distribution channel, not a
  probe. Two channels this portfolio was ready to spend its measurement on
  publish no number, and no permission grant changes that.

### One correction that cuts the other way

`EGRESS_DENIED` is a **setting the account owner controls**, not a structural
impossibility. Twenty-four of the thirty-one hosts probed are one allowlist entry
away. Several things earlier runs recorded as "impossible" are better described
as *unapproved*, and the distinction is what makes the asks in issue #139 costable
rather than aspirational.

### Where the evidence lives

| Run | Directory | Established |
|---|---|---|
| #126 | `portfolio/research/agent-reachability/` | 33 targets probed; the payout-rail ask is under-specified — a credential without a paired egress change buys nothing |
| #130 | `portfolio/research/monetization-reachability/` | 0 of 13 rails usable, failing on two distinct switches; GitHub's two fail on the cheaper one |
| #137 | `portfolio/research/publish-reachability/` | Every nominated free channel denied; 8 others publishable; proposed Ask 0 |
| #150 | `portfolio/research/demand-signal-reachability/` | Publishing is not measuring — 3 of Ask 0's 8 channels cannot produce the number; adds Ask 3 |
| #155 | `portfolio/research/registry-audience-match/` | Ask 0's registries are not interchangeable; Docker Hub off the menu |

Each directory carries its probe script and raw results. The scripts are
read-only, stdlib-only, take no credentials, and support `--recompute-from` so
the summary can be re-derived from saved data with no network access.

### The caution this run would pass on

This document was written from secondary sources and labelled as such, and then
five runs spent their budget discovering that its cheerful half was wrong. The
labelling worked exactly as intended — nothing was spent on the bad premise
except the measurement that caught it. What did not work is that the correction
sat in five unmerged pull requests while the refuted recommendation was the
version on `main`. A fresh session reading this directory would have acted on
the version that does not work.

That is the same failure the provenance section of
[README.md](README.md) records at length: **research that never lands leaves the
next run no way to know the question was answered.** It cost thirteen firings
once. This amendment exists so it does not cost more.

### Re-verified first-hand, 2026-08-20

Added by a later firing of the screening brief, which read this file **from
`main`** at the start of its run — where the amendment above was not yet
present — and was told by the "Recommended next action" section that the free
half "is not blocked at all." That is the failure the paragraph above predicts,
observed live rather than anticipated.

Before landing the correction, that run re-probed the two load-bearing hosts
directly rather than trusting the table above:

| Host | Result | Interpretation |
|---|---|---|
| `api.wordpress.org` | `curl: (56) CONNECT tunnel failed, response 403` | Denied at the proxy's CONNECT, before TLS |
| `open-vsx.org` | `curl: (56) CONNECT tunnel failed, response 403` | Same |
| `example.com` (control) | `curl: (56) CONNECT tunnel failed, response 403` | Same — so the denial is the general-web policy, not these channels |
| `registry.npmjs.org` | `HTTP 200` | Package-registry infrastructure is allowed |
| `pypi.org` | `HTTP 200` | Same |
| `api.github.com/marketplace_listing/plans` | `HTTP 403` | Host reachable; the app scope refuses the route — `SCOPE_DENIED`, not egress |

The signature is identical to the control, which is what distinguishes a proxy
egress denial from an origin refusal. The amendment above is confirmed on a
second date, by a separate run, on a fresh checkout.

**One consequence for the decision queue.** Ask 5 in
[issue #139](https://github.com/Duncan-Haywood/monorepo-projects/issues/139)
asks the account owner to approve an agent session publishing a free listing.
The measurements above say approving it as written buys nothing: there is no
free channel this environment can reach to publish to. Ask 5 is not expensive,
but it is currently *inert* — Ask 0 (one registry signup, no egress change) and
Ask 7 / Ask 3 (the general-web egress decision) are what would make it do
anything.
