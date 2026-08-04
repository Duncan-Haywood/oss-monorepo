# GTM deep-links, order persistence, and ad catalog API sync

**Date:** 2026-06-12  
**Sources:** Meta Catalog Batch API, Google Merchant Center Content API, Pinterest Catalog API docs; Stripe `payment_intent.succeeded` webhook reference.

## Findings

1. **Outreach → onboarding** — Sales velocity improves when upload-ready replies deep-link to a pre-filled `/artist-onboard?handle=&name=&source=outreach` intake instead of generic capture URLs. Source attribution enables cohort measurement from reply through live listing.

2. **Order persistence** — `payment_intent.succeeded` metadata from checkout (`fulfillmentPartnerId`, `artistTransferTotal`, `lineItemCount`) is sufficient for an in-memory order record before Convex. Fulfillment queue status should flip when partner ID is present.

3. **Ad catalog sync** — Programmatic demand requires three gates: sync health (pixel + feed + creative quota), consent-cleared SKUs, and platform credentials. Without API keys, simulated push validates payload size and row counts — unblocks GTM prep before ad account spend.

## Strategic implication

Market-ready GTM means sales can hand artists a one-click onboarding path, marketing can dry-run catalog pushes, and payments can record orders from webhooks — all before full backend persistence.
