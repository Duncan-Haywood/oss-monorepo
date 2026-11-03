# Polish 2026-11-03: answer-first lead on the Shopify fee calculator

**Change.** Shopify page opens with a sourced, dated lead (Basic $39, Grow $105, Advanced $399 monthly; Shopify Payments 2.9/2.7/2.5% + $0.30 online; third-party processors add a separate Shopify fee). As of 2026-11-03, cross-checked by web search because shopify.com is refused by the session proxy. Joined the `answer-lead.test.mjs` pilot (15/15); Shopify `page.test.mjs` 12/12. Full build not run.

**Found, not fixed.** Search results list the Advanced third-party transaction fee as 0.6%; `calc.mjs` has 0.5%. Left out of the lead. Verify against shopify.com/pricing when reachable and fix `PLAN_PRESETS.advanced.shopifyTxnRate` if confirmed.

**Next.** tiktok-shop, course-platform, music-distribution, freelance-platform.
