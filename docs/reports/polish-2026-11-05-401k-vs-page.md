---
kind: polish
date: 2026-11-05
tagged: auto
---
# Polish 2026-11-05: comparison page for 401k-loan-vs-withdrawal-calculator

`surface-budget.mjs` lists the product with 0 generic-method comparison pages against a budget of 1. Added
`vs-working-it-out-by-hand.html`: table and FAQ (+ `FAQPage` JSON-LD) built only from the README model and the
existing guide's default-example figures ($34,300 loan vs $61,100 withdrawal, placeholders). Linked from the tool,
sitemap and `llms.txt`. Venture `node --test`: 25 pass (one new test); `check_llms_txt_links.py`: 0 dead links.
No site build run; rankings and traffic not measured.

**Next.** Hundreds more products in the same list; pick ones whose README gives concrete features and keep claims to
what it backs. Note: `llms.txt` links use the github.io/oss-monorepo address (what `check_llms_txt_links.py` enforces)
though hosting is now marisstella.app; that check's wording may be stale.
