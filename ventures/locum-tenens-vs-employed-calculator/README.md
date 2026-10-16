# Locum Tenens vs Employed Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/locum-tenens-vs-employed-calculator/>

A free browser tool for physicians, NPs, PAs and CRNAs weighing a locum tenens (1099) contract against an employed (W-2) offer:
**enter both offers and see annual take-home after federal tax for each, the break-even locum hourly rate, and a sensitivity table on
weeks worked.** Nothing is uploaded.

After using this, you can now **tell what hourly rate a locum contract must pay, at the weeks you expect to work, to beat your employed offer**.

## Model (tax year 2026, federal only)

- Locum: rate x guaranteed hours x weeks worked, less malpractice/tail, other business costs and unreimbursed travel; self-employment tax on 92.35% of profit; half of it, self-employed health insurance and a capped solo 401(k)/SEP contribution deducted; standard deduction; 2026 brackets.
- Employed: salary, FICA, pre-tax health share and 401(k) deferral, standard deduction, 2026 brackets.
- Total value = after-tax cash + retirement saved (own + match) + employer-paid health and CME. Break-even rate solves total value equality by bisection.

Not modelled: state tax, QBI deduction, itemised deductions, credits, spouse income, catch-up contributions, bonuses, per-diem rules.
Constants were copied from sibling tools in this catalogue; confirm against current IRS and SSA publications.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting every rule that applies to you.
