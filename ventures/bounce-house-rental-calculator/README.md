# bounce-house-rental-calculator

A browser calculator for independent bounce house / inflatable party rental
companies. It prices a booking the way the flat "per unit per day" rate sheet
in this trade never does — from the truck's two round trips, the crew's
setup and teardown minutes, a generator when the site has no outlet, a paid
attendant for a water slide or dunk tank, and general-liability insurance
sized to the fleet actually deployed, not to the quote.

Everything runs in the visitor's browser. No account, no network requests, no
build step, no dependencies.

- [`index.html`](index.html) — the calculator
- [`how-much-to-charge-for-a-bounce-house-rental.html`](how-much-to-charge-for-a-bounce-house-rental.html)
  — the question people search, worked through
- [`calc.mjs`](calc.mjs) — every figure, as pure functions
- [`usage.mjs`](usage.mjs) — an anonymous, opt-out, local-only counter

```
node --test          # calc, pages and usage assertions
```

Open `index.html` in a browser to use it — there is no build step.

## The mistake it exists to catch

A rate sheet built as a number per unit per day prices the equipment. It does
not price the booking. On the worked example the page opens with — two
standard bounce houses at $150/day, one water slide at $275/day, one event
day — that flat rate looks like **$737.18**. The real walk-away price is
**$1,228.08**, because the flat rate never counted:

| Cost the flat rate misses | Amount |
|---|---|
| Setup & teardown labor (2 crew × 4 hours) | $80.00 |
| Haul: delivery, pickup, two round trips at 12 miles | $170.00 |
| Generator | $65.00 |
| Water-slide attendant (5 hours) | $90.00 |
| Insurance on $7,400 of deployed fleet value | $92.50 |
| Consumables (stakes, tarps, fuel) | $24.00 |

Quoting the flat rate loses **$490.90** against the walk-away price before the
business keeps a cent.

## What it reports

- **The walk-away price** — total cost, below which the booking loses money —
  and the **quoted price** at your own target margin.
- **A full cost breakdown**: rental, setup/teardown labor, haul (mileage is
  charged as two round trips — one to deliver, one to pick up, even on a
  same-day booking), generator, wet-unit attendant, fleet-value insurance,
  consumables, and overhead.
- **A margin check against a price you're already considering**, flagging
  whether it clears the walk-away price and by how much.
- **A missing-attendant flag** when a water slide or dunk tank is quoted with
  zero attendant hours budgeted — a check against your own liability policy,
  not a legal determination.

## What it will not do

It will not tell you whether your municipality or your insurer requires an
attendant for a wet unit, what insurance coverage to carry, or what to
charge. Those are questions for your policy, your local ordinance, and a
qualified professional — this tool is arithmetic on the figures you type.

*After using this, you can price a booking from the truck, the crew, the
generator, the attendant and your insurance instead of a flat unit rate,
which used to mean finding out the job lost money after the deposit was
already spent.*

## Privacy and usage

Everything runs in your browser. Your fleet, rates, labor cost, and the price
worked out from them are never uploaded, and there are no accounts, cookies,
tracking pixels, or analytics vendor. Unless you opt out, the page stores an
event name and the day in this site's own local storage — never a figure,
never an identifier. Do Not Track and Global Privacy Control switch it off
automatically.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, tax, financial, or insurance
advice, and it does not replace a qualified professional. It does not tell
you what to charge, whether an attendant is legally required, or what
insurance coverage to carry. **You are responsible for reviewing and
verifying its output before relying on it**, and for meeting any obligation
it helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

## Support

Free and open source under an MIT licence.
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and
never changes what the tool does.
