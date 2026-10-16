# Workers' Comp Premium Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/workers-comp-premium-calculator/>

A free browser calculator that rebuilds a small employer's workers'
compensation premium from the class-code rates on their own quote, and shows
what a final audit will add or return. Entirely client-side; nothing is
uploaded.

After using this, you can now **see exactly which line of your quote (mod,
schedule debit, expense constant, a dominant class) is driving the premium,
and what an audit will cost before it arrives** — which used to mean one
opaque number from a broker.

## Why this exists

Workers' comp premium is arithmetic every small employer is charged and few
can reproduce: `payroll / 100 × rate` per class, times the experience mod,
adjusted by a discretionary schedule credit or debit, less any premium
discount, plus flat charges. The policy is written on *estimated* payroll, so
a growing business is billed the difference at audit. Carrier calculators
gate a quote behind a lead form; this one works from numbers you already hold.

Design choice worth knowing: **no rate table ships at all.** Rates differ by
state, carrier and year, so the user types them from their own declarations
page. That removes the one way this tool could be stale.

## Try it

Open [`index.html`](index.html), enter payroll and a rate per class, and
click **Calculate premium**. Add actual payroll to see the audit true-up.

## What it calculates

All in [`calc.mjs`](calc.mjs), pure functions, no dependencies:

- `overtimeExclusion` — the premium portion of overtime wages, `(m−1)/m`.
- `classPremium`, `policyPremium` — manual premium through to total.
- `modSensitivity` — dollars per 0.10 of experience mod.
- `auditTrueUp` — additional or returned premium on actual payroll.
- `reclassImpact` — premium change if the same payroll sat in another class.
- `findings` — plain-language flags.

## Tests

```
node --test ventures/workers-comp-premium-calculator/
```

Hand-counted figures for every step, overtime exclusion, audit direction,
input validation and no-network assertions.

## Limits

Not insurance, legal, tax or financial advice. No class-code or rate lookup,
no experience-mod computation from claims, no state rule engine (premium
discount tables, owner-officer rules, deductible programs, minimum premiums).
Your carrier's quote and audit control. MIT licensed.
