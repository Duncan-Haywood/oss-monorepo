# Mobile Bartender Event Quote

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/mobile-bartender-event-quote/>

Price a mobile bar / bartending event from guests, hours, bartenders, drinks, supplies, travel and
insurance: get the staffing, the drinks to stock, a walk-away floor, the price per guest at your
target margin, a three-way comparison of full bar / beer and wine / service only, and a check of
what a client's "$X a head" ask nets you.

```
node cli.mjs --guests 120 --hours 5 --bartender-rate 32 --client Acme
node cli.mjs --guests 120 --ask 28          # exit 1 when the per-head ask loses money
node cli.mjs --guests 120 --max-price 4000  # exit 1 when the quote exceeds the cap
node cli.mjs --guests 120 --compare
```

Browser version: `index.html` (nothing is uploaded).

## Method

Drinks = guests x (2 first hour + 1.2 per later hour). Bartenders = ceil(guests / guests-per-bartender).
Each bartender is paid for the bar hours plus setup, subject to a call minimum. Cost = staffing +
alcohol + mixers/ice/cups + travel + insurance/permit; price = cost / (1 - target margin).

## What it is not

Planning arithmetic from the numbers you enter. Not a licence, server-certification, liability
insurance or liquor-law determination, and not legal, tax or accounting advice.

## Privacy

No network call, no account, no analytics vendor.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any
> kind. It is not financial advice; verify its output before relying on it.
> **Best-effort hosting, no SLA.**
