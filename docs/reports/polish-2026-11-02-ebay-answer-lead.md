# Polish 2026-11-02: answer-first lead on the eBay fee calculator

**Weak surface.** `propose_seo_titles.py` found nothing over budget, so I took the next lever from the last report: answer-first leads beyond the pilot.

**Change.** `ventures/ebay-fee-calculator/index.html` now opens with a `data-answer-lead` paragraph: 13.6% final value fee up to $7,500 for most categories, $0.40 per order on all but the smallest orders. The figures were checked on eBay's "Selling fees" page on 2026-11-02 (13.6% up to $7,500; per-order fee $0.30 at $10 or less, $0.40 above). The page is added to `PILOTS` in `platform/pages/answer-lead.test.mjs`; every dollar figure in the lead must be one the calc module exports.

**Measured.** `node --test platform/pages/answer-lead.test.mjs`: 11 pass. eBay `page.test.mjs`: 0 fail. Full site build not run; rankings not measured.

**Skipped.** Patreon, Reverb: their help pages return 403 through the proxy, so no primary source could be checked.

**Next.** The same for Shopify (reachable), after reading its pricing page and exporting the figures from its calc module.
