# Dryer Vent Bid Calculator

A free browser calculator for dryer-vent techs. It prices a wall-cap,
roof-cap, or multi-dryer clean the way the trade actually loses money
— the included one-story wall cap, then the extra story, the extra
feet of duct, extra dryers, a rooftop termination, a camera pass,
crushed flex, a nest, and occupied-home access as their own hours —
and shows the margin before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/dryer-vent-bid-calculator -p 8080
# Run the tests
cd ventures/dryer-vent-bid-calculator && node --test
```

## The problem it solves

Small vent shops are told to bid a published $99 dryer-vent special, or
by a flat house price. That rule cannot see the access extras. A
one-story wall cap with eight feet of pipe is not the same job as a
two-story roof cap with a 28-foot run and a camera pass. The word
"dryer vent" is the same. The hours are not. Matching a cheaper
wall-cap quote written for the brochure ranch is how a sold roof job
becomes a loss after the first extra story.

HVAC-maintenance calculators price filter, coil, and a seasonal visit.
Chimney-sweep calculators price flue, creosote, and a CSIA sweep.
Kitchen-hood calculators price a restaurant canopy and a rooftop fan.
Appliance-repair calculators price the machine. None of those price a
dryer-vent clean.

After using this, you can now send a cleaning price that already
includes extra stories, extra feet, and roof-cap hours, which used to
take a guess from a published special.

## How it works

1. **Included wall cap.** A 1-story, 8 ft include is not a 2-story,
   28 ft roof cap. Extra stories and extra feet over the include are
   their own hours.
2. **Access as its own hours.** Extra stories and extra run do not
   scale with "a dryer vent is a dryer vent."
3. **Service extras.** Extra dryers, a camera pass, crushed-flex
   replacement, a nest, and occupied-home access are billed as their
   own hours and kits.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a tech sanity-checks a bid against:
price per dryer, effective hourly billing rate, the hour split, and
the **walk-away price** — total cost, below which the job makes
nothing. Entering a price already on the table scores it against the
same cost base. **Copy bid summary** turns the result into a
plain-text draft with wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job and job-type presets ship with common ballpark hours
and kit figures. **They are not an industry standard, a fire-code
determination, or a clearance certificate.** Changing job type never
overwrites a rate the tech has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `dryer-vent-bid-usage` — never the
address, wages, costs, or prices. It is opt-out from the footer, and it is
skipped automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the tech enters their own numbers.
- One laundry area. A whole-building commercial stack, a concealed
  chase rebuild, or a dryer-booster install is not priced as a package.
- Roof safety is one kit line; a county fall-protection form is the
  tech's choice of permit, not a second model.
- Starting hours are ballpark figures, not timed from a named crew.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not fire-safety, building-code,
construction, appliance, legal, tax, or financial advice, and it does
not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for
meeting any obligation it helps you prepare for. To the maximum extent
permitted by law, the authors accept no liability for any loss or
damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
