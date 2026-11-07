---
kind: polish
topics: [aeo, seo]
date: 2026-11-07
tagged: auto
---
# Polish 2026-11-07: answer-first lead on the patent maintenance fee planner

**Change.** `data-answer-lead` paragraph (statutory timing, source, as-of date) on the planner page; a no-dollar-figure test in `platform/pages/answer-lead.test.mjs` ties it to `STAGES` in `calc.mjs` (22/22 pass; planner suite 41/41). Full site build not run.

**Why no dollars.** The fee amounts in `calc.mjs` are "as the tool author understood" the 2025 USPTO schedule and were not re-fetched, so the lead avoids them.

**Next.** More venture pages without leads (tiktok-shop, 401k-plan, merchant-of-record fee calculators; their figures need a primary source first); 390 px sweep of blog posts and flagship pages.
