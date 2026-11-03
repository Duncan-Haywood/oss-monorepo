# Polish 2026-11-03: answer-first lead on the Patreon fee calculator

**Weak surface.** Most `*-fee-calculator` pages still have no `data-answer-lead`.

**Change.** Patreon page opens with a sourced, dated lead (10% Standard plan fee, about 2.9% + $0.30 per charge, legacy plans 5/8/12% with a lower rate under $3). As-of date 2026-09-25, when `calc.mjs` recorded the figures from a web search; support.patreon.com is refused by the session proxy, so the lead says it was not fetched directly. Joined the `answer-lead.test.mjs` pilot (dollar figures checked against `calc.mjs`).

**Measured.** `answer-lead.test.mjs` 14/14; Patreon `page.test.mjs` 25/25. Full site build not run; rankings not measured.

**Next.** Re-verify against the Patreon Help Center when reachable. Candidates: shopify, tiktok-shop, course-platform, music-distribution.
