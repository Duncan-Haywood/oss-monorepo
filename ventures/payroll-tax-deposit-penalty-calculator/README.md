# Payroll Tax Deposit Penalty Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/payroll-tax-deposit-penalty-calculator/>

A free browser tool that takes an employer's payday tax liabilities and
deposits and returns the deposit schedule, every due date, the
failure-to-deposit penalty, and the cheapest way to apply the deposits.
Entirely client-side; nothing is uploaded.

After using this, you can now **see which deposits are late, what the 2% / 5% /
10% penalty comes to, and whether designating your deposits to different
periods would lower it** — which used to mean waiting for an IRS notice.

## Why this exists

Federal payroll tax deposits run on a calendar most owners never see: monthly
by the 15th, or semiweekly by Wednesday or Friday, plus a $100,000 next-day
rule, all moved by weekends and bank holidays. The penalty is a percentage of
the shortfall set by days late. And the IRS applies each deposit to the most
recent liability first, which can strand an older liability in the 10% tier
while a newer one sits at 2%. Payroll providers do not show this arithmetic.

## Try it

Open [`index.html`](index.html), paste paydays and deposits, click
**Calculate**, or **Load an example**.

## What it calculates

All in [`calc.mjs`](calc.mjs), pure functions, integer cents, no dependencies:

- `depositorSchedule` — monthly vs semiweekly from the lookback total.
- `semiweeklyDue`, `monthlyDue`, `nextDayDue`, `federalHolidays` — due dates.
- `buildObligations` — groups liabilities, applies the $100,000 rule and the
  monthly-to-semiweekly switch, flags quarters under $2,500.
- `allocate` — matches deposits to obligations under three strategies and
  prices each chunk at its tier. `optimal` is a min-cost transportation
  problem (successive shortest paths), so it never costs more than the other
  two.
- `analyse`, `findings` — the whole report.

## Tests

```
node --test ventures/payroll-tax-deposit-penalty-calculator/
```

Hand-counted holidays and due dates, tier boundaries, the $100,000 switch,
the designation example, an optimality property check, validation and
no-network assertions.

## Limits

Not tax or legal advice. No interest, no 15% post-notice tier, no penalty
relief, federal deposits only, federal banking calendar only. The IRS's records
and notices control. MIT licensed.
