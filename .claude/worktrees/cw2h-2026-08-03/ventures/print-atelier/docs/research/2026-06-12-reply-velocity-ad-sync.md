# Reply-to-live compression + ad catalog sync health (2026-06-12)

## Sources

- Prior outreach triage research: `docs/research/2026-06-08-outreach-reply-triage.md`
- Ad catalog feed gates: `docs/research/2026-06-12-ad-catalog-feed.md`
- Meta catalog requirements: [Meta Commerce Manager catalog specs](https://developers.facebook.com/docs/marketing-api/catalog)
- Google Merchant Center: [Product data specification](https://support.google.com/merchants/answer/7052112)

## Strategic implications

1. **Supply GTM metric:** Artist acquisition should optimize reply-to-live-listing compression (median hours from reply to sellable SKU), not raw DM volume. A 7-day cohort planner makes bottlenecks visible before scaling outreach.
2. **Demand GTM gate:** Paid catalog sync requires three independent checks — pixel configured, feed rows eligible, per-platform creative minimums met. A sync health monitor prevents premature API pushes that waste ad platform trust.
3. **Shared gates:** Both supply velocity and demand sync depend on the same consent-cleared, proof-approved catalog — digital stock is one pipeline with two indexes (sitemap + ad feed).
