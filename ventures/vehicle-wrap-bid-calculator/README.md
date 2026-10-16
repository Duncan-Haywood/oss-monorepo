# Vehicle Wrap Bid Calculator

Independent vehicle wrap and graphics shops (one or a few install bays, not a
large fleet-branding contractor) can use this free browser-local calculator
to price a full or partial vehicle wrap — from waste-inclusive material
square footage, install complexity, and labor — and see exactly what a quote
priced from the vehicle's bare surface area loses per job.
**After using this, you can quote a wrap on what the roll actually costs to
cover the vehicle and know before you send the estimate whether a
bare-surface-area quote is quietly eating your margin, which used to take a
bad month to notice.**

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/vehicle-wrap-bid-calculator/

Open `index.html` directly, or serve this directory with
`python3 -m http.server`. The deterministic calculation works with no
account, API key, upload, or paid dependency.

## Why the vehicle's surface area and the roll's material use are two different numbers

A wrap coverage chart or a tape measure gives the vehicle's bare surface
area — but vinyl is bought and consumed by the linear foot off a 60"
roll, and the customer's vehicle shape decides how much of that roll gets
wasted, not the shop:

- **The material bill is driven by what actually leaves the roll.** Cutting
  around mirrors, door handles, pillars, window trim, and compound curves
  wastes a real share of every roll — typically 15-30% depending on vehicle
  shape. Pricing material at the bare surface area quotes the vehicle, not
  the roll.
- **A flat installed rate per square foot hides the same problem on the
  labor side.** A box truck panel installs close to a shop's baseline
  square-foot-per-hour rate; a sedan or SUV with curves and hardware does
  not. The complexity multiplier keeps that difference visible in the labor
  line instead of averaging it away.
- **The actual roll usage is the only source of truth.** The calculator's
  waste-factor estimate is a planning number; the "check actual roll usage"
  section recomputes real profit once the job is cut and installed, the same
  way a proposed price gets checked against a breakeven in the portfolio's
  other job-pricing calculators.

The waste-blind loss is the sharpest number here: it tells a shop pricing
material at the bare surface area exactly how many dollars this specific job
is short of what it really costs to cover the vehicle — before the estimate
goes out, not after the roll runs low mid-install.

## Save and share a quote

The calculator, and the proposal panel's deposit and payment terms, save to
this browser's local storage as you type, so a quote is still here on your
next visit — "Start a fresh quote" clears it. "Copy bid link" puts the same
numbers in a URL fragment (never a query string, so it never reaches a server
log) that you can send yourself or a partner; opening it reopens the exact
quote, deposit and terms included, instead of the shop's defaults.

## Privacy and usage

Everything runs in your browser. Your job details, prices, and roll usage
are never uploaded and there is no account. The quote and the client-facing
proposal terms above are saved only to this browser's own local storage or
carried in a link you choose to copy — never sent anywhere. We count
anonymous local feature events only (`quote-priced`, `material-check-run`),
with a visible opt-out. Do Not Track and Global Privacy Control disable
counting automatically. No job details, prices, or material amounts are
recorded. The counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not tax, financial, or business advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

This calculator produces arithmetic observations from numbers you supply. It
does not audit your books, verify a vehicle's actual surface area, predict
real roll waste, or replace your own supplier quote, insurance, or
accountant.

MIT licensed. See `LICENSE`.
