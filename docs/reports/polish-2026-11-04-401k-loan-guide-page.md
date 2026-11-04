---
kind: polish
topics: [seo]
date: 2026-11-04
tagged: auto
---
# Polish 2026-11-04: question-shaped guide for the 401(k) loan vs withdrawal calculator

**Change.** Added `ventures/401k-loan-vs-withdrawal-calculator/should-i-take-a-401k-loan-or-an-early-withdrawal.html` (FAQPage JSON-LD matching the visible Q&A, no-warranty footer, link to the tool), linked from the tool's `index.html` and listed in its `sitemap.xml`. Every figure is the calculator's own output on its default inputs (`analyze({})`), including the 2% growth case where the withdrawal wins.

**Measured.** The venture's tests (24) and `faq-visible`/`guide-coverage` tests (11) pass. Rankings not measured.

**Next.** Remaining uncovered surfaces: run `node platform/pages/guide-coverage.mjs`. Candidates with a real query behind them: 529-to-roth, 401k-plan-fee.
