---
kind: analysis
date: 2026-11-04
tagged: auto
---
# Mobile overflow sweep, 2026-11-04

Tool: `node platform/ci/check_mobile_overflow.mjs [--only a,b]` (375px, exit 1 on overflow).
Before: 60 of 1,312 venture pages overflowed. A `mobile-overflow-guard` style block was added to all 60 pages
(tables scroll, code wraps, containers get min-width:0).
Still overflowing after the fix (need page-specific CSS): snowflake-warehouse-cost-advisor independent-pharmacy-rx-margin-calculator cafe-drink-margin-calculator optical-dispensary-margin-calculator cloudflare-bill-estimator obsidian-plugin-review-check s3-storage-class-savings hearing-aid-dispensing-margin-calculator bigquery-query-cost-advisor vcard-contacts-check 31
Not wired into CI yet (takes minutes); a next step is a sampled run.
