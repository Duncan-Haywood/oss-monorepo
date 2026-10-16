# Bonus Take-Home and Gross-Up Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/bonus-take-home-gross-up-calculator/>

A free browser tool for anyone paid a bonus, and for managers and small-business owners who
pay one. Enter the bonus, wages already paid this year, the federal and state withholding
rates and your real bracket. It shows the check after supplemental withholding, Social
Security (with the wage-base cap), Medicare and the Additional Medicare Tax, the refund or
balance due at filing, the effect of putting part in a 401(k), the employer's total cost,
and the gross bonus needed to leave a target amount net. Entirely client-side.

After using this, you can **see what a bonus really pays, whether the withholding was too
high or too low, and what gross to offer to deliver a promised net amount**.

## Try it

Open [`index.html`](index.html) and click **Work out the bonus**.

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies. Income tax is withheld on the bonus
less any 401(k) deferral at the flat rates you enter; Social Security applies only up to the
wage base given wages already paid; Medicare applies to the whole bonus; Additional Medicare
applies to wages above its threshold. The settlement compares withholding with the tax at your
marginal rates. The gross-up is solved exactly (bisection on a monotonic net function) and
checked against the forward calculation in the tests.

## Limits

Defaults are placeholders. The aggregate withholding method, W-4 effects, state-specific
supplemental rules, local taxes, credits and phase-outs, and 401(k) limits are not modelled.
It is not tax or payroll advice.

## Tests

`node --test`
