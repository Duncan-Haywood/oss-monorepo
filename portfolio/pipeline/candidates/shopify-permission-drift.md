# Candidate: Shopify app-permission drift record

**One line.** A Shopify App Store product that records the installed apps,
requested access scopes, webhook subscriptions, and relevant app status for a
merchant, then produces a source-linked diff when that inventory changes.

**Verdict: build-now.** Shopify supplies a real listing channel and the record can
be useful to a merchant or agency without declaring an app safe or compliant.
The first slice is a local export comparator, so the core workflow can be tested
without platform credentials while API coverage and willingness to pay remain
untested.

Scored 2026-08-24. Composite 6.75 · floor 4 (defensibility).

| Dimension | Score | Why |
|---|---:|---|
| AI leverage | 7 | A model can group changed scopes and webhook events, explain the raw delta, and identify repeated patterns; API retrieval and comparison remain deterministic |
| Autonomous ops | 8 | Scheduled inventory snapshots and alerts are unattended after installation, but authorization expiry and ambiguous platform responses need review |
| Time to revenue | 6 | A narrow read-only prototype is quick to trial, but recurring purchase depends on showing that a change was actionable rather than merely interesting |
| Gross margin | 9 | Shopify API calls, small stored inventories, and modest summarisation inference are the delivery costs |
| Defensibility | 4 | The diff format is copyable; merchant-specific signed history and an agency workflow could accrue value, but do not create a moat initially |
| Distribution | 6 | The Shopify App Store puts the product in front of merchants with an attached billing rail, but permission auditing is a narrower search category than storefront accessibility and ranking is unproven |
| Liability containment | 6 | The product records permissions and platform responses for an authorized store; it does not declare an app malicious, choose a least-privilege policy, or make a compliance claim |
| Ethical robustness | 8 | The merchant controls authorization, receives raw evidence, and can revoke access; the product does not inspect customer records or covertly profile installed vendors |

## Boundary

The product is an inventory record, not a security certification or Shopify
policy interpretation. It must:

- run only against a store the customer owns or is authorized to administer;
- request the minimum read scopes needed to inspect app installation metadata and
  its own historical records, never customer, order, payment, or marketing data;
- preserve the API response, scope names, webhook topics, timestamp, API version,
  and authorization status alongside every diff;
- label unavailable, redacted, and rate-limited responses as inconclusive rather
  than treating them as an unchanged inventory; and
- avoid statements such as "this app is unsafe," "this store is compliant," or
  "remove this vendor." The merchant decides what a changed permission means.

## Why this is distinct

This is not the existing Shopify storefront-testing idea in
`ventures/ai-first-markets`: that product exercises customer journeys and
visual layouts, while this candidate records administrative app access and
webhook state. It is not [shopify-a11y-evidence](shopify-a11y-evidence.md): that
candidate scans theme output for accessibility findings and produces fixes. It
is not [vendor-change-evidence](vendor-change-evidence.md): this candidate uses
customer-authorized Shopify admin data, not public vendor policy pages. It is
also narrower than a generic SaaS security inventory because the Shopify App
Store is its proposed acquisition channel and the first artifact is limited to
one platform's observable permissions.

## First experiment

Two weeks, under EUR150:

1. Build a local fixture representing three app inventories: unchanged, a
   newly requested scope, and a webhook or authorization-state change. Render a
   report containing the raw response, timestamp, API version, and an explicit
   unknown state for fields the platform does not expose.
2. Verify the minimum Shopify scopes and retention boundary against the current
   developer documentation before requesting access from any real store. Do
   not use a production store or customer data for the fixture.
3. Show the report privately to ten Shopify agencies or merchant operators in
   public communities. Ask three whether this is part of a recurring app-review
 workflow and one to pre-pay EUR50/month for a 30-day pilot.

The fixture workflow is implemented in `ventures/shopify-permission-drift` and
is deliberately not a Shopify integration. It demonstrates the useful core at
zero marginal cost; it is not evidence of platform API coverage or demand.

Kill or narrow it if the platform cannot expose a stable, customer-authorized
baseline, fewer than three qualified conversations can name a recurring review,
or no one will pilot after seeing a source-linked permission change. A successful
fixture run is a product sanity check, not evidence of demand.

## Low-score mitigations

The defensibility floor requires immutable, merchant-specific snapshots with a
portable export and a test of whether a new entrant can reconstruct the same
history without the merchant's prior records. Distribution requires a Shopify
agency partner or repeatable App Store search demand before a hosted product is
built. Until both are tested, keep this as a local probe.
