# Mega Backdoor Roth 401(k) Calculator

A free browser calculator for savers whose 401(k) plan allows after-tax
(non-Roth) employee contributions above the ordinary elective-deferral
limit. Enter what you've already contributed this year and it computes the
after-tax headroom left under the IRS's 415(c) overall limit for 2025 or
2026, plus the per-paycheck contribution that would use it up by
year-end.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/mega-backdoor-roth-calculator/

Open `index.html` in a browser. The calculation is local and works
without an account, network request, or API key. It is arithmetic
against the published IRS limits and whatever you enter about your own
plan and paycheck — nothing here is looked up or estimated on your
behalf.

After using this, you can now see the exact dollar headroom left in your
plan's after-tax bucket this year, the per-paycheck contribution that
reaches it by December, and whether your own plan's contribution cap
(not just the IRS limit) is what's actually binding — which used to mean
reconstructing two different IRS limits and your own paystub math by
hand.

## Why this exists

Two IRS numbers get confused constantly:

- The **402(g) elective deferral limit** ($23,500 for 2025 / $24,500 for
  2026, plus catch-up) is what you control directly through payroll
  withholding — pre-tax plus Roth 401(k) combined. It is one shared
  ceiling across every employer's plan you contribute to in a calendar
  year, related or not.
- The **415(c) overall limit** ($70,000-$81,250 for 2025 / $72,000-$83,250
  for 2026, depending on your age) covers your elective deferral, your
  employer's match and profit sharing, and any after-tax contributions,
  all added together. Unlike the 402(g) limit, it applies **per employer
  plan**, not aggregated across unrelated employers.

The gap between what's already gone in under the smaller limit and the
larger limit is the "mega backdoor Roth" — the after-tax room a plan that
supports it lets you fill, then convert to Roth via an in-plan conversion
or an in-service withdrawal to a Roth IRA.

See the [conversion-cadence guide](which-conversion-cadence-should-i-use.html)
for what automatic versus periodic conversion actually costs in tax on
accumulated growth.

## What this does not cover

- It does not know whether your specific 401(k) plan allows after-tax
  contributions, in-plan Roth conversions, or in-service withdrawals at
  all — most plans do not offer all three. Check your plan's summary
  plan description or ask your plan administrator first.
- It does not model the IRC Section 401(a)(17) annual compensation limit
  used in some plan-level percentage caps, beyond letting you enter your
  own plan's stated cap directly.
- It computes headroom for a single employer's plan for a single
  calendar year. If you changed jobs mid-year, run it once per employer
  with each plan's own year-to-date figures — the 415(c) limit resets per
  employer, even though the 402(g) elective-deferral limit does not.
- It does not calculate what you would owe on withdrawal, file anything,
  or replace a qualified tax preparer or financial advisor.

IRS figures sourced 2026-09-24, cross-checking summaries of IRS Notice
2024-80 (2025 limits) and Notice 2025-67 (2026 limits) — see
`VENTURE.yaml` for the full sourcing note.

## No warranty

This tool is free and as-is. It is not legal, tax, or financial advice
and does not replace a qualified tax preparer, financial advisor, or your
plan administrator. You are responsible for reviewing and verifying its
output before relying on it. To the maximum extent permitted by law, the
authors accept no liability for any loss or damage arising from its use.
