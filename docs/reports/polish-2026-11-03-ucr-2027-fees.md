---
kind: polish
topics: [seo]
date: 2026-11-03
tagged: auto
---
# Polish 2026-11-03: UCR fee calculator moved to the 2027 table

**Weak surface.** Answer-first leads need a primary source; most primary hosts 403 through the proxy. plan.ucr.gov answers, and showed the approved 2027 fees while `ventures/ucr-fee-calculator` defaulted to 2025 ($4,588 and $44,797 in the top two brackets).

**Change.** Defaults, label, README, VENTURE.yaml, page text and one test now use 2027: 46/138/276/963/4,592/44,836. Not done: a `data-answer-lead` for this page (it is not in the answer-lead pilot list; next run could add it using these figures and the source URL).

**Measured.** `node --test ventures/ucr-fee-calculator/*.test.mjs`: 23 pass. Full site build not run. Rankings not measured.

**Next.** Probe which other primary hosts respond (plan.ucr.gov did; etsy.com, fmcsa.dot.gov, tiktok did not) and add leads to fee pages with a reachable source.


## Correction, 2026-11-12

The amounts this report recorded as the 2027 schedule were the 2025 and 2026 fees. The 2027-and-later fees in 49 CFR 367.50 (FMCSA final rule, 91 FR 56063, FR Doc 2026-17893) are $55 / $167 / $333 / $1,163 / $5,548 / $54,165. Freight forwarders pay by vehicle count, not the lowest bracket. Both were fixed in the round 52 quality audit PR; see `portfolio/quality/audits/2026-11-12-ucr-fee-calculator.json`. Hosts ecfr.gov, federalregister.gov and plan.ucr.gov were unreachable from the session, so the amounts were checked against several secondary sources that quote the final rule; recheck on ecfr.gov when a session can reach it.
