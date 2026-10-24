# Dumpster Rental Margin Calculator

Independent roll-off dumpster rental operators (a truck or two and a handful
of containers, not a full waste-hauling fleet) can use this free
browser-local calculator to price one rental — from the included weight
allowance, tipping fee, driver labor, mileage, and equipment cost — check
whether the overage rate actually covers what an extra ton costs to dispose
of, and plug in the real scale ticket once the container comes back.
**After using this, you can quote a rental on what the allowance actually
costs to cover and know before you send the quote whether your overage fee
protects your margin or quietly erodes it, which used to take a guess at the
scale house.**

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/dumpster-rental-margin-calculator/

Open `index.html` directly, or serve this directory with
`python3 -m http.server`. The deterministic calculation works with no
account, API key, upload, or paid dependency.

## Why the rental price and the overage fee are two separate pricing problems

A roll-off rental is quoted once, up front — a container size, an included
weight allowance, and a rental period — but disposal is billed by the ton at
the transfer station once the container actually comes back, and the
customer's own fill decides the weight, not the operator:

- **The base rental price only has to cover the allowance.** Pricing it from
  an optimistic weight guess instead double-counts disposal cost that should
  be billed separately as overage.
- **The overage fee is a second price, with its own cost floor.** It has to
  clear the tipping fee per ton, not just look reasonable next to what a
  competitor advertises — a rate set below the tipping fee loses money on
  every ton over the allowance, worst on the heaviest jobs (shingle
  tear-offs, concrete, wet dirt) where the most overage tons pile up.
- **The scale ticket is the only source of truth.** The calculator's
  "expected weight" section is a planning estimate; the "check a real scale
  ticket" section recomputes the actual profit once the real number exists,
  the same way a proposed price gets checked against a breakeven in the
  portfolio's other job-pricing calculators.

The overage-rate check is the sharpest number here: `maxOverageTonsBeforeLoss`
tells an operator whose overage fee is priced below their own tipping fee
exactly how many overage tons on this specific rental would erase its entire
built-in profit — before quoting the job, not after the scale ticket arrives.

## Privacy and usage

Everything runs in your browser. Your job details, prices, and scale tickets
are never uploaded, there is no account, and nothing is saved when you close
the tab — every field resets on refresh by design. We count anonymous local
feature events only (`quote-priced`, `weight-ticket-checked`), with a visible
opt-out. Do Not Track and Global Privacy Control disable counting
automatically. No job details, prices, or weights are recorded. The counter
is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not tax, financial, or business advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

This calculator produces arithmetic observations from numbers you supply. It
does not audit your books, verify a rental or disposal agreement, predict
actual load weight, or replace your own contract, insurance, or accountant.

MIT licensed. See `LICENSE`.
