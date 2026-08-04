# Ad catalog feed from publishable SEO slugs

**Date:** 2026-06-12  
**Sources:** Meta Commerce catalog fields, Google Merchant Center product data spec, Pinterest catalog requirements (public documentation summaries).

## Why this matters

Programmatic SEO builds indexable `/prints/[slug]` inventory, but paid demand needs a **separate product catalog feed** synced to Meta, Google, and Pinterest. Feeds must only include listings that pass the same consent, proof, and creative-readiness gates used for organic publish — otherwise ad platforms index blocked SKUs and inflate CAC.

## Gate stack

1. **SEO publish state** — proof, mockups, tags (same as sitemap)
2. **Paid-ad consent** — `paid-ads` channel cleared in listing consent gate
3. **Creative readiness** — score ≥ 60 from shared `calculateCreativeReadiness`

## Platform minimums (from `src/lib/partners.ts`)

| Platform | Min creatives | Notes |
|----------|---------------|-------|
| Meta | 6 | Pixel configured; catalog sync ready |
| Google | 4 | Search + Merchant Center |
| Pinterest | 8 | Blocked until room mockup coverage ≥ 80% |

## Strategic implication

Digital stock launch is a **two-index problem**: sitemap for organic discovery, ad catalog for paid amplification. Software should generate both from one consent-cleared slug list and block sync when creative quotas are unmet.
