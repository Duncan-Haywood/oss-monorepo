# Irrigation Winterization Bid Calculator

A free browser calculator for irrigation contractors. It prices a sprinkler
blowout / winterization stop the way the trade actually loses money when they
skip it — spray, rotor, and drip zones at their own minutes, then the backflow
drain-and-insulate, the compressor setup, and the drive — and shows the margin
before the price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/irrigation-winterization-bid-calculator/

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/irrigation-winterization-bid-calculator -p 8080
# Run the tests
cd ventures/irrigation-winterization-bid-calculator && node --test
```

After using this, you can now quote a winterization stop from zone types,
backflow time, and the drive instead of a $75 or $8-a-zone guess, which used
to take a spreadsheet and still missed the drip laterals.

## The problem it solves

Small irrigation crews are told to bid a flat blowout or a price per zone.
That rule cannot see the job. A ten-zone house with two drip laterals and a
backflow to drain is not the same stop as a four-zone front yard. Drip needs a
longer, lower-pressure purge; a backflow is a drain-and-insulate; ten miles
one way is half an hour before the compressor hooks up. A neighborhood special
of $75 on that house is often below the walk-away once loaded labor,
compressor fuel, and the round trip are counted.

The second thing that sinks these bids is treating travel and setup as free.
The trailer still had to leave the yard. A two-zone bed that “only takes
twenty minutes” still required the insurance, the fittings, and the drive.

## How it works

1. **Per-system blowout hours.** Each row is a controller with spray, rotor,
   and drip zone counts. Hours = zones × minutes for that head type ÷ 60.
   Drip minutes are higher on purpose — a flat per-zone price cannot see that.
2. **Backflow that is not “included.”** Each device adds drain-and-insulate
   minutes. A freeze-warning / after-hours call premiums labor, not the
   compressor.
3. **Loaded labor and the drive.** Hourly wage × (1 + payroll burden %). Miles
   are a round trip. If on-site time lands under the minimum, the minimum
   applies.
4. **Overhead, then margin as a share of price.** Overhead marks up direct
   cost. Price = cost ÷ (1 − target margin %).
5. **Sanity numbers.** Price per zone, effective hourly rate, and the
   **walk-away price** (total cost). A price already on the table is scored
   against the same cost base. **Copy quote summary** and **Copy share link**
   turn the result into a draft or a URL that keeps drip zones, backflows,
   and margin.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Minutes-per-zone figures

The system types ship with common ballpark spray / rotor / drip minutes as a
starting point. **They are not a winterization specification, a manufacturer
procedure, or a guarantee.** Real time depends on main size, valve location,
and how dry the owner wants the laterals. Every minute figure is editable,
and picking a system type never overwrites zone counts the contractor has
already changed.

This tool does not tell you how to drain a backflow or whether a system is
ready for freeze. That stays with the contractor.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `irrigation-winterization-bid-usage` — never the
address, wages, costs, or prices. It is opt-out from the footer, and it is
skipped automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, or engineering
advice, and it does not replace a qualified professional. It is not a
winterization specification, a backflow procedure, or a finding that any
system is ready for freeze. **You are responsible for reviewing and verifying
its output before relying on it**, and for meeting any obligation it helps
you prepare for. To the maximum extent permitted by law, the authors accept
no liability for any loss or damage arising from its use.
