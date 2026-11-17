---
kind: analysis
date: 2026-11-17
subjects: [mega-backdoor-roth-calculator, ai-bookkeeper, solo-401k-contribution-calculator, hsa-contribution-limit-calculator, backdoor-roth-pro-rata-calculator]
---
# 2026 retirement and HSA limits check (2026-11-17)

`python3 platform/ci/check_plan_limits_2026.py [--json] [--strict]` flags a sentence in a shipped
venture file that names 2026 and a limit (401(k) deferral, catch-ups, 415(c), 401(a)(17), SIMPLE,
IRA, Roth phase-outs, HSA, HDHP) but gives only the 2025 figure. 19 limits, pinned from:

- IRS Notice 2025-67 (irs.gov/pub/irs-drop/n-25-67.pdf): every 2026 figure with the 2025 one it replaces.
- Rev. Proc. 2025-19 section 3 (irs.gov/pub/irs-drop/rp-25-19.pdf): 2026 HSA and HDHP figures. The
  2025 HSA/HDHP figures in the check are from Rev. Proc. 2024-25 by memory and only recognise stale text.

Both PDFs answered 200 through the proxy on 2026-11-17 and read cleanly with `pdftotext -layout`.
ssa.gov answered 403 (no wage-base check yet).

First run: one real fault, the mega-backdoor-roth FAQ's IRA aside ("$7,000 for 2025/2026, plus a $1,000
catch-up"), twice in index.html (visible FAQ and FAQPage JSON-LD). Fixed. One false alarm (a $7,500
IRA sentence read as the stale 401(k) catch-up) became the shared-figure rule.

Read by hand, all matching the notice: `solo-401k-contribution-calculator/calc.mjs`,
`hsa-contribution-limit-calculator/calc.mjs`, `backdoor-roth-pro-rata-calculator/calc.mjs`,
`ai-bookkeeper/retirement.mjs` (its "from memory" warning now cites the check date),
`mega-backdoor-roth-calculator/calc.mjs`.

Gaps for a next run: year-keyed code tables without a limit word on the line are invisible to the
check; the SS wage base and 2026 mileage rate are unpinned; add 2027 rows when Notice 2026-xx is out.
`test_check_plan_limits_2026.py` runs the check over `ventures/` with `--strict`, so a new stale
sentence fails pytest.
