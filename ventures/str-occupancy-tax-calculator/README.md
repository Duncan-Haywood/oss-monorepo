# str-occupancy-tax-calculator

A browser calculator for short-term rental hosts that splits one stay's
**occupancy tax** into what a platform (Airbnb, Vrbo) already collects and
what is left for the host to remit directly, layer by layer.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/str-occupancy-tax-calculator/

Everything runs in the visitor's browser. No account, no network requests, no
build step, no dependencies.

- [`index.html`](index.html) — the calculator
- [`vs-tracking-it-in-a-spreadsheet.html`](vs-tracking-it-in-a-spreadsheet.html)
  — the layer a hand-built sheet is most likely to drop
- [`calc.mjs`](calc.mjs) — every figure, as pure functions
- [`usage.mjs`](usage.mjs) — an anonymous, opt-out, local-only counter
- [`share.mjs`](share.mjs) — saves a stay to this browser and to a shareable link

```
node --test          # 46 assertions across calc, pages, usage and share
```

Open `index.html` in a browser to use it — there is no build step.

## The mistake it exists to catch

A platform's occupancy-tax collection agreement is set **per taxing
authority**, not per platform. A host who reads "Airbnb collects and remits
occupancy tax" and stops there can miss that the agreement covers the state
layer and not the county or city layer sitting on top of it. Nothing on a
payout statement flags the gap — it only ever nets fees, never taxes it never
touched.

On the stay this calculator opens with — $250 a night, four nights, a $150
cleaning fee, taxed at a 6% state rate and a 5% county rate:

| | |
|---|---|
| Taxable base | $1,150.00 |
| Total occupancy tax | **$126.50** |
| Platform collects (state layer) | $69.00 |
| **Host must remit directly (county layer)** | **$57.50** |

That $57.50 is owed on every stay at this rate, whether or not the host ever
checked which layer the platform's agreement actually covers.

## Why it ships no rate table

Occupancy tax rates are set per state, per county, per city, and sometimes per
special district. They change, and a table baked into a free tool would be
stale in the one place that is expensive to be wrong — a filed remittance. So
every rate, and every "platform collects" percentage, is an input the host
supplies from the taxing authority's own guidance and the platform's own tax
pages for that specific address. This is the same reasoning the IFTA quarterly
fuel tax calculator elsewhere in this portfolio applies to fuel-tax rates.

## What it is not

**No warranty.** This free tool is not legal, tax, accounting, or financial
advice, and it is not a filing. It makes no determination about which taxing
authorities apply to a specific listing, what a platform's current collection
agreements cover, or what a host owes. Verify every figure against each
taxing authority's own guidance, the platform's tax pages for that specific
address, and a qualified tax professional before relying on it. To the
maximum extent permitted by law, the authors accept no liability for any loss
or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. Do not use this as a
system of record.

**Nothing leaves your browser.** A stay's rates and figures are never
uploaded and never appear in a usage count — those are anonymous tallies of
which features were used, stored locally, and switched off automatically for
browsers sending Do Not Track or Global Privacy Control.

## Nearby tools

- [str-host-payout-calculator](../str-host-payout-calculator/) — compares
  payout fees across Airbnb, Vrbo, and direct booking for the same stay
