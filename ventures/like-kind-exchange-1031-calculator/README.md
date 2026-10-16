# 1031 Exchange Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/like-kind-exchange-1031-calculator/>

A free browser calculator for Section 1031 like-kind exchanges of real
property held for investment or business use. Nothing is uploaded.

After using this, you can now **see your 45-day and 180-day dates, the boot
that would be taxed, the gain you defer, your new basis and the tax deferred**
— which used to mean a spreadsheet, a call to an intermediary and a CPA's
billable hour before you could even decide what to bid.

## Try it

Open [`index.html`](index.html), click **Load an example**, then replace the
numbers with your own.

## What it calculates (`calc.mjs`, pure functions, no dependencies)

- `exchangeDeadlines` — identification (day 45) and closing (day 180) dates
  from the sale closing date, weekday, days remaining, and whether the
  return due date for the year of the sale would cut the 180 days short.
- `exchangeOutcome` — amount realized, adjusted basis, realized gain, net
  equity, cash boot, mortgage boot (debt relief netted only against cash you
  add), recognized and deferred gain, replacement basis, and estimated tax
  with and without the exchange at rates you type (unrecaptured §1250 gain
  is taxed first, up to depreciation taken — an assumption, stated).
- `identificationCheck` — three-property, 200% and 95% rules.

## Limits, stated

Federal rules only; the rates are typed by the user; personal property,
reverse and improvement exchanges, related-party rules and state clawbacks
are not modelled. Rules were written from published IRS guidance and have
**not** been reviewed by a tax professional. Not tax advice. See the page.

## Tests

`node --test`
