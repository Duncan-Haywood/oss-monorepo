# ifta-quarterly-fuel-tax-calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/ifta-quarterly-fuel-tax-calculator/>

A browser worksheet for small motor carriers and owner-operators who file their
own **IFTA quarterly fuel tax return**. It works the jurisdiction schedule the
way the return works it, and gets right the one line hand-built spreadsheets
reliably get wrong.

Everything runs in the visitor's browser. No account, no network requests, no
build step, no dependencies.

- [`index.html`](index.html) — the worksheet
- [`how-to-calculate-ifta-quarterly-tax.html`](how-to-calculate-ifta-quarterly-tax.html)
  — the question people search, worked line by line
- [`calc.mjs`](calc.mjs) — every figure, as pure functions
- [`usage.mjs`](usage.mjs) — an anonymous, opt-out, local-only counter

```
node --test          # 49 assertions across calc, pages and usage
```

Open `index.html` in a browser to use it — there is no build step.

## The mistake it exists to catch

Indiana, Kentucky and Virginia collect part of their diesel tax as a
**surcharge on the return** rather than at the pump. It has two properties that
the rest of the return does not:

- it is charged on **taxable gallons** — the fuel you burned in the state — not
  on net taxable gallons; and
- **nothing is credited against it.** Fuel you bought in the state reduced the
  tax line. It does not touch this one.

Treat it as one more rate to be netted against a fuel credit and the return
comes out short. On the quarter the page opens with — two trucks, five
jurisdictions, 29,320 miles on 3,890 gallons:

| | |
|---|---|
| Fuel tax across five jurisdictions | **credit of $91.53** |
| Surcharge, charged correctly | $570.90 |
| Surcharge, netted like an ordinary rate | $242.48 |
| **What the return actually owes** | **$479.37** |
| **Understated by netting** | **$328.42** |

A carrier reading only the tax line files a refund claim on a quarter that owes
four hundred and seventy-nine dollars.

## The other three rules it keeps

**One fleet MPG, fleet-wide.** Taxable gallons in Illinois are Illinois taxable
miles over the average MPG of the whole fleet across the whole quarter — never
the gallons bought in Illinois, and never a per-jurisdiction MPG. Computing one
per jurisdiction is the most common way a spreadsheet produces figures that look
reasonable and reconcile to nothing.

**That MPG is rounded to two decimals before it is used.** The return carries
two places and every gallon figure descends from the rounded value. A worksheet
keeping full precision disagrees with the filed return by a few dollars per
jurisdiction — small, and exactly the kind of unexplainable variance that
lengthens an audit.

**Interest on a late return is per jurisdiction.** It accrues to each
jurisdiction you owe, at one twelfth of the annual rate per month or part
month, and a credit due back from somewhere else does not offset it. A return
that nets to a refund can still carry interest; the worksheet computes it on
the rows in debit alone and says so when that case arises.

## Why it ships no rate table

Rates change every quarter across 58 jurisdictions, and some change mid-quarter.
A table baked in here would be stale within weeks and stale in the worst
possible place — a filed tax return. So rates are inputs, taken from the
official IFTA rate table for the quarter being filed, and the page says as much
wherever a rate is asked for.

This is the same reasoning as the annual interest rate, which is also an input.

## The checks it runs

Transcription is where returns actually go wrong, so the worksheet flags what
an auditor would ask about:

| flag | what it means |
|---|---|
| `implausible-mpg` | fleet MPG outside 3–12; usually a jurisdiction left out, miles and gallons in the wrong columns, or litres entered as gallons |
| `fuel-without-miles` | fuel bought in a jurisdiction with no recorded miles — a standard audit query |
| `zero-rate` | taxable miles at a rate of zero, which looks on the page exactly like a jurisdiction already dealt with |
| `surcharge-not-credited` | a fuel credit in a surcharge jurisdiction, where the surcharge is still owed in full |
| `interest-despite-credit` | a return netting to a refund that still owes interest |
| `single-jurisdiction` | one jurisdiction only, which may not need an IFTA return — a question for the base jurisdiction |

None of them stops the arithmetic. They are things to check before filing, not
determinations.

## What it is not

**No warranty.** This free tool is not legal, tax, accounting, or financial
advice, and **it is not a filing** — it files nothing and transmits nothing. It
makes no determination about what your base jurisdiction requires, which miles
any jurisdiction exempts, whether your vehicle is qualified, what rate applies
to your fuel type, or what you owe. Your base jurisdiction assesses the return.
Verify every figure against your own trip and fuel records, the official IFTA
rate table for the quarter you are filing, and a qualified tax professional
before you file from it. To the maximum extent permitted by law, the authors
accept no liability for loss or damage from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. We do not promise uptime,
backups of anything you type, or that a URL will keep working. Do not use this
as a system of record. If a tool needs to survive, export your inputs and run it
yourself.

**Nothing leaves your browser.** Your mileage, fuel purchases, jurisdictions and
the figures worked out here are never uploaded and never appear in a usage
count — those are anonymous tallies of which features were used, stored locally,
and switched off automatically for browsers sending Do Not Track or Global
Privacy Control.

## Nearby tools

- [owner-operator-cpm-calculator](../owner-operator-cpm-calculator/) — what a
  mile costs before you quote it
- [freight-accessorial-auditor](../freight-accessorial-auditor/) — whether an
  accessorial on an invoice was billed correctly
- [gig-driver-net-pay-calculator](../gig-driver-net-pay-calculator/) — for
  driving under someone else's authority
