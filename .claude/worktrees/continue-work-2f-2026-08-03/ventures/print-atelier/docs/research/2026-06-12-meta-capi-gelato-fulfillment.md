# Meta CAPI + Gelato mapping + fulfillment ops (2026-06-12)

## Sources

- [Meta Conversions API — InitiateCheckout](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event)
- [Gelato API — product catalog](https://dashboard.gelato.com/docs/)
- Print Atelier prior research: `2026-06-12-printful-variant-retargeting.md`, `2026-06-12-pipeline-fulfillment-ad-http.md`

## Rationale

1. **Meta CAPI on checkout session** — Abandon audiences need server-side events when browser pixels are blocked. Firing `InitiateCheckout` at `POST /api/stripe/checkout` matches session creation and pairs with existing pixel payload previews.
2. **Gelato variant mapping** — EU/APAC margin routing in `buildFulfillmentRoute` already prefers Gelato when credentials pass; without slug → product UID mapping, Gelato orders would use placeholders like Printful did before variant mapping.
3. **Fulfillment submission dashboard** — Ops needs visibility into dry-run vs live Printful API responses before Convex persistence; admin portal panel surfaces webhook submission history.

## Strategic implication

Demand (CAPI) and supply (POD mapping) share the partner credential vault at `/partner-setup`. Market launch should not scale paid spend until both Meta CAPI and fulfillment variant coverage show green gates.
