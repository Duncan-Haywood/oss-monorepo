# Property Management Company Profit Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/property-management-profit-calculator/>

A free browser tool for owners of small property management companies (and people
thinking of starting one). Enter doors, management fee, leasing, renewal and
maintenance income, and your team and overhead; it shows monthly profit, the door
count from which you stay profitable, what your next manager hire does to profit,
profit at other portfolio sizes, the management fee that earns the most on an owner
sensitivity you set, and whether winning another owner pays back. Entirely
client-side.

After using this, you can **see how many doors you need and what the next hire
costs** before you take on the portfolio or the person.

## Try it

Open [`index.html`](index.html) and click **Plan**.

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies. Fee revenue is the larger
of the minimum fee and the fee percentage of rent, on occupied doors. Leasing,
renewal, onboarding, maintenance markup and late fees are added from turnover,
churn and growth. Managers and admins are hired in whole steps by doors per head,
which is why profit dips at the door that needs the next hire. Break-even is the
door count from which profit stays at or above zero. The fee search moves doors by
`elasticity` % per 1% fee change (a cut adds at most 20%). Owner economics use
contribution per door after per-door costs and each door's share of staff pay.

## What this does not cover

Real owner reaction to a fee (your assumption), licensing, trust accounting, fair
housing, state fee rules, owner contracts, tax and seasonality. Planning
arithmetic, not advice.

## License and privacy

MIT. No warranty; not legal, tax, accounting or financial advice. Nothing leaves
your browser; usage counts are local, opt-out-able and honour Do Not Track.

## Run the tests

```
node --test
```
