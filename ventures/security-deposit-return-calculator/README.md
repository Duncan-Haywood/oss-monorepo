# Security Deposit Refund & Prorated Rent Calculator

Two free calculators for the arithmetic every residential move-in or move-out
raises: itemize a security deposit's deductions to see the refund or balance
due, and calculate prorated rent for a partial first or last month. Entirely
client-side; nothing is uploaded.

After using this, you can now **turn a deposit amount and a list of
deductions into a refund or balance figure, and a monthly rent into a
prorated partial-month amount, in seconds** — arithmetic that otherwise means
a spreadsheet or doing it by hand under a move-out deadline.

## Why this exists

Security deposit disputes are one of the most common landlord-tenant friction
points, largely because both sides are doing ad-hoc arithmetic under a
deadline: a landlord itemizing deductions before a statutory notice period
expires, a tenant checking whether the math on a deduction letter is correct.
r/Landlord and r/tenant both see this exact question — "how much should I get
back" and "can they deduct this" — every time a lease ends. Prorated rent for
a partial first or last month is the same recurring calculation at the other
end of a lease. Neither calculator tells you what is legally deductible or
cites a jurisdiction's specific rule; both just do the arithmetic correctly
from the numbers you already have.

## Try it

Open [`index.html`](index.html). For the deposit calculator, enter the
deposit amount, add a row for each itemized deduction, and click **Calculate
refund**. For prorated rent, enter the monthly rent, the days in that month,
and the days occupied, then click **Calculate prorated rent**.

## What it calculates

Both in [`calculator.mjs`](calculator.mjs), as two pure functions with no
dependencies:

- **`computeDepositSettlement`** — sums the itemized deductions and subtracts
  from the deposit amount. If deductions are less than the deposit, the
  difference is the refund due; if they exceed it, the difference is a
  balance owed instead (never a negative refund). Flags a deduction with no
  description (an itemized statement names each charge specifically) and
  notes when a jurisdiction's own itemization deadline and deductibility
  rules — not covered by this calculator — still need checking.
- **`computeProratedRent`** — a daily rate (monthly rent ÷ days in the month)
  times the days actually occupied, capped at the days in the month entered.

Every output is the arithmetic behind your own itemization or dispute, **never
a legal determination of what is deductible or a substitute for reviewing
your lease** — the landlord or tenant decides what to send or accept.

## Disclaimers

This is not legal or financial advice. It does not know your state's
itemized-statement deadline, deposit limit, interest rules, or what
specifically counts as normal wear and tear versus damage in your
jurisdiction — check your lease and local law. Verify its output before
relying on it, the same as any free, best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`deposit_calculated`, `proration_calculated`, `example_loaded`) are counted
in `localStorage` only, never transmitted. Do Not Track and Global Privacy
Control are honoured, and a button on the page turns counting off entirely.

## Development

```sh
node --test calculator.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Both calculators and
their test suites are done; no external user contact has happened yet — see
`kill_criteria` in `VENTURE.yaml`.
