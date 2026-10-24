# Retirement Withdrawal Sequencer

A free browser tool for people close to or in retirement: **enter taxable, traditional and Roth balances, yearly
spending and Social Security, and it runs the plan year by year to your end age under 2026 US tax rules, compares the
usual withdrawal orders with bracket-filling and Roth-conversion strategies, and shows which leaves you the most after
tax and how much tax each pays over the whole retirement.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/retirement-withdrawal-sequencer/

After using this, you can now **see whether spending taxable money first is costing you tens of thousands of dollars
of avoidable lifetime tax, and which bracket to fill with traditional withdrawals or Roth conversions**, which used to
take a paid planning-software seat or an advisor meeting.

## Model

- Real (today's) dollars throughout: brackets, benefits and spending are held constant, returns are after inflation.
- Each year: Social Security and pension in, required minimum distribution forced (uniform lifetime table), then enough
  drawn from accounts that cash after income tax equals spending. Surplus is reinvested in the taxable account.
- Tax: 2026 ordinary brackets, standard deduction (plus 65+), long-term gains stacked at 0/15/20%, taxable Social
  Security by the provisional-income formula, yearly tax on the taxable account's yield, flat state rate.
- Strategies: taxable-first, traditional-first, pro-rata, and fill-to-the-top-of the 10/12/22/24/32/35% bracket from the
  traditional account, each with surplus reinvested or converted to Roth (15 in all).
- Ranking: funds spending to the end age first, then largest after-tax value at the end (traditional balance less the
  heirs' tax rate). The winner is re-run at a return two points lower to show whether the ranking is fragile.

## Limits

Not modelled: IRMAA surcharges, net investment income tax, the 2025-2028 senior deduction, state rules, a surviving spouse
moving to single brackets, differently aged spouses, variable returns and sequence risk, annuities, long-term care, the
five-year Roth rules. A search over a fixed strategy menu, not a proof of optimality. The long-term-gains thresholds and the
RMD table are typed from published tables and not checked against the primary source. Not legal, tax, or financial advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
