---
kind: polish
topics: [seo]
date: 2026-11-08
tagged: auto
---
# Polish 2026-11-08: site sweep clean; answer-first lead on the overtime calculator

**Measured** on a full build: `check.mjs` passes (1331 products, 7726 pages, no dead links). Scan of built pages: 0 duplicate titles, 0 missing or short descriptions, 0 pages without an h1. Four pages show two h1s, all from sample markup inside script strings (page-seo-audit, structured-data-drift-check, affiliate-disclosure-checker, shift-roster-builder); two pages lack a canonical (`/lab/`, `/lab/handoff/`), both deliberately `noindex`.

**Change.** `data-answer-lead` on overtime-pay-calculator (DOL Fact Sheet #23, 29 CFR 778.115, as of 2026-11-08), with a test. Answer-lead tests 26/26, venture suite 65/65.

**Not done.** The `mobile-overflow-guard` snippet in 77 venture pages is only partly in shared chrome (table display:block and code wrapping are not), so removing it changes layouts; needs per-page screenshots first.

**Next.** More leads: 401k-plan-fee, tiktok-shop (need primary sources), solo-401k limits.
