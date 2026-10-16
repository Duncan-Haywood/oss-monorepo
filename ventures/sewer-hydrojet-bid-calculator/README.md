# Hydro-Jet and Sewer Camera Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/sewer-hydrojet-bid-calculator/>

A free browser calculator for drain-cleaning and plumbing shops. It prices
a sewer camera inspection or hydro-jet the way the trade actually loses
money — extra footage past the included run, cleanout versus toilet pull
versus a new cleanout, roots and grease, hose distance from the truck,
and the camera warranty pass as their own hours — and shows the margin
before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/sewer-hydrojet-bid-calculator -p 8080
# Run the tests
cd ventures/sewer-hydrojet-bid-calculator && node --test
```

## The problem it solves

Small drain shops are told to bid by a published "$149 drain special,"
or by a coupon-site hydro-jet price. That rule cannot see the line
extras. A 50-foot kitchen cable from an existing cleanout is not the
same job as a 140-foot main with a toilet pull, roots at the street,
150 feet of hose from the truck, and a camera warranty pass. The trip
is the same. The hours are not. Matching a cheaper special written for
the brochure cleanout is how a sold main-line jet becomes a two-hour
loss after the first toilet pull.

Septic-pumping calculators price a tank lid, a hose, and extra gallons.
Water-heater calculators price a vent, a gas upsize, and an attic.
Kitchen-hood calculators price a canopy and a rooftop fan. Dryer-vent
calculators price a lint run and a roof cap. None of those price a
sewer or drain line.

After using this, you can now send a camera or hydro-jet price that
already includes extra footage, access, and condition hours, which used
to take a guess from a published special.

## How it works

1. **Work type.** A camera inspection is not a cable special and a
   cable special is not a hydro-jet. Combo jobs bill both the jet and
   the camera pass.
2. **Footage past the included run.** The trip includes a stated number
   of feet. Everything past that is billed as its own hours.
3. **Access as its own hours.** An existing cleanout is free access. A
   toilet pull, a new cleanout, and a roof vent are not.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a shop sanity-checks a bid against: price
per foot of line, effective hourly billing rate, the hour split, and
the **walk-away price** — total cost, below which the job makes
nothing. Entering a price already on the table scores it against the
same cost base. **Copy bid summary** turns the result into a
plain-text draft with wages omitted, ready to paste into a proposal.
**Copy share link** encodes the whole takeoff — every rate, the work
type, access, line, and the deposit/terms from the proposal panel — into
a URL fragment a shop can send to an office manager, a second tech, or
the customer; nothing is uploaded, and opening the link reopens the same
bid instead of the form's defaults. See [`share.mjs`](share.mjs).

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job, work-type, and access presets ship with common ballpark hours
and material figures. **They are not an industry standard, a plumbing
specification, or a building-code determination.** Changing work type
or access never overwrites a rate the shop has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `sewer-hydrojet-bid-usage` — never the house, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`, `share_link_copied`.

## Limitations

- Single currency and no tax handling; the shop enters their own numbers.
- One trip / one primary line. A whole-house re-pipe, a sewer replacement,
  or a septic-tank job is not priced as a package.
- Camera versus hydro-jet versus cable is one rate each; combination
  nozzles and locator time are the shop's choice of rate, not a second
  model.
- Starting hours are ballpark figures, not timed from a named crew.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not plumbing, construction, legal,
tax, or financial advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its
output before relying on it**, and for meeting any obligation it helps
you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
