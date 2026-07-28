# Gelato order API + Google/Pinterest CAPI parity (2026-06-12)

**Sources:**
- [Gelato API — create order v4](https://dashboard.gelato.com/docs/orders/v4/create/)
- [Google Ads — uploadClickConversions](https://developers.google.com/google-ads/api/docs/conversions/upload-clicks)
- [Pinterest Conversions API v5](https://developers.pinterest.com/docs/api/v5/events-create/)

## Findings

1. **Gelato webhook parity** — EU/APAC checkout routes already prefer Gelato in `buildFulfillmentRoute`; without a Gelato order scaffold, `payment_intent.succeeded` only queued Printful jobs. Gelato v4 expects `productUid` + `fileUrl` per line item mapped from catalog slugs.
2. **Multi-platform CAPI** — Meta InitiateCheckout was live; Google and Pinterest still preview-only. Google needs customer ID + OAuth access token + conversion action ID for `uploadClickConversions`. Pinterest v5 `/events` accepts checkout events with bearer token.
3. **Ops visibility** — Fulfillment submissions panel should show both Printful and Gelato partner badges so ops can verify EU routing before ad spend.

## Strategic implication

Market launch requires symmetric fulfillment (US Printful + EU Gelato) and symmetric demand signals (Meta + Google + Pinterest server-side) before scaling programmatic catalog sync — otherwise EU orders stall and Google/Pinterest ROAS optimization lacks checkout events.
