# Estate Sale Net Proceeds Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/estate-sale-net-proceeds-calculator/>

A free browser tool for families evaluating estate sale company quotes. Enter
a company's actual tiered commission schedule and flat fees — setup/staging,
credit-card processing, haul-away/donation for unsold items — against an
estimated gross sale total to see the real net proceeds, apply an optional
minimum guarantee, and compare two companies' quotes side by side against the
same sale estimate. Nothing is uploaded; the arithmetic runs on the visitor's
own device.

See [`vs-headline-commission-rate.html`](vs-headline-commission-rate.html)
for why the lower headline rate can retain more, or
[`why-estate-sale-fees-bite-harder-on-a-smaller-sale.html`](why-estate-sale-fees-bite-harder-on-a-smaller-sale.html)
for why the same flat fee stack takes a bigger share of a smaller estate.

```
cd ventures/estate-sale-net-proceeds-calculator && node --test
```

Open `index.html` in a browser to use it — there is no build step.

## Why it exists

Estate sale companies almost never quote one flat commission rate. A typical
schedule looks like "40% on the first $2,000 of sales, 30% on the next
$6,000, 25% above that," plus separate fees a headline percentage doesn't
include — a setup/staging fee to price and display items, a pass-through for
credit-card processing, and a haul-away or donation fee for whatever doesn't
sell. A family gathering quotes from two or three companies (the standard
advice from estate-liquidation trade guidance) is comparing different tier
schedules and different fee stacks against the same estimated sale total,
which "we charge 30%" hides.

This tool applies each company's actual schedule — not an average or a
headline number — to the same estimated gross sale, and puts two quotes next
to each other so the family can see which one nets more before signing
anything.

## What it does not do

- It is not legal, tax, financial, or estate-planning advice, and it does not
  replace a qualified professional or the company's own written contract.
- It does not look up, verify, or vouch for any real estate sale company's
  pricing — every number comes from what the visitor types in from their own
  quotes.
- It does not account for taxes on proceeds from the estate, which depend on
  factors this tool has no visibility into.
- A minimum guarantee is applied exactly as entered; whether it is actually a
  binding contract term is a question for the contract, not this calculator.

## Privacy

Every number — the estimated sale total, both companies' commission rates
and fees, and the computed settlements — is processed entirely in the
visitor's browser and never uploaded. The optional local usage counter
records only which features were used and the day, stored in the browser's
own local storage, with a visible opt-out and honoring Do Not
Track/Global Privacy Control browser signals.

## License

MIT — see [`LICENSE`](./LICENSE). Free and open source; a
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) link is
present in the footer and entirely optional.
