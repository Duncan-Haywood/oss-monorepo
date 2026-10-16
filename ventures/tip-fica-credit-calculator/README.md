# Tip Credit Calculator: Employer FICA Credit (Form 8846 / Section 45B)

A free browser tool for restaurants, bars, delivery businesses and beauty salons. Paste one
line per employee (cash wage per hour, hours, tips reported) and it returns the employer FICA
tip credit per person and in total, the tips that earn nothing because they only top the wage
up to the $5.15 baseline, the Social Security wage-base cap, the after-tax value once the wage
deduction is reduced by the credit, and a rough look-back for unclaimed years. Entirely
client-side.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/tip-fica-credit-calculator/

After using this, you can **see whether the credit is worth chasing and for which employees**
before handing the roster to a preparer.

## Try it

Open [`index.html`](index.html) and click **Work out the credit**.

## The model

[`calc.mjs`](calc.mjs), pure functions. Per employee: top-up = max(0, 5.15 - cash wage) x hours;
credit-earning tips = tips - top-up (never below zero); credit = 6.2% of the credit-earning tips
that sit under the Social Security wage base plus 1.45% of all credit-earning tips. The top-up
is taken first and uses wage base first, the cautious reading. After-tax value = credit x
(1 - income tax rate).

## Limits

Defaults are placeholders. Eligibility, whether tips were properly reported, service charges,
the general business credit limit and carryovers, wage-base changes by year and state rules are
not modelled. Not tax advice; have a CPA check the figures before filing.

## Tests

`node --test`
