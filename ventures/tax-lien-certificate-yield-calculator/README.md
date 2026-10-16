# Tax Lien Certificate Yield Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/tax-lien-certificate-yield-calculator/>

A free browser tool for people who buy county tax lien certificates. Type the interest rule from
the sale terms (simple annual, percent per month, or percent per six-month period, with any cap or
minimum), the certificate face, premium, fees and the later taxes you expect to pay. It returns
interest and annualized yield for each redemption month, the expected result with your own
redemption chance, and the parcel value you need to break even if you end up foreclosing.
Entirely client-side.

After using this, you can **see what a certificate actually returns, month by month, and what the
parcel has to be worth if nobody redeems**, which used to mean a spreadsheet per county.

## Try it

Open [`index.html`](index.html) and click **Work out the return**.

## The model

[`calc.mjs`](calc.mjs), pure functions. Interest on face follows the rule you pick, then the cap
and floor. Later taxes earn the same rule from the month paid. Premium is returned without
interest or lost, as you choose. Unredeemed: parcel value minus foreclosure costs minus everything
paid in.

## Limits

No state table is embedded: county terms vary and change, so the defaults are placeholders, not a
county's rules. Taxes on the interest, bankruptcy stays, senior and federal liens, environmental
and code liabilities, mortgage-holder redemption and deed timelines are not modelled. It does not
value property or recommend a purchase.

## Tests

`node --test`
