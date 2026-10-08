# Oil & Gas Mineral Rights Offer Calculator

A free browser tool for mineral and royalty owners who have received an unsolicited lump-sum offer
for their future oil and gas royalties. Type the monthly royalty, yearly production decline, price
change, any not-yet-drilled well and the offer. It returns what the royalties are worth at your own
discount rate, the annual return the buyer earns at the offered price, how much of the price rests on
a well that does not exist yet, the offer that would match your rate, an after-tax comparison and a
discount-rate by decline grid. Entirely client-side.

After using this, you can **see whether a mineral rights offer pays you what the royalties are
worth**, instead of guessing from a multiple of last year's checks.

## Try it

Open [`index.html`](index.html) and click **Evaluate the offer**.

## The model

[`calc.mjs`](calc.mjs), pure functions. Yearly royalties fall by the decline and move with the price
change; a not-yet-drilled well starts in the year you type, weighted by the chance you give it. The
offer buys years 1..N of that stream. Present value discounts at your rate; the buyer's return is
the IRR at which the stream equals the offer (bisection). Tax is a typed rate on offer minus basis
versus a typed rate on royalties.

## Limits

Defaults are placeholders, not a real royalty interest. Year-end payments, constant decline and
price change; no reserve estimate, no decline-curve fitting, no deed, title or lien analysis, no
market pricing data. Not legal, tax or financial advice.

## Tests

`node --test`
