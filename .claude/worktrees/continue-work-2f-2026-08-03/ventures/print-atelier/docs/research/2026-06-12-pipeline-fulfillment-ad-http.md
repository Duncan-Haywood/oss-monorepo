# Product pipeline, live ad catalog HTTP, and Printful fulfillment scaffold

**Date:** 2026-06-12  
**Run theme:** Market-ready ops — visual pipeline + programmatic partners

## Rationale

Print Atelier's moat is software orchestration across capture → catalog → storefront → fulfillment, with growth engines (outreach, SEO, ads) feeding both sides of the marketplace. Owner documentation should show this pipeline with live metrics, not static prose.

## Partner API references

- **Meta Catalog Batch API:** `POST graph.facebook.com/v19.0/{catalog_id}/items_batch` with OAuth bearer token ([Meta Marketing API catalog](https://developers.facebook.com/docs/marketing-api/catalog)).
- **Google Content API:** Merchant Center `products/batch` endpoint for programmatic product inserts.
- **Pinterest Catalog API:** v5 `catalogs/{catalog_id}/items/batch` for shopping ads.
- **Printful Orders API:** `POST https://api.printful.com/orders?store_id={store_id}` with Bearer API key ([Printful API docs](https://developers.printful.com/docs/#tag/Orders-API)).

## Strategic implications

1. **Visual pipeline** on `/docs` and `/investor` surfaces blockers per stage before ad spend or outreach scale.
2. **Live HTTP catalog push** closes the gap between simulated sync and production ad catalog feeds — credentials gate real `fetch` calls.
3. **Printful webhook scaffold** bridges `payment_intent.succeeded` → POD order queue, completing the buyer purchase vertical slice before Convex persistence.

## Next persistence steps

- Convex tables for orders, fulfillment submissions, and ad sync audit log.
- Map catalog slugs to real Printful variant IDs in partner setup.
- Retry queue for failed catalog HTTP pushes and Printful 4xx/5xx responses.
