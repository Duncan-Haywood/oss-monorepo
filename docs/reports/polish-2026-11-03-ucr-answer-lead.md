---
kind: polish
date: 2026-11-03
tagged: auto
---
# Polish 2026-11-03: answer-first lead on the UCR fee calculator

**Weak surface.** Shopify (the last report's next step) is unreachable through the proxy (help.shopify.com, www.shopify.com 403), so no primary source could be checked. UCR was the nearest page with figures already checked today (PR #12934, plan.ucr.gov).

**Change.** `ventures/ucr-fee-calculator/index.html` opens with a `data-answer-lead` paragraph giving the six 2027 fee brackets, sourced to the UCR Plan and dated 2026-11-03. The page is in `PILOTS` in `platform/pages/answer-lead.test.mjs`; every dollar figure must be a bracket fee from `DEFAULT_FEES_TEXT`.

**Measured.** `answer-lead.test.mjs` all pass; UCR venture tests 23 pass. I could not re-open plan.ucr.gov myself (proxy 403); the figures come from #12934. Full site build not run; rankings not measured.

**Skipped.** Shopify, Etsy, Stripe, Square, PayPal: hosts blocked here.

**Next.** Shopify when its pricing page is reachable; otherwise other government-sourced calculators (irs.gov also blocked, so probe first).
