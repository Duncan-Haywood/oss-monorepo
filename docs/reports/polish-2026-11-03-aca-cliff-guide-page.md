---
kind: polish
date: 2026-11-03
tagged: auto
---
# Polish 2026-11-03: question-shaped guide for the ACA subsidy cliff calculator

**Weak surface.** `guide-coverage.mjs` listed 706 of 1322 surfaces with no secondary page. The previous note's idea (a front-matter hint for the 160-character limit) already exists in `platform/ci/check_post_frontmatter.py`, so I took the guide gap instead.

**Change.** Added `ventures/aca-subsidy-cliff-calculator/how-do-i-stay-under-the-aca-subsidy-cliff-in-2026.html` (FAQPage JSON-LD matching the visible Q&A, no-warranty footer, link back to the tool) and linked it from the tool's `index.html`. Figures are the calculator's own; example credits were computed with `creditAt`.

**Measured.** `guide-coverage.mjs`: 616 to 617 of 1322 covered. `faq-visible`, `guide-coverage` and the venture's `page.test.mjs` and `calc.test.mjs` pass. Rankings not measured.

**Next.** 705 surfaces remain. Prefer tools with a live legal change behind them (401k-plan-fee, 529-to-roth, 401k-loan-vs-withdrawal). Write a page only when the query is real.
