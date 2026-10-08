# Mineral Royalty Offer Calculator

A free browser tool for oil and gas mineral and royalty owners who have received an unsolicited
lump-sum offer. Type your average monthly royalty check, first-year decline, curve shape and
terminal decline, a possible new well, and the offer. It returns what the checks are worth at your
own discount rate, the annual return the buyer earns at the offered price, the offer as months of
income and per net mineral acre, how much rests on a well not yet drilled, an after-tax comparison
(with percentage depletion) and a discount-rate by price-level grid. Entirely client-side.

After using this, you can **see whether a mineral buyout pays what your royalty checks are worth**,
instead of judging it by a months-of-income multiple the buyer chose.

## Try it

Open [`index.html`](index.html) and click **Evaluate the offer**.

## The model

[`calc.mjs`](calc.mjs), pure functions. Monthly checks follow a modified Arps curve (hyperbolic
decline from your first-year rate and exponent b, switching to exponential at your terminal rate);
price drift compounds yearly; the well is shut in below a floor. A possible new well is added at its
probability-weighted value. Present value discounts monthly at your annual effective rate; the
buyer's return is the IRR at which the checks equal the offer (bisection).

## Limits

Defaults are placeholders, not a real property. No well data, no market prices, no title or deed
analysis, no lease terms. Not legal, tax or financial advice.

## Tests

`node --test`
