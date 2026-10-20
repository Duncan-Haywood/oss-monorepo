# Structured Settlement Buyout Calculator

A free browser tool for anyone offered cash for structured settlement or annuity payments. Type the
monthly payment and how many are left, up to two lump sums and when they are due, the cash offered and
the fees. It returns the yearly discount rate the buyer earns, cents on the dollar, what the payments are
worth at a rate you call fair, and what the same payments would fetch at other rates, as a counter-offer
range. Entirely client-side.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/structured-settlement-buyout-calculator/

After using this, you can **see the interest rate hidden in a factoring offer** and shop it, instead of
comparing two dollar figures.

## Try it

Open [`index.html`](index.html) and click **Find the rate**.

## The model

[`calc.mjs`](calc.mjs), pure functions. Monthly payments fall on months 1..n with an optional yearly
step-up; lump sums fall on typed month offsets. Present value discounts each payment at an effective
annual rate; the implied rate is found by bisection on the net cash (offer minus fees).

## Limits

Defaults are placeholders, not a real offer. Every payment is treated as certain (no life-contingent
payments), no tax, no state court-approval rules. Not legal, tax or financial advice.
