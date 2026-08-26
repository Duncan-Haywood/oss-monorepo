# Water Softener Bid Calculator

A free browser calculator for plumbing and water-treatment shops. It prices
a water-softener install the way the trade actually loses money — extra
pipe past the included run, copper versus PEX, an iron filter or
under-sink RO, the brine drain, haul-away of the old unit, and a brine
receptacle as their own hours — and shows the margin before the price
goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/water-softener-bid-calculator -p 8080
# Run the tests
cd ventures/water-softener-bid-calculator && node --test
```

## The problem it solves

Small plumbing shops are told to bid by a published "$799 installed"
water-softener special, or by a coupon-site hang price. That rule cannot
see the house extras. A 32k PEX garage hang with ten included feet is
not the same job as a 64k copper cut-in with an iron filter, a 40-foot
brine drain, haul-away of the old unit, and a brine-tank receptacle.
The trip is the same. The hours are not. Matching a cheaper special
written for the brochure garage hang is how a sold copper-and-iron job
becomes a half-day loss after the first soldered cut-in.

Well-pump calculators price drop-pipe footage, a pitless, and a VFD.
Water-heater calculators price a vent, a gas upsize, and an attic.
Septic-pumping calculators price a tank lid, a hose, and extra gallons.
None of those price a water-treatment install.

After using this, you can now send a water-softener price that already
includes extra pipe, copper, iron, and haul-away hours, which used to
take a guess from a published special.

## How it works

1. **Grain capacity and system.** A 32k salt/resin hang is not a 64k
   unit and a salt-free TAC unit does not need a brine drain.
2. **Footage past the included run.** The special includes a stated
   number of feet. Everything past that is billed as its own hours. A
   shorter hang than the included footage still prices — extra footage
   is zero, not an error.
3. **Copper versus PEX as their own hours.** A PEX crimp is not a
   soldered copper cut-in. Iron, RO, haul-away, and a brine receptacle
   are not blended into the trip.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a shop sanity-checks a bid against: price
per foot of pipe, effective hourly billing rate, the hour split, and
the **walk-away price** — total cost, below which the job makes
nothing. Entering a price already on the table scores it against the
same cost base. **Copy bid summary** turns the result into a
plain-text draft with wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job, capacity, system, work, and pipe presets ship with common
ballpark hours and material figures. **They are not an industry
standard, a water-quality report, or a treatment specification.**
Changing capacity, system, work, or pipe never overwrites a rate the
shop has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `water-softener-bid-usage` — never the house, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the shop enters their own numbers.
- One softener / one trip. A whole-house re-pipe, a well-treatment
  train, or a commercial boiler feed is not priced as a package.
- Grain capacity is one unit cost each; twin-tank, metered versus
  timed, and brand are the shop's choice of rate, not a second model.
- Starting hours are ballpark figures, not timed from a named crew.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not plumbing, water-treatment,
construction, legal, tax, or financial advice, and it does not replace a
qualified professional. **You are responsible for reviewing and verifying
its output before relying on it**, and for meeting any obligation it helps
you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
