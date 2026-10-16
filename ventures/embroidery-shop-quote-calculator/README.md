# Embroidery Shop Quote Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/embroidery-shop-quote-calculator/>

A flat price per 1000 stitches ignores digitizing, setup, color changes and hooping, so it quietly loses money on
small runs. Enter an embroidery job and your machine, and see the per-piece price that hits your target margin,
the true cost and clock time, a quantity-break table (12, 24, 48, 100, 250), how price moves with stitch count,
whether the flat per-1000-stitches rule loses money at low quantities, and a take / counter / pass verdict at
your lowest acceptable hourly rate. Browser page or zero-dependency CLI.

```
node cli.mjs quote fixtures/jobs.csv --heads 2 --spm 650 --margin 40 --min-charge 75 --min-hourly 35
node cli.mjs quote --quantity 24 --garment-cost 4.5 --stitches 7500 --colors 4 --json
cat jobs.csv | node cli.mjs quote - --flat-per-1000 1
```

Input: rows of `name,quantity,garment_cost,stitches,colors,digitizing_fee[,offer_per_piece]` (see
`fixtures/jobs.csv`); the shop's machine, labor, overhead and pricing numbers are flags (`node cli.mjs --help`).

## How it decides

Clock minutes = job setup + color setup x colors + ceil(pieces / heads) x minutes per hoop + pieces x hooping
minutes, where a hoop runs stitches / (rated stitches per minute x real efficiency) plus the thread changes.
Cost = garments + thread and backing per 1000 stitches + labor and machine overhead for the clock hours +
digitizing. Quote = cost / (1 - target margin), at least the minimum charge, plus any rush surcharge, rounded up to
the cent per piece. Money is held in integer cents; the tests check the clock time against a hoop-by-hoop replay
and the per-piece price against a search for the smallest whole-cent price that reaches the margin.

Effective hourly rate is what is left of the price per clock hour after garments, thread, overhead and digitizing
are paid, before you pay yourself. If an offered price falls below your floor, the verdict names the price that
reaches it.

## What it is not

Not a forecast: it prices a job from numbers you supply. Hooping is assumed to happen while the machine is
stopped, with one operator. Bobbin changes, hoop-burn rejects and re-stitches are not modelled. Not financial,
tax or legal advice, no warranty. You remain responsible for every quote and order you accept.

## Privacy

No network call, no account, no analytics vendor. The browser page computes locally and never uploads anything.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
