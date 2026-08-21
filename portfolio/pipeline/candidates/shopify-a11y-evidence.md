# Candidate: Shopify accessibility evidence app

**One line.** A Shopify App Store listing that scans a merchant's own storefront
against WCAG 2.2 AA, explains each blocking issue in the merchant's own theme
files, and keeps a dated, exportable evidence record — sold self-serve by
subscription, with no overlay and no compliance claim.

**Verdict: probe.** The product is a narrower, cheaper thing than
[eaa-remediation-pipeline](eaa-remediation-pipeline.md); the reason to run it is
not the product, it is the **channel**. See
[distribution-first.md](../distribution-first.md) for why that is the variable
worth testing.

Scored 2026-08-19. Composite 7.25 · floor 4 (defensibility).

| Dimension | Score | Why |
|---|---|---|
| AI leverage | 7 | Detection is largely deterministic rule engines (axe-core and similar); the model work is triage, plain-language explanation, and generating theme-level patches. Lower than it looks because the scanning half is not model work |
| Autonomous ops | 9 | Self-serve install, self-serve billing through Shopify, no contractor in the loop at the base tier. Support is the only human queue |
| Time to revenue | 5 | App Store review plus the time a new listing needs to surface in category search. Weeks, not days — this is the price of renting distribution instead of owning it |
| Gross margin | 9 | Scan compute, inference, hosting. Shopify's published developer terms waive revenue share below $1M lifetime app revenue (secondary sources; unverified — see below) |
| Defensibility | 4 | The scan is commodity and the category is crowded. What accrues is per-store re-test history and a Liquid-theme fix library, neither of which is the sale on day one |
| Distribution | 8 | Merchants search the App Store for "accessibility" with budget already attached — the incumbents' install counts prove the search intent exists and converts to paid |
| Liability containment | 7 | Higher than the services version: nothing is applied to a live storefront without the merchant acting, the deliverable is a record rather than a warranty, and the app requests no customer or order data |
| Ethical robustness | 9 | This is the honest version of a product category whose dominant vendor was ordered by the FTC to stop claiming its tool makes sites compliant |

## Why this and not just the services version

[eaa-remediation-pipeline](eaa-remediation-pipeline.md) is the stronger business
per customer: higher price, human-verified, defensible record. Its scored
distribution of 8 rests on `local-site-studio` "already talking to this buyer" —
but that venture has no customers yet, so in practice its channel is outbound to
shops that have received a warning letter, which the portfolio has no list of.

This candidate inverts that. It does not find the buyer; it stands where the
buyer already looks. A merchant who has just been told they have a problem
searches their own app store first, and that search already converts to paid
subscriptions today at $5–$99/month.

**The two compose.** The app's own scan output identifies the merchants with
blocking issues that self-serve fixes cannot close — which is the qualified lead
list the remediation pipeline currently lacks. Run this way, the app is not a
competing candidate, it is the remediation pipeline's missing distribution.

## What is sold

Subscription, three things, in this order of importance:

1. **A dated evidence record.** What was tested, with what, on what date, what
   changed, what is still open and why. Exportable as a file the merchant can
   hand to an enterprise buyer's procurement team or their own counsel. This is
   the part that renews.
2. **Theme-level fixes as reviewable patches.** Generated against the merchant's
   Liquid/CSS/JS, applied to a theme copy, never to the live theme without an
   explicit merchant action, with a rollback path.
3. **Drift monitoring.** Re-scan on theme publish and on a schedule. Themes
   change, apps get installed, and a record that is not current is worth nothing.

Indicative pricing: $29–$79/month, deliberately between the $9–$99 overlay tier
and the $400–$3,500/month source-code remediation platforms. The upgrade path out
of the top tier is a fixed-price human-verified job — the remediation pipeline.

## Buyer-segment note (2026-08-19, per ledger PR #96)

Under EAA Art. 4(5) / BFSG §3, EU microenterprises *providing services*
(<10 employees **and** turnover or balance sheet ≤ €2M) are exempt from the
service accessibility requirements — see the fuller writeup in
[eaa-remediation-pipeline](eaa-remediation-pipeline.md#buyer-segment-correction-2026-08-19-per-ledger-pr-96).
Shopify's own merchant base skews toward this exempt segment, which weakens (but
does not eliminate) the EAA-deadline framing as a marketing angle here — this
product's honest-evidence positioning below is unaffected either way, since
nothing on the page claims compliance or urgency-by-mandate. Worth checking
before writing App Store copy that leans on the deadline: lead with "know what's
broken and prove you tested it," not with the exemption-sensitive legal clock.

## Liability and ethics

The same two hard rules as the services candidate, and they matter more here
because a self-serve product has no conversation in which to qualify a claim:

- **No overlay, and never the word "compliant."** The listing, the pricing page,
  and every generated document say what was tested and when. The FTC's 2025 order
  against accessiBe — $1M, plus a permanent bar on claiming its tool makes a site
  WCAG compliant — is the precise line this product must stay behind, and app
  store copy is public, durable, and easy for a regulator or a plaintiff's firm
  to read.
- **The merchant publishes the accessibility statement.** We generate a draft in
  their name; we never issue a conformance statement in ours.

Two liability facts that are better here than in the services version:

- **No personal data.** The app needs theme and storefront read access. It should
  request no customer, order, or marketing scopes at all — which removes the GDPR
  surface that would otherwise come with an EU merchant base.
- **No writes to a live storefront by default.** Every generated fix lands on a
  theme copy. The failure mode of a bad patch is a broken preview, not a broken
  shop.

Residual exposure is a merchant who is sued anyway and points at the app. The
record is the defence, and it must state its own limits: automated detection
catches roughly a quarter to a third of WCAG issues, and the product says so on
the page rather than in a footnote.

## Where it can fail

- **The listing never ranks.** This is the real risk and the thing the probe
  exists to measure. Incumbents own the obvious keywords and have years of
  install counts and reviews. A new listing can be invisible regardless of
  quality.
- **The honest product is a harder sale than the dishonest one.** "Here is what
  is still broken" competes against "one click and you are compliant." The
  counter-argument — that roughly 40% of businesses sued over web accessibility
  in 2025 already had an overlay installed — is true, and is also a paragraph the
  buyer has to read.
- **Platform risk.** The App Store is Shopify's, and the terms, the review
  policy, and the revenue share are theirs to change. Renting distribution is the
  whole thesis and it is also the whole risk.
- **Category crowding.** Several vendors already sell honest source-code
  remediation. The wedge is price point and self-serve, not novelty, and a
  competitor can match both.

## First experiment

Distribution first, product second. Four weeks, under $400:

1. **Before writing the app**, measure the channel: pull install counts, review
   counts, review dates, and pricing for every accessibility app currently listed.
   Reviews landing in the last 90 days are the demand signal; install counts are
   a stock, not a flow.
2. Build the scan-and-record path only — no patch generation — against five real
   storefronts, and check the generated record against a manual pass to see how
   much of what blocks a screen-reader user it actually names.
3. List it with a free scan and a paid record tier. Measure listing impressions →
   install → paid.

Kill it if the listing produces fewer than 25 installs in 30 days post-approval,
or if paid conversion from install is under 2%. Either result says the channel
does not open for a new entrant, which is a more valuable finding than the app —
it would also downgrade the distribution score of every marketplace-native
candidate in this directory.

Do **not** build patch generation until the record tier has paying subscribers.
It is the expensive half and it is worthless if the listing never ranks.

## Amendment, 2026-08-21: step 1 of the first experiment cannot run from this environment

**No score changed.** `apps.shopify.com` — the App Store host itself, distinct
from the `shopify.dev` docs host already flagged unreachable above — is
confirmed `EGRESS_DENIED` (`Tunnel connection failed: 403 Forbidden`) in the
consolidated measurement at
[`portfolio/research/egress-reachability/`](../../research/egress-reachability/),
which probed 92 hosts including this one on 2026-08-20.

This closes a gap [`channel-inventory.md`](../channel-inventory.md) left open:
its mapping table proposed a workaround for this candidate — list the same
scanner on WordPress.org instead, "at zero cost and with no credential," to
measure whether the *category* gets searched even though the Shopify channel
itself is Partner-account-gated. That workaround is dead too: WordPress.org is
in the same document's own list of channels refuted by direct measurement
(`EGRESS_DENIED` on all three of its read, register, and publish hosts). Both
halves of "partly reachable" were wrong, independently, and
`channel-inventory.md` has been corrected to say so.

**Practical effect on step 1 ("pull install counts, review counts, review
dates, and pricing"):** it cannot be gathered by an agent session working from
this repository, on Shopify's own listings or on a substitute. It is not
gated on the account-owner decisions this pipeline already tracks (a payout
rail, or approval to publish) — no decision unblocks it, because the read-only
measurement itself fails at the network layer. The channel question this
candidate's verdict rests on stays open until either the network policy
changes or someone with a browser outside this environment pulls the numbers
by hand; no further agent session should re-attempt this probe expecting a
different egress result.

Gathered 2026-08-19 from secondary sources, unverified against primary ones, at
the confidence appropriate for ranking candidates and not for acting:

- Shopify's revenue-share waiver below $1M lifetime app revenue is from secondary
  reporting; the primary developer documentation was not reachable from this
  environment. **Verify against Shopify's own terms before pricing anything.**
- Competitor pricing, install behaviour, and litigation statistics are from trade
  and vendor blogs, several of which sell competing remediation services and have
  an interest in the overlay comparison.
- The FTC order against accessiBe is the one item here with a public regulatory
  record behind it, and should still be read directly before any marketing copy
  cites it.

## Sources

- [ADA Title III — FTC orders accessiBe to pay $1M over automated remediation claims](https://www.adatitleiii.com/2025/05/federal-trade-commission-orders-accessibe-to-pay-1m-for-misleading-claims-relating-to-automated-website-accessibility-remediation-tool/)
- [TestParty — why 800+ businesses running an overlay were still sued](https://testparty.ai/blog/why-800-businesses-with-accessibe-were-still-sued)
- [TestParty — Shopify "automatic ADA compliance" apps reviewed](https://testparty.ai/blog/shopify-apps-automatic-ada-compliance-honest-review)
- [Week One Labs — Shopify app revenue benchmarks 2026](https://weekonelabs.com/blog/shopify-app-revenue-benchmarks-2026/)
- [Accessio — accessibility tooling for Shopify, source-code vs overlay](https://accessio.ai/blog/best-accessibility-tool-for-shopify)
