# staffing-markup-calculator

A browser calculator for independent staffing agencies and recruiters. It
prices one placement the way the trade actually quotes it — a **markup on the
pay rate** — and then shows what that markup earns once the employer burden it
has to carry is counted.

Everything runs in the visitor's browser. No account, no network requests, no
build step, no dependencies.

- [`index.html`](index.html) — the calculator
- [`markup-vs-margin.html`](markup-vs-margin.html) — the question people search
- [`calc.mjs`](calc.mjs) — every figure, as pure functions
- [`usage.mjs`](usage.mjs) — an anonymous, opt-out, local-only counter
- [`share.mjs`](share.mjs) — saves a placement to this browser and encodes it into a shareable link, never a server

```
node --test          # 98 assertions across calc, page, usage and share
```

## The mistake it exists to catch

A recruiter quotes "we're at 45%" and reports a 31% gross margin, because
markup converts to margin with `markup / (1 + markup)` and 45/145 is 31%.

That identity is right when the number you marked up is your whole cost. In
staffing it is not: you mark up the **pay rate**, and FICA, federal and state
unemployment tax, workers' compensation, PTO accrual, benefits, screening and
payroll admin all sit outside it.

On the worked example the page opens with — $22 an hour, 40 hours for 13 weeks,
3% SUTA on a $12,000 base, a $6.20/$100 comp code, net-45 at a 12% cost of
capital:

| | |
|---|---|
| Margin the markup implies | 31.0% |
| Margin the placement earns | **15.8%** |
| Markup that breaks even | 21.9% |
| Markup for a 20% margin | **52.6%** |

So the 45% widely repeated as a healthy staffing markup does not reach a 20%
gross margin on this placement, and the figure an owner is being told is off by
nearly half.

## Three things it models that a markup rule of thumb cannot

- **Capped unemployment taxes.** FUTA and SUTA are charged on a wage base, not
  proportionally, so `calc.mjs` charges `min(wages, wageBase)` rather than a
  flat percentage. A 13-week placement therefore carries $385 of the annual
  charge and a 52-week one only $402 — 74¢ an hour against 19¢. Nothing needs
  to ask "is this a short assignment?"; the effect falls out of the arithmetic.
- **The workers' comp class code.** Quoted per $100 of payroll, near $1 for
  clerical and past $12 for framing. One house markup across a mixed desk takes
  the profit from the light codes and spends it on the heavy ones, and that
  nets out invisibly in a monthly P&L. Most states also let an agency strip the
  overtime *premium* out of comp payroll; that is a checkbox, because a few do
  not.
- **The cost of funding payroll.** You pay weekly and collect on net-45. The
  cost of capital is applied to the loaded cost — the money actually spent, not
  the invoice — across the days you wait. On the example that is $202 of a
  $2,626 profit, and it appears in no markup quote anywhere.

## Privacy

Pay rates, markups, comp rates and computed margins never leave the device and
never appear in a usage count. The optional counter records only which feature
was used and the day, in this browser's own storage, and disables itself for
browsers sending Do Not Track or Global Privacy Control.

## What it is not

Not legal, tax, accounting, insurance, or employment advice. It makes no
determination about worker classification, which comp class code applies to a
job, co-employment, or overtime exemption, and the rates and wage bases it
starts with are illustrative and change every year. The disclaimer is on both
published pages and `platform/pages/clauses.mjs` checks it stays there.

## Tests

`calc.test.mjs` checks the arithmetic against hand-computed figures and asserts
the inverses hold — the break-even markup returns exactly zero profit and the
target markup returns exactly the target margin, both by recalculating rather
than by trusting the closed form. `page.test.mjs` recomputes every figure the
copy quotes and fails if a sentence and the calculator disagree, which is the
staleness this repository keeps paying for elsewhere.
