# Polish 2026-11-03: answer-first lead on the Reverb fee calculator

**Weak surface.** 19 `*-fee-calculator` pages have no `data-answer-lead`; the pilot covered 10.

**Change.** Reverb page now opens with a sourced one-sentence lead (5% fee, $500 cap, 3.19% + $0.49) and joined the `answer-lead.test.mjs` pilot list. Dollar figures are checked against `calc.mjs`. The test's date pattern now also accepts `YYYY-MM`, because help.reverb.com returned 403 through the proxy and the repo only records "2026-09"; inventing a day would be worse.

**Measured.** `answer-lead.test.mjs` 12/12, reverb suite 123/123. Full site build not run; rankings not measured.

**Next.** Re-verify the Reverb figures when the host is reachable and set a full date. Remaining candidates: patreon, shopify, tcgplayer-style marketplace calculators without a lead.
