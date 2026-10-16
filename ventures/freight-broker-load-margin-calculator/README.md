# Freight Broker Load Margin Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/freight-broker-load-margin-calculator/>

A free browser tool for freight brokers and small agencies: **type in your loads and get net margin after the cost of
fronting the carrier, factoring, claims reserve, overhead and commission, plus the shipper rate to quote and the highest
carrier rate to pay to hit a target margin**. Nothing is uploaded.

After using this, you can now **see which loads that look fine at 15% gross are losing money, and what rate would have
fixed them, which used to take a spreadsheet most brokers never build**.

## Model

- Load line: `name, shipper rate, carrier rate, miles, extras billed, extras paid, shipper days, carrier days` (first
  three required).
- Revenue = shipper rate + billed extras; carrier cost = carrier rate + paid extras; gross = revenue - carrier cost.
- Float = carrier cost x APR x max(0, shipper days - carrier days) / 365. Factoring and reserve are % of revenue;
  commission is % of gross; overhead is $ per load.
- Net is linear in revenue and carrier cost, so the minimum shipper rate and maximum carrier rate for a target net
  margin are solved in closed form (tests requote at the answer and recover the target exactly).

## Limits

Not modelled: fuel surcharge structure, deadhead, fall-off and re-brokering, cargo claims, customer credit limits,
registration costs, tax, contracts. Verified only against hand arithmetic and invented loads. Not legal, tax, or
financial advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
