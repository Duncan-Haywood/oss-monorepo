# Printful variant mapping + checkout abandon retargeting (2026-06-12)

## Sources

- [Printful API — Create order](https://developers.printful.com/docs/#operation/createOrder) — orders require `variant_id` per line item.
- [Meta Conversions API — InitiateCheckout](https://developers.facebook.com/docs/meta-pixel/reference#standard-events) — standard event for checkout abandonment audiences.
- [Google Analytics 4 — begin_checkout](https://developers.google.com/analytics/devguides/collection/ga4/reference/events#begin_checkout) — ecommerce funnel event for remarketing lists.
- [Pinterest API — checkout event](https://developers.pinterest.com/docs/api/v5/#tag/conversion_events) — conversion event for cart abandon retargeting.

## Strategic implication

Market-ready fulfillment requires catalog slug → Printful variant ID mapping before webhook POD submission — placeholder `pf_{slug}` IDs fail in production. Demand retargeting should fire on `session.created` (checkout session scaffold) so abandoned-cart audiences build before scaling paid social, using the same partner credential vault as ad catalog sync.
